
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

      checkBmaNodeAliveCounter++;
      if (checkBmaNodeAliveCounter > 3)  throw 'ERROR.CHECK_NETWORK_CONNECTION'; // Avoid infinite loop

      api.start.raise.message('NETWORK.INFO.CONNECTING_TO_NETWORK');

      var timeout = csSettings.data.expertMode && csSettings.data.timeout > 0 ? csSettings.data.timeout : Device.network.timeout();
      return BMA.filterAliveNodes(csSettings.data.fallbackNodes, timeout)
        .then(function (fallbackNodes) {
          if (!fallbackNodes.length) throw 'ERROR.CHECK_NETWORK_CONNECTION';
          return _.sample(fallbackNodes); // Random select
        })
        .then(function(fallbackNode) {

          return fallbackNode;
        })
        .then(function (fallbackNode) {
          if (!fallbackNode) return; // Skip

          console.info("[platform] Switching to fallback node: {0}".format(fallbackNode.server));
          var node = {
            host: fallbackNode.host,
            port: fallbackNode.port,
            path: fallbackNode.path,
            useSsl: fallbackNode.useSsl
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

      console.info('[platform] Checking peer [{0}] is well synchronized...'.format(BMA.server));
      api.start.raise.message('NETWORK.INFO.ANALYZING_NETWORK');

      var askUserConfirmation = csSettings.data.expertMode;
      var minConsensusPeerCount = csSettings.data.minConsensusPeerCount || -1;

      return csNetwork.getSynchronizedBmaPeers(BMA, {autoRefresh: false})
        .then(function(peers) {

          var consensusBlockNumber = peers.length ? peers[0].currentNumber : undefined;
          var consensusPeerCount = peers.length;

          // Not enough peers on main consensus (e.g. an isolated peer). Should never occur.
          if (!consensusPeerCount || (minConsensusPeerCount > 0 && consensusPeerCount < minConsensusPeerCount)) {
            console.warn("[platform] Not enough BMA peers on the main consensus block: {0} found. Will peek another peer...".format(consensusPeerCount));
            // Retry using another fallback peer
            return checkBmaNodeAlive(false)
              .then(checkBmaNodeSynchronized); // Loop
          }

          // Filter on compatible peers
          peers = peers.reduce(function(res, peer) {
            if (!peer.compatible) return res;
            // Serialize to JSON, then append
            return res.concat(peer.toJSON());
          }, []);

          console.info("[platform] Keep {0}/{1} BMA peers, synchronized and compatible, in {2}ms".format(peers.length, consensusPeerCount, Date.now() - now));

          // Try to find the current peer in synchronized peers
          var synchronized = false;
          peers = _.filter(peers, function(peer) {
            if (BMA.url !== peer.url) return true;
            synchronized = true;
            return false;
          });

          // Saving others peers to settings
          csSettings.savePeers(peers);

          // OK (current BMA node is sync and compatible): continue
          if (synchronized) {
            console.info("[platform] Default peer [{0}{1}] is eligible.".format(BMA.server, BMA.path));
            return true;
          }

          // Peer is not well synchronized: checking its current block
          console.warn("[platform] Default peer [{0}{1}] is NOT on the consensus block #{2}. Checking its current block...".format(
            BMA.server,
            BMA.path,
            consensusBlockNumber));
          return csCurrency.blockchain.current() // Use currency, to fill the cache
            .catch(function() {
              return {number: 0};
            })
            .then(function(block) {
              // OK: only few blocks late, so we keep it
              if (Math.abs(block.number - consensusBlockNumber) <= 2) {
                console.info("[platform] Keep default peer [{0}{1}] anyway, because current block #{2} closed to the consensus block".format(
                  BMA.server,
                  BMA.path,
                  block.number));
                return true;
              }

              // No eligible peer to peek
              if (!peers.length) {
                console.warn("[platform] Not enough BMA peers compatible with Cesium: {0} found. Will peek another peer...".format(peers.length));
                // Retry using another fallback peer
                return checkBmaNodeAlive(false)
                  .then(checkBmaNodeSynchronized); // Loop
              }

              // KO: peek another peer
              var randomSynchronizedPeer = _.sample(peers);

              return randomSynchronizedPeer;
            })
            .then(function(node) {
              if (node === true) return true;
              if (!node) {
                return selectBmaNode();
              }

              console.info("[platform] Switching to synchronized fallback peer [{0}:{1}]".format(node.host, node.port));

              // Only change BMA node in settings
              angular.merge(csSettings.data.node, {
                host: node.host,
                port: node.port,
                path: node.path,
                useSsl: node.useSsl,
                temporary: askUserConfirmation ? true : undefined // Mark as temporary
              });

              return BMA.copy(node);
            });
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

    function restart(startDelayMs) {
      console.debug('[platform] Restarting ...');
      return stop()
        .then(function () {
          if (startDelayMs === 0) return start();
          return $timeout(start, startDelayMs || 200);
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
      if (!started && !startPromise) return $q.when();
      removeListeners();

      return $q.all([
        csWallet.stop({emitEvent: false}),
        csCurrency.stop({emitEvent: false}),
        BMA.stop()
      ])
      .then(function() {
        return $timeout(function() {
          enableChangeState();
          started = false;
          startPromise = null;
        }, 200);
      });

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
