
angular.module('cesium.platform', ['ngIdle', 'cesium.config', 'cesium.services'])

  // Translation i18n
  .config(function ($translateProvider, csConfig) {
    'ngInject';

    $translateProvider
      .uniformLanguageTag('bcp47')
      .determinePreferredLanguage()
      // Cela fait bugger les placeholder (pb d'affichage des accents en FR)
      //.useSanitizeValueStrategy('sanitize')
      .useSanitizeValueStrategy(null)
      .fallbackLanguage([csConfig.fallbackLanguage ? csConfig.fallbackLanguage : 'en'])
      .useLoaderCache(true);
  })

  .config(function($httpProvider, csConfig) {
    'ngInject';

    // Set default timeout
    $httpProvider.defaults.timeout = !!csConfig.timeout ? csConfig.timeout : 300000 /* default timeout */;

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];

    // removeIf(no-device)
    // Group http request response processing (better performance when many request)
    $httpProvider.useApplyAsync(true);
    // endRemoveIf(no-device)
  })

  .config(function($compileProvider, csConfig) {
    'ngInject';

    $compileProvider.debugInfoEnabled(csConfig.debug === true);

    // Fix issue #893
    // See https://stackoverflow.com/questions/31859257/firefox-addon-using-angularjs-ng-src-not-working
    $compileProvider.imgSrcSanitizationWhitelist(/^\s*(filesystem:resource|resource|moz-extension|chrome-extension|file|data):/);
  })

  .config(function($animateProvider) {
    'ngInject';

    $animateProvider.classNameFilter( /\banimate-/ );
  })

  // Configure cache (used by HTTP requests) default options
  .config(function (CacheFactoryProvider, csConfig) {
    'ngInject';

    angular.extend(CacheFactoryProvider.defaults, {
      // Fixed options:
      recycleFreq: 60 * 1000, // Scan expired items every 1min
      storagePrefix: 'caches.', // Override storage key prefix
      capacity: 100, // Force to use a LRU cache, to avoid size exceed max

      // Options overwritten by the csCache service:
      maxAge: csConfig.cacheTimeMs || 60 * 1000, // from config if exists, or 1min
      storageMode: 'memory' // Do NOT use local Storage by default
    });
  })

  // Configure screen size detection
  .config(function(screenmatchConfigProvider) {
    'ngInject';

    screenmatchConfigProvider.config.rules = 'bootstrap';
  })

  .config(function($ionicConfigProvider) {
    'ngInject';

    // JS scrolling need for iOs (see http://blog.ionic.io/native-scrolling-in-ionic-a-tale-in-rhyme/)
    var enableJsScrolling = ionic.Platform.isIOS();
    $ionicConfigProvider.scrolling.jsScrolling(enableJsScrolling);

    // Configure the view cache
    $ionicConfigProvider.views.maxCache(5);
  })

  .config(function(IdleProvider, csConfig) {
    'ngInject';

    IdleProvider.idle(csConfig.logoutIdle||10*60/*10min*/);
    IdleProvider.timeout(csConfig.logoutTimeout||15); // display warning during 15s
  })

  .factory('$exceptionHandler', function($log) {
    'ngInject';

    return function(exception, cause) {
      if (cause) $log.error(exception, cause);
      else $log.error(exception);
    };
  })


  .factory('csPlatform', function (ionicReady, $rootScope, $q, $state, $translate, $timeout, $ionicHistory, $window,
                                   UIUtils, Modals, BMA, Device, Api,
                                   csHttp, csConfig, csCache, csSettings, csNetwork, csCurrency, csWallet) {

    'ngInject';
    var
      checkBmaNodeAliveCounter = 0,
      started = false,
      startPromise,
      listeners = [],
      removeChangeStateListener,
      api = new Api(this, 'csPlatform')
    ;

    // Fix csConfig values
    csConfig.demo = csConfig.demo === true || csConfig.demo === 'true' || false;
    csConfig.readonly = csConfig.readonly === true || csConfig.readonly === 'true' || false;

    function disableChangeState() {
      if (removeChangeStateListener) return; // make sure to call this once

      var remove = $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
        if (!event.defaultPrevented && next.name !== 'app.home' && next.name !== 'app.settings') {
          event.preventDefault();
          if (startPromise) {
            startPromise.then(function () {
              $state.go(next.name, nextParams);
            });
          } else {
            UIUtils.loading.hide();
          }
        }
      });

      // store remove listener function
      removeChangeStateListener = remove;
    }

    function enableChangeState() {
      if (removeChangeStateListener) removeChangeStateListener();
      removeChangeStateListener = null;
    }

    // Alert user if node not reached
    function checkBmaNodeAlive(alive) {
      if (alive) return true; // Ok, current node is alive

      var askUserConfirmation = checkBmaNodeAliveCounter === 0 && csSettings.data.expertMode;
      checkBmaNodeAliveCounter++;
      if (checkBmaNodeAliveCounter > 3)  throw 'ERROR.CHECK_NETWORK_CONNECTION'; // Avoid infinite loop

      api.start.raise.message('NETWORK.INFO.CONNECTING_TO_NETWORK');

      var timeout = csSettings.data.expertMode && csSettings.data.timeout > 0 ? csSettings.data.timeout : Device.network.timeout();
      return BMA.filterAliveNodes(csSettings.data.fallbackNodes, timeout)
        .then(function (fallbackNodes) {
          if (!fallbackNodes.length) throw 'ERROR.CHECK_NETWORK_CONNECTION';
          return _.sample(fallbackNodes); // Random select
        })
        .then(function (fallbackNode) {

          // Ask user before using the fallback node
          if (askUserConfirmation) {
            return askUseFallbackNode(fallbackNode);
          }

          return fallbackNode;
        })
        .then(function (fallbackNode) {
          if (!fallbackNode) return; // Skip

          console.info("[platform] Switching to fallback node: {0}".format(fallbackNode.server));
          var node = {
            host: fallbackNode.host,
            port: fallbackNode.port,
            path: fallbackNode.path,
            useSsl: fallbackNode.useSsl,
          };
          csSettings.data.node = node;
          csSettings.data.node.temporary = true;

          csHttp.cache.clear();

          // loop
          return BMA.copy(fallbackNode)
            .then(checkBmaNodeAlive);
        });
    }

    // Make sure the BMA node is synchronized (is on the main consensus block)
    function checkBmaNodeSynchronized(alive) {
      if (!alive) return false;
      var now = Date.now();

      console.info("[platform] Checking if node is synchronized...");
      api.start.raise.message('NETWORK.INFO.ANALYZING_NETWORK');

      var askUserConfirmation = csSettings.data.expertMode;

      return csNetwork.getSynchronizedBmaPeers(BMA)
        .then(function(peers) {

          if (!peers.length) return; // No peer found: exit

          // Not enough peers in network (isolated node). Should never occur. Make sure at least one known node exists
          if (peers.length < 10) {
            console.warn("[platform] Network scanned in {0}ms, only {1} peers (UP and synchronized) found. To few peers. Will peek another peer...".format(Date.now() - now, peers.length));
            // Retry using another peer
            return checkBmaNodeAlive(false)
              .then(checkBmaNodeSynchronized); // Loop
          }

          console.info("[platform] Network scanned in {0}ms, {1} peers (UP and synchronized) found".format(Date.now() - now, peers.length));

          // TODO: store sync peers in storage ?
          //csSettings.data.

          // Try to find the current peer in the list of synchronized peers
          var synchronized = _.some(peers, function(peer) {
            return BMA.node.same({
              host: peer.getHost(),
              port: peer.getPort(),
              path: peer.getPath(),
              useSsl: peer.isSsl()
            });
          });

          // OK (BMA node is sync): continue
          if (synchronized) {
            console.info("[platform] Default peer [{0}] is well synchronized.".format(BMA.server));
            return true;
          }

          // Peer is not well synchronized!
          var consensusBlockNumber = peers.length ? peers[0].currentNumber : undefined;
          console.warn("[platform] Default peer [{0}] not synchronized with consensus block #{1}".format(BMA.server, consensusBlockNumber));

          return csCurrency.blockchain.current()
            .then(function(block) {

              // Only one block late: keep current node
              if (Math.abs(block.number - consensusBlockNumber) <= 2) {
                console.info("[platform] Keep BMA node [{0}], as current block #{1} is closed to consensus block #{2}".format(BMA.server, block.number, consensusBlockNumber));
                return true;
              }

              var randomPeer = _.sample(peers);
              var synchronizedNode = new Peer({
                host: randomPeer.getHost(),
                port: randomPeer.getPort(),
                useSsl: randomPeer.isSsl(),
                path: randomPeer.getPath(),
                endpoints: randomPeer.endpoints
              });

              // If Expert mode: ask user to select a node
              if (askUserConfirmation) {
                return askUseFallbackNode(synchronizedNode, 'CONFIRM.USE_SYNC_FALLBACK_NODE');
              }

              return synchronizedNode;
            })
            .then(function(node) {
              if (node === true) return true;
              if (!node) {
                return selectBmaNode();
              }

              console.info("[platform] Switching to synchronized fallback peer {{0}:{1}}".format(node.host, node.port));

              // Only change BMA node in settings
              angular.merge(csSettings.data.node, node, {endpoints: undefined, temporary: true});

              return BMA.copy(node);
            });
        });
    }

    function askUseFallbackNode(fallbackNode, messageKey) {
      // Ask user to confirm, before switching to fallback node
      var server = fallbackNode.server || (typeof fallbackNode.getServer === 'function' ? fallbackNode.getServer() : new Peer(fallbackNode).getServer());

      server += fallbackNode.path || '';

      var confirmMsgParams = {old: BMA.server, new: server};

      // Force to show port/ssl, if this is the only difference
      if (confirmMsgParams.old === confirmMsgParams.new) {
        if (BMA.port != fallbackNode.port) {
          confirmMsgParams.new += ':' + fallbackNode.port;
        } else if (BMA.useSsl == false && (fallbackNode.useSsl || fallbackNode.port == 443)) {
          confirmMsgParams.new += ' (SSL)';
        }
      }

      messageKey = messageKey || 'CONFIRM.USE_FALLBACK_NODE';

      return $translate(messageKey, confirmMsgParams)
        .then(UIUtils.alert.confirm)
        .then(function (confirm) {
          if (!confirm) return; // Stop
          return fallbackNode;
        });
    }

    // User can select a node
    function selectBmaNode() {
      var parameters = {
        enableFilter: false,
        type: 'all',
        bma: true,
        expertMode: true
      };
      if ($window.location.protocol === 'https:') {
        parameters.ssl = true;
      }
      return Modals.showNetworkLookup(parameters)
        .then(function(peer) {
          if (!peer) return true; // User cancelled (= keep the default node)

          var node = {
            host: peer.getHost(),
            port: peer.getPort(),
            useSsl: peer.isSsl()
          };
          console.info("[platform] Selected peer:", node);

          // Only change BMA node in settings
          csSettings.data.node = node;

          // Add a marker, for UI
          csSettings.data.node.temporary = true;

          return BMA.copy(node);
        });
    }

    function isStarted() {
      return started;
    }

    function getLatestRelease() {
      var latestRelease = csSettings.data.latestReleaseUrl && csHttp.uri.parse(csSettings.data.latestReleaseUrl);
      if (latestRelease) {
        return csHttp.getWithCache(latestRelease.host, latestRelease.protocol === 'https:' ? 443 : latestRelease.port, "/" + latestRelease.pathname, undefined, csCache.constants.LONG)()
          .then(function (json) {
            if (json && json.name && json.tag_name && json.html_url) {
              return {
                version: json.name,
                url: json.html_url,
                isNewer: (csHttp.version.compare(csConfig.version, json.name) < 0)
              };
            }
          })
          .catch(function (err) {
            // silent (just log it)
            console.error('[platform] Failed to get Cesium latest version', err);
          })
          ;
      }
      return $q.when();
    }

    function addListeners() {
      // Listen if node changed
      listeners.push(
        BMA.api.node.on.restart($rootScope, restart, this)
      );
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function ready() {
      if (started) return $q.when();
      return startPromise || start();
    }

    function restart() {
      console.debug('[platform] restarting csPlatform');
      return stop()
        .then(function () {
          return $timeout(start, 200);
        });
    }

    function start() {

      // Avoid change state
      disableChangeState();

      api.start.raise.message('COMMON.LOADING');

      // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
      startPromise = ionicReady()

        .then($q.all([
          // Load device
          Device.ready(),

          // Start settings
          csSettings.ready()
        ]))

        // Load BMA
        .then(function() {
          checkBmaNodeAliveCounter = 0;
          return BMA.ready()
            .then(checkBmaNodeAlive)
            .then(checkBmaNodeSynchronized);
        })

        // Load currency
        .then(csCurrency.ready)

        // Trying to restore wallet
        .then(csWallet.ready)

        .then(function(){
          enableChangeState();
          addListeners();
          startPromise = null;
          started = true;

          api.start.raise.message(''); // Reset message
        })
        .catch(function(err) {
          startPromise = null;
          started = false;
          api.start.raise.message(''); // Reset message
          if ($state.current.name !== $rootScope.errorState) {
            $state.go($rootScope.errorState, {error: 'peer'});
          }
          throw err;
        });

      return startPromise;
    }

    function stop() {
      if (!started) return $q.when();
      removeListeners();

      csWallet.stop();
      csCurrency.stop();
      BMA.stop();

      return $timeout(function() {
        enableChangeState();
        started = false;
        startPromise = null;
      }, 500);
    }

    api.registerEvent('start', 'message');

    return  {
      disableChangeState: disableChangeState,
      isStarted: isStarted,
      ready: ready,
      restart: restart,
      start: start,
      stop: stop,
      version: {
        latest: getLatestRelease
      },
      api: api
    };
  })

  .run(function($rootScope, $state, $window, $urlRouter, ionicReady, $ionicPlatform, $ionicHistory,
                Device, UIUtils, $ionicConfig, PluginService, csPlatform, csWallet, csSettings, csConfig, csCurrency) {
    'ngInject';

    // Allow access to service data, from HTML templates
    $rootScope.config = csConfig;
    $rootScope.settings = csSettings.data;
    $rootScope.currency = csCurrency.data;
    $rootScope.device = Device;
    $rootScope.errorState = 'app.home';
    $rootScope.smallscreen = UIUtils.screen.isSmall();

    // Compute the root path
    var hashIndex = $window.location.href.indexOf('#');
    $rootScope.rootPath = (hashIndex !== -1) ? $window.location.href.substr(0, hashIndex) : $window.location.href;
    console.debug('[app] Root path is [' + $rootScope.rootPath + ']');

    // removeIf(device)
    // -- Automatic redirection to HTTPS
    if ((csConfig.httpsMode === true || csConfig.httpsMode === 'true' ||csConfig.httpsMode === 'force') &&
      $window.location.protocol !== 'https:') {
      $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
        var path = 'https' + $rootScope.rootPath.substr(4) + $state.href(next, nextParams);
        if (csConfig.httpsModeDebug) {
          console.debug('[app] [httpsMode] --- Should redirect to: ' + path);
          // continue
        }
        else {
          $window.location.href = path;
        }
      });
    }
    // endRemoveIf(device)

    // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
    ionicReady().then(function() {

      // Keyboard
      if (Device.keyboard.enable) {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        Device.keyboard.hideKeyboardAccessoryBar(true);

        // iOS: do not push header up when opening keyboard
        // (see http://ionicframework.com/docs/api/page/keyboard/)
        if (ionic.Platform.isIOS()) {
          Device.keyboard.disableScroll(true);
        }
      }

      // Ionic Platform Grade is not A, disabling views transitions
      if (ionic.Platform.grade.toLowerCase() !== 'a') {
        console.info('[app] Disabling UI effects, because platform\'s grade is {{0}}'.format(ionic.Platform.grade));
        UIUtils.setEffects(false);
      }

      // Status bar style
      if (window.StatusBar) {
        console.debug("[app] Status bar plugin enable");
      }

      // Get latest release
      csPlatform.version.latest()
        .then(function(release) {
          if (release && release.isNewer) {
            console.info('[app] New release detected [{0}]'.format(release.version));
            $rootScope.newRelease = release;
          }
          else {
            console.info('[app] Current version [{0}] is the latest release'.format(csConfig.version));
          }
        });

      // Prevent BACK button to exit without confirmation
      $ionicPlatform.registerBackButtonAction(function(event) {
        if ($ionicHistory.backView()) {
          return $ionicHistory.goBack();
        }

        event.preventDefault();
        return UIUtils.alert.confirm('CONFIRM.EXIT_APP')
          .then(function (confirm) {
            if (!confirm) return; // user cancelled
            ionic.Platform.exitApp();
          });
      }, 100);
    })
    // Make sure platform is started
    .then(csPlatform.ready)

    // Applying some settings
    .then(function(){
      // Applying UI effects, if now already disable (e.g. because of poor platform grade)
      if (UIUtils.motion.enable) {
        UIUtils.setEffects($rootScope.settings.uiEffects);
      }
    });
  })
;
