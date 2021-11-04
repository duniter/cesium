
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


  .factory('csPlatform', function (ionicReady, $rootScope, $q, $state, $translate, $timeout, $ionicHistory, UIUtils,
                                   BMA, Device, csHttp, csConfig, csCache, csSettings, csCurrency, csWallet) {

    'ngInject';
    var
      fallbackNodeIndex = 0,
      defaultSettingsNode,
      started = false,
      startPromise,
      listeners,
      removeChangeStateListener;

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

    // Alert user if node not reached - fix issue #
    function checkBmaNodeAlive(alive) {
      if (alive) return true;

      // Remember the default node
      defaultSettingsNode = defaultSettingsNode || csSettings.data.node;

      var fallbackNode = csSettings.data.fallbackNodes && fallbackNodeIndex < csSettings.data.fallbackNodes.length && csSettings.data.fallbackNodes[fallbackNodeIndex++];
      if (!fallbackNode) {
        throw 'ERROR.CHECK_NETWORK_CONNECTION';
      }
      var newServer = fallbackNode.host + ((!fallbackNode.port && fallbackNode.port != 80 && fallbackNode.port != 443) ? (':' + fallbackNode.port) : '');

      // Skip is same as actual node
      if (BMA.node.same(fallbackNode)) {
        console.debug('[platform] Skipping fallback node [{0}]: same as actual node'.format(newServer));
        return checkBmaNodeAlive(); // loop (= go to next node)
      }

      // Try to get summary
      return csHttp.get(fallbackNode.host, fallbackNode.port, '/node/summary', fallbackNode.port == 443 || BMA.node.forceUseSsl)()
        .catch(function (err) {
          console.error('[platform] Could not reach fallback node [{0}]: skipping'.format(newServer));
          // silent, but return no result (will loop to the next fallback node)
        })
        .then(function (res) {
          if (!res) return checkBmaNodeAlive(); // Loop

          // Force to show port/ssl, if this is the only difference
          var messageParam = {old: BMA.server, new: newServer};
          if (messageParam.old === messageParam.new) {
            if (BMA.port != fallbackNode.port) {
              messageParam.new += ':' + fallbackNode.port;
            } else if (BMA.useSsl == false && (fallbackNode.useSsl || fallbackNode.port == 443)) {
              messageParam.new += ' (SSL)';
            }
          }

          return $translate('CONFIRM.USE_FALLBACK_NODE', messageParam)
            .then(function (msg) {
              return UIUtils.alert.confirm(msg);
            })
            .then(function (confirm) {
              if (!confirm) return;

              // Only change BMA node in settings
              csSettings.data.node = fallbackNode;

              // Add a marker, for UI
              csSettings.data.node.temporary = true;

              csHttp.cache.clear();

              // loop
              return BMA.copy(fallbackNode)
                .then(checkBmaNodeAlive);
            });
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
      listeners = [
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];
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


      // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
      startPromise = ionicReady()

        .then($q.all([
          // Load device
          Device.ready(),

          // Start settings
          csSettings.ready()
        ]))

        // Load BMA
        .then(function(){
          return BMA.ready().then(checkBmaNodeAlive);
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
        })
        .catch(function(err) {
          startPromise = null;
          started = false;
          if($state.current.name !== $rootScope.errorState) {
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

    return  {
      disableChangeState: disableChangeState,
      isStarted: isStarted,
      ready: ready,
      restart: restart,
      start: start,
      stop: stop,
      version: {
        latest: getLatestRelease
      }
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
        console.info('[app] Disabling UI effects, because plateform\'s grade is [' + ionic.Platform.grade + ']');
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

      // Make sure platform is started
      return csPlatform.ready();
    });
  })
;

// Workaround to add "".startsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.debug("Adding String.prototype.startsWith() -> was missing on this platform");
  String.prototype.startsWith = function(prefix, position) {
    return this.indexOf(prefix, position) === 0;
  };
}

// Workaround to add "".startsWith() if not present
if (typeof String.prototype.trim !== 'function') {
  console.debug("Adding String.prototype.trim() -> was missing on this platform");
  // Make sure we trim BOM and NBSP
  var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  String.prototype.trim = function() {
    return this.replace(rtrim, '');
  };
}

// Workaround to add Math.trunc() if not present - fix #144
if (Math && typeof Math.trunc !== 'function') {
  console.debug("Adding Math.trunc() -> was missing on this platform");
  Math.trunc = function(number) {
    return parseInt((number - 0.5).toFixed());
  };
}

// Workaround to add "".format() if not present
if (typeof String.prototype.format !== 'function') {
  console.debug("Adding String.prototype.format() -> was missing on this platform");
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}
