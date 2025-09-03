angular.module('cesium.app.controllers', ['cesium.platform', 'cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/menu.html",
        controller: 'AppCtrl',
        data: {
          large: false
        }
      })

      .state('app.lock', {
        cache: false,
        url: "/lock",
        views: {
          menuContent: {
            templateUrl: "templates/common/view_passcode.html",
            controller: 'PassCodeCtrl'
          }
        }
      })
    ;

  })

  .controller('AppCtrl', AppController)

  .controller('PluginExtensionPointCtrl', PluginExtensionPointController)

;

/**
 * Useful controller that could be reuse in plugin, using $scope.extensionPoint for condition rendered in templates
 */
function PluginExtensionPointController($scope, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
}

/**
 * Abstract controller (inherited by other controllers)
 */
function AppController($scope, $rootScope, $state, $ionicSideMenuDelegate, $q, $timeout,
                       $ionicHistory, $controller, $window, csPlatform, csSettings, CryptoUtils, csCrypto,
                       UIUtils, BMA, csWallet, Device, Modals, csConfig, csHttp
) {
  'ngInject';

  $scope.walletData  = csWallet.data;
  $scope.search = {};
  $scope.login = csWallet.isLogin();
  $scope.auth = csWallet.isAuth();
  $scope.motion = UIUtils.motion.default;
  $scope.fullscreen = UIUtils.screen.fullscreen.isEnabled();

  $scope.showHome = function() {
    $ionicHistory.nextViewOptions({
      historyRoot: true
    });
    return $state.go('app.home')
      .then(UIUtils.loading.hide);
  };

  ////////////////////////////////////////
  // Show Help tour
  ////////////////////////////////////////

  $scope.createHelptipScope = function(isTour, ctrlName) {
    if (!isTour && ($rootScope.tour || !$rootScope.settings.helptip.enable || UIUtils.screen.isSmall())) {
      return; // avoid other helptip to be launched (e.g. csWallet)
    }
    ctrlName = ctrlName || 'HelpTipCtrl';
    // Create a new scope for the tour controller
    var helptipScope = $scope.$new();
    $controller(ctrlName, { '$scope': helptipScope});
    return helptipScope;
  };

  $scope.startHelpTour = function(event, skipClearCache) {
    if (event && event.defaultPrevented) return false; // Event stopped;

    $rootScope.tour = true; // to avoid other helptip to be launched (e.g. csWallet)

    // Clear cache history
    if (!skipClearCache) {
      $ionicHistory.clearHistory();
      return $ionicHistory.clearCache()
        .then(function() {
          $scope.startHelpTour(null, true/*continue*/);
        });
    }

    var helptipScope = $scope.createHelptipScope(true/*is tour*/);
    return helptipScope.startHelpTour()
      .then(function() {
        helptipScope.$destroy();
        delete $rootScope.tour;
      })
      .catch(function(err){
        delete $rootScope.tour;
      });
  };

  $scope.disableHelpTour = function(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (csSettings.data.helptip && csSettings.data.helptip.enable) {
      $rootScope.settings.helptip.enable = false;
      csSettings.store();
    }

  };

  ////////////////////////////////////////
  // Login & wallet
  ////////////////////////////////////////

  $scope.isLogin = function() {
    return $scope.login;
  };

  // Load wallet data (after login)
  $scope.loadWalletData = function(options) {

    console.warn("[app-controller] DEPRECATED  - Please use csWallet.load() instead of $scope.loadWalletData()", new Error());

    options = options || {};
    var wallet = options.wallet || csWallet;
    return wallet.loadData(options)

      .then(function(walletData) {
        // cancel login
        if (!walletData) throw 'CANCELLED';
        return walletData;
      });
  };

  // Login and load wallet
  $scope.loadWallet = function(options) {

    console.warn("[app-controller] DEPRECATED  - Please use csWallet.loginOrLoad() instead of $scope.loadWallet()", new Error());

    // Make sure the platform is ready
    if (!csPlatform.isStarted()) {
      return csPlatform.ready().then(function(){
        return $scope.loadWallet(options);
      });
    }

    options = options || {};

    var wallet = options.wallet || csWallet;

    // If need auth
    if (options.auth && !wallet.isAuth()) {
      return wallet.auth(options)
        .then(function (walletData) {
          if (walletData) return walletData;
          // failed to auth
          throw 'CANCELLED';
        });
    }

    // If need login
    else if (!wallet.isLogin()) {
      return wallet.login(options)
        .then(function (walletData) {
          if (walletData) return walletData;
          // failed to login
          throw 'CANCELLED';
        });
    }

    // Already login or auth
    else if (!wallet.isDataLoaded(options)) {
      return $scope.loadWalletData(options);
    }
    else {
      return $q.when(wallet.data);
    }
  };

  // Login and go to a state (or wallet if not)
  $scope.loginAndGo = function(state, options) {
    $scope.closeProfilePopover();
    options = options || {};
    var wallet = options.wallet || csWallet;
    delete options.wallet;

    state = state || 'app.view_wallet';

    if (!wallet.isLogin()) {

      // Make sure to protect login modal, if HTTPS enable - fix #340
      if (csConfig.httpsMode && $window.location && $window.location.protocol !== 'https:') {
        var href = $window.location.href;
        var hashIndex = href.indexOf('#');
        var rootPath = (hashIndex !== -1) ? href.substring(0, hashIndex) : href;
        rootPath = 'https' + rootPath.substring(4);
        href = rootPath + $state.href(state);
        if (csConfig.httpsModeDebug) {
          // Debug mode: just log, then continue
          console.debug('[httpsMode] --- Should redirect to: ' + href);
        }
        else {
          $window.location.href = href;
          return;
        }
      }

      return wallet.login(options)
        .then(function(){
          return $state.go(state, options);
        })
        .then(UIUtils.loading.hide);
    }
    else {
      return $state.go(state, options);
    }
  };

  // Logout
  $scope.logout = function(options) {
    options = options || {};
    var wallet = options.wallet || csWallet;
    if (!options.force && $scope.profilePopover) {
      // Make the popover if really closed, to avoid UI refresh on popover buttons
      return $scope.profilePopover.hide()
        .then(function(){
          options.force = true;
          return $scope.logout(options);
        });
    }
    if (options.askConfirm) {
      return UIUtils.alert.confirm('CONFIRM.LOGOUT')
        .then(function(confirm) {
          if (confirm) {
            options.askConfirm=false;
            return $scope.logout(options);
          }
        });
    }

    UIUtils.loading.show();
    return wallet.logout()
      .then(function() {
        // Close left menu if open
        if ($ionicSideMenuDelegate.isOpenLeft()) {
          $ionicSideMenuDelegate.toggleLeft();
        }

        // If default wallet: clear navigation history, then go back to home
        if (wallet.isDefault()) {
          $ionicHistory.clearHistory();

          return $ionicHistory.clearCache()
            .then(function() {
              return $scope.showHome();
            });
        }
        else {
          UIUtils.loading.hide(10);
        }
      })
      .catch(UIUtils.onError('ERROR.LOGOUT'));
  };
  // Do authentification
  $scope.doAuth = function(options) {
    var wallet = options && options.wallet || csWallet;
    return wallet.auth()
      .then(UIUtils.loading.hide);
  };

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return csWallet.isUserPubkey(pubkey);
  };

  // add listener on wallet event
  csWallet.api.data.on.login($scope, function(data, deferred) {
    $scope.login = true;
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.logout($scope, function() {
    $scope.login = false;
  });
  csWallet.api.data.on.auth($scope, function(data, deferred) {
    $scope.auth = true;
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.unauth($scope, function() {
    $scope.auth = false;
  });

  ////////////////////////////////////////
  // Useful modals
  ////////////////////////////////////////

  // Open transfer modal
  $scope.showTransferModal = function(parameters) {
    return Modals.showTransfer(parameters);
  };

  $scope.showAboutModal = function() {
    return Modals.showAbout();
  };

  $scope.showJoinModal = function() {
    $scope.closeProfilePopover();
    return Modals.showJoin();
  };

  $scope.showSettings = function() {
    $scope.closeProfilePopover();
    return $state.go('app.settings');
  };

  $scope.showHelpModal = function(parameters) {
    return Modals.showHelp(parameters);
  };

  ////////////////////////////////////////
  // Useful popovers
  ////////////////////////////////////////

  $scope.showProfilePopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl :'templates/common/popover_profile.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.profilePopover = popover;
        $timeout(function() {
          UIUtils.ink({selector: '#profile-popover .ink, #profile-popover .ink-dark'});
        }, 100);
      }
    });
  };

  $scope.closeProfilePopover = function() {
    if ($scope.profilePopover && $scope.profilePopover.isShown()) {
      $timeout(function(){$scope.profilePopover.hide();});
    }
  };

  // Change peer info
  $scope.showPeerInfoPopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl: 'templates/network/popover_peer_info.html',
      autoremove: true,
      scope: $scope.$new(true)
    });
  };

  ////////////////////////////////////////
  // Link management
  ////////////////////////////////////////

  // WARN: publish to root scope, to make sure popover (with new scope) can use it
  $rootScope.openLink = function($event, uri, options) {
    if ($event.defaultPrevented) return false;
    $event.stopPropagation();
    $event.preventDefault();

    // Read URL like '@UID' (Used by home page, in feed's author url)
    if (uri && uri.startsWith('@')) {
      var uid = uri.substring(1);
      if (BMA.regexp.USER_ID.test(uid)) {
        $state.go('app.wot_identity_uid', {uid: uid});
        return false;
      }
    }

    options = options || {};

    // If unable to open, just copy value
    options.onError = function() {
      return UIUtils.popover.copy($event, uri);
    };

    csHttp.uri.open(uri, options);

    return false;
  };

  /**
   * Parse an external URI (see g1lien), and open the expected state
   * @param uri
   * @param reject optional function, to avoid error to be displayed
   * @returns {*}
   */
  $scope.handleUri = function(uri, reject) {
    if (!uri) return $q.when(); // Skip

    console.info('[app] Trying to parse as uri: ', uri);
    var fromHomeState = $state.current && $state.current.name === 'app.home';

    return (!csPlatform.isStarted() ? csPlatform.ready() : $q.when())
      // Parse the URI
      .then(function() {
        return BMA.uri.parse(uri);
      })
      .then(function(res) {
        if (!res) throw {message: 'ERROR.UNKNOWN_URI_FORMAT'}; // Continue

        if (res.pubkey) {
          var action = res.params && (angular.isDefined(res.params.amount) || res.params.comment) ? 'transfer' : undefined;

          console.info('[app] Redirecting from URI to identity {{0}} {1} {2}'.format(
            res.pubkey.substring(0,8),
            action ? ('with action ' + action) : '',
            res.params ? JSON.stringify(res.params) : ''
          ), uri);

          // Redirect to an owned wallet
          if (!action && (csWallet.isUserPubkey(res.pubkey) || csWallet.children.hasPubkey(res.pubkey))) {
            var wallet = csWallet.getByPubkey(res.pubkey);
            return $state.go('app.view_wallet_by_id', {id: wallet.id});
          }
          else {
            return $state.go('app.wot_identity',
              angular.merge({
                pubkey: res.pubkey,
                action: action
              }, res.params),
              {reload: true});
          }
        }
        else if (res.uid) {
          return $state.go('app.wot_identity_uid',
            angular.merge({
              uid: res.uid,
              action: res.params && res.params.amount ? 'transfer' : undefined
            }, res.params),
            {reload: true});
        }
        else if (angular.isDefined(res.block)) {
          return $state.go('app.view_block',
            angular.merge(res.block, res.params),
            {reload: true});
        }
        // Default: wot lookup
        else {
          console.warn('[app] TODO implement state redirection from URI result: ', res, uri);
          return $state.go('app.wot_lookup.tab_search',
            {q: uri},
            {reload: true});
        }
      })

      // After state change
      .then(function() {
        if (fromHomeState) {
          // Wait 500ms, then remove /app/home?uri from the history
          // to make sure the back button will work fine
          return $timeout(function () {
            if ($ionicHistory.backView()) $ionicHistory.removeBackView();
          }, 500);
        }
      })

      .catch(function(err) {
        if (reject) {
          reject(err);
          return;
        }
        console.error("[home] Error while handle uri '{0}'".format(uri), JSON.stringify(err));
        return UIUtils.onError(uri)(err);
      });
  };

  /**
   * Try to parse as auth data (e.g. WIF/EWIF format)
   * @param data
   * @param reject optional function, to avoid error to be displayed
   * @returns {*}
   */
  $scope.handleAuthData = function(data, reject) {
    console.debug("[app] Trying to parse as a auth data (WIF, EWIF)...");

    return csCrypto.keyfile.parseData(data)
      .then(function (keypair) {
        if (!keypair || !keypair.signPk || !keypair.signSk) throw err; // rethrow the first error (e.g. Bad URI)

        var pubkey = CryptoUtils.base58.encode(keypair.signPk);
        console.debug("[app] Detected WIF/EWIF format. Will login to wallet {" + pubkey.substring(0, 8) + "}");

        // Create a new wallet (if default wallet is already used)
        var wallet = !csWallet.isLogin() ? csWallet : csWallet.children.create({store: false});

        // Login using keypair
        return wallet.login({
          silent: true,
          forceAuth: true,
          minData: false,
          authData: {
            pubkey: pubkey,
            keypair: keypair
          }
        })
          .then(function () {

            // Open transfer all wallet
            $ionicHistory.nextViewOptions({
              historyRoot: true
            });
            return $state.go('app.new_transfer', {
              all: true, // transfer all sources
              wallet: !wallet.isDefault() ? wallet.id : undefined
            });
          });
      })
      .catch(function(err) {
        if (reject) {
          reject(err);
          return;
        }
        console.error("[home] Error while handle auth data", err);
        return UIUtils.onError('ERROR.AUTH_INVALID_FILE')(err);
      });
  };

  $scope.registerProtocolHandlers = function() {
    // Protocol handlers are not supported in Chrome extensions
    if (window.chrome && chrome.runtime && chrome.runtime.id) {
      console.debug("Running as a browser extension, skipping protocol handler registration.");
      return;
    }

    var protocolHandlers = csConfig.protocolHandlers || {};
    var protocols = Object.keys(protocolHandlers);

    _.each(protocols, function(protocol) {
      console.debug("[app] Registering protocol '{0}'...".format(protocol));
      try {
        navigator.registerProtocolHandler(protocol, "#/app/home?uri=%s", "Cesium");
      }
      catch(err) {
        console.error("[app] Error while registering protocol '{0}'".format(protocol), err);
      }
    });
  };

  ////////////////////////////////////////
  // Layout Methods
  ////////////////////////////////////////
  $scope.showFab = function(id, timeout) {
    UIUtils.motion.toggleOn({selector: '#'+id + '.button-fab'}, timeout);
  };

  $scope.hideFab = function(id, timeout) {
    UIUtils.motion.toggleOff({selector: '#'+id + '.button-fab'}, timeout);
  };

  // Could be override by subclass
  $scope.doMotion = function(options) {
    return $scope.motion.show(options);
  };


  ////////////////////////////////////////
  // Fullscreen mode
  ////////////////////////////////////////

  $scope.askFullscreen = function() {
    var skip = $scope.fullscreen || !UIUtils.screen.isSmall() || !Device.isWeb();
    if (skip) return;

    // Already ask
    if (csSettings.data.useFullscreen === false) {
      $scope.toggleFullscreen(false);
      return;
    }

    // User already say 'yes' => need o ask again (chrome will avoid changed if no gesture has been done)
    //if (csSettings.data.useFullscreen === true) {
    //  $scope.toggleFullscreen(true);
    //  return;
    //}

    return UIUtils.alert.confirm('CONFIRM.FULLSCREEN', undefined, {
      cancelText: 'COMMON.BTN_NO',
      okText: 'COMMON.BTN_YES'
    })
      .then(function(confirm) {
        $scope.toggleFullscreen(confirm);
      });
  };

  $scope.toggleFullscreen = function(enable, options) {
    enable = angular.isDefined(enable) ? enable : !UIUtils.screen.fullscreen.isEnabled();

    $scope.fullscreen = enable;

    if (enable !== UIUtils.screen.fullscreen.isEnabled()) {
      UIUtils.screen.fullscreen.toggleAll();
    }

    // Save into settings
    if ((csSettings.data.useFullscreen !== enable) && (!options || options.emitEvent !== false)) {
      csSettings.data.useFullscreen = enable;
      return $timeout(csSettings.store, 2000);
    }
  };

  // removeIf(no-device)
  ////////////////////////////////////////
  // Device only methods
  // (code removed when NO device)
  ////////////////////////////////////////

  $scope.scanQrCodeAndGo = function() {

    if (!Device.barcode.enable) return;

    // Run scan cordova plugin, on device
    return Device.barcode.scan()
      .then(function(data) {
        if (!data) return;

        var throwIfError = function (err) {
          if (err) throw err;
        };

        // First, try to handle as an URI
        var firstError;
        return $scope.handleUri(data, throwIfError)

          // If failed
          .catch(function(e) {
            firstError = e;
            console.error("[app] Failed to parse as URI: " + (e && e.message || e));

            // Try as an auth data
            return $scope.handleAuthData(data, throwIfError);
          })

          // Both failed
          .catch(function(e) {
            // Log second error, then display the first error
            console.error("[app] Failed to parse as Auth data: " + (e && e.message || e));
            return UIUtils.onError('ERROR.SCAN_UNKNOWN_FORMAT')(firstError);
          });
      });
  };

  /**
   * Process launch intent, as it could have been triggered BEFORE addListeners()
   * @returns {*}
   */
  $scope.processLaunchUri = function() {
    return Device.intent.last()
      .then(function(intent) {
        if (intent) {
          Device.intent.clear();
          return $scope.handleUri(intent);
        }
      });
  };

  // Listen for new intent
  Device.api.intent.on.new($scope, $scope.handleUri);
  $scope.processLaunchUri();

  ////////////////////////////////////////
  // End of device only methods
  ////////////////////////////////////////
  // endRemoveIf(no-device)


  // removeIf(device)
  ////////////////////////////////////////
  // NOT-Device only methods (web or desktop)
  // (code removed when build for device - eg. Android, iOS)
  ////////////////////////////////////////

  // Ask switching fullscreen
  $scope.askFullscreen();

  // Register protocol handlers
  $scope.registerProtocolHandlers();

  ////////////////////////////////////////
  // End of NOT-device only methods
  ////////////////////////////////////////
  // endRemoveIf(device)
}
