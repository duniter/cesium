angular.module('cesium.app.controllers', ['ngIdle', 'cesium.platform', 'cesium.services'])

  .config(function($httpProvider) {
    'ngInject';

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

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

      .state('app.home', {
        url: "/home?error",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HomeCtrl'
          }
        }
      })

      .state('app.lock', {
        cache: false,
        url: "/lock",
        views: {
          'menuContent': {
            templateUrl: "templates/common/view_passcode.html",
            controller: 'PassCodeCtrl'
          }
        }
      })
    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('AutoLogoutCtrl', AutoLogoutController)

  .controller('AppCtrl', AppController)

  .controller('HomeCtrl', HomeController)

  .controller('PluginExtensionPointCtrl', PluginExtensionPointController)

  .controller('EmptyModalCtrl', EmptyModalController)

  .controller('AboutCtrl', AboutController)

  .controller('PassCodeCtrl', PassCodeController)

;


/**
 * Useful for modal with no controller (see Modal service)
 */
function EmptyModalController($scope, parameters) {

}

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
function AppController($scope, $rootScope, $state, $ionicSideMenuDelegate, $q, $timeout, $ionicPopover,
                       $ionicHistory, $controller, $window, csPlatform,
                       UIUtils, BMA, csWallet, csCurrency, Device, Modals, csSettings, csConfig
  ) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('AutoLogoutCtrl', {$scope: $scope}));

  $scope.search = {};
  $scope.login = csWallet.isLogin();
  $scope.motion = UIUtils.motion.default;

  $scope.showHome = function() {
    $ionicHistory.nextViewOptions({
      historyRoot: true
    });
    return $state.go('app.home')
      .then(UIUtils.loading.hide);
  };

  ////////////////////////////////////////
  // Device Methods
  ////////////////////////////////////////

  $scope.scanQrCodeAndGo = function() {
    if (!Device.barcode.enable) {
      return;
    }
    Device.barcode.scan()
    .then(function(uri) {
      if (!uri) {
        return;
      }
      BMA.uri.parse(uri)
      .then(function(result){
        // If pubkey
        if (result && result.pubkey) {
          $state.go('app.wot_identity', {
            pubkey: result.pubkey,
            node: result.host ? result.host: null}
          );
        }
        else {
          UIUtils.alert.error(result, 'ERROR.SCAN_UNKNOWN_FORMAT');
        }
      })
      .catch(UIUtils.onError('ERROR.SCAN_UNKNOWN_FORMAT'));
    })
    .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };

  ////////////////////////////////////////
  // Show Help tour
  ////////////////////////////////////////

  $scope.createHelptipScope = function(isTour) {
    if (!isTour && ($rootScope.tour || !$rootScope.settings.helptip.enable || UIUtils.screen.isSmall())) {
      return; // avoid other helptip to be launched (e.g. csWallet)
    }
    // Create a new scope for the tour controller
    var helptipScope = $scope.$new();
    $controller('HelpTipCtrl', { '$scope': helptipScope});
    return helptipScope;
  };

  $scope.startHelpTour = function(skipClearCache) {
    $rootScope.tour = true; // to avoid other helptip to be launched (e.g. csWallet)

    //
    if (!skipClearCache) {
      $ionicHistory.clearHistory();
      return $ionicHistory.clearCache()
        .then(function() {
          $scope.startHelpTour(true/*continue*/);
        });
    }

    var helptipScope = $scope.createHelptipScope(true);
    return helptipScope.startHelpTour()
    .then(function() {
      helptipScope.$destroy();
      delete $rootScope.tour;
    })
    .catch(function(err){
      delete $rootScope.tour;
    });
  };

  ////////////////////////////////////////
  // Login & wallet
  ////////////////////////////////////////

  $scope.isLogin = function() {
    return $scope.login;
  };

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

  // Load wallet data (after login)
  $scope.loadWalletData = function(options) {
    return csWallet.loadData(options)
      /*.catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR'))*/

      .then(function(walletData) {
        // Warn if wallet has been never used - see #167
        var showAlert = !csCurrency.data.initPhase && !csWallet.isNew() && csWallet.isNeverUsed() && (!csSettings.data.wallet || csSettings.data.wallet.alertIfUnusedWallet);
        if (!showAlert) return walletData;

        // Alert: wallet is empty !
        return UIUtils.loading.hide()
          .then(function(){
            return UIUtils.alert.confirm('CONFIRM.LOGIN_UNUSED_WALLET', 'CONFIRM.LOGIN_UNUSED_WALLET_TITLE',
              {
                okText: 'COMMON.BTN_CONTINUE'
              });
          })
          .then(function(confirm) {
            if (confirm) return walletData;
            return csWallet.logout();
          });
      })

      .then(function(walletData) {
        if (walletData) {
          $rootScope.walletData = walletData;
          return walletData;
        }
        else { // cancel login
          throw 'CANCELLED';
        }
      });
  };

  // Login and load wallet
  $scope.loadWallet = function(options) {

    // Make the platform is ready
    if (!csPlatform.isStarted()) {
      return csPlatform.ready().then(function(){
        return $scope.loadWallet(options);
      });
    }

    if (!csWallet.isLogin()) {
      return $scope.showLoginModal()
        .then(function (walletData) {
          if (walletData) {
            $rootScope.viewFirstEnter = false;
            // Force full load, even if min data asked
            // Because user can wait when just filled login (by modal)
            if (options && options.minData) options.minData = false;
            return $scope.loadWalletData(options);
          }
          else { // failed to login
            throw 'CANCELLED';
          }
        });
    }
    else if (!csWallet.data.loaded) {
      return $scope.loadWalletData(options);
    }
    else {
      return $q.when(csWallet.data);
    }
  };

  // Login and go to a state (or wallet if not)
  $scope.loginAndGo = function(state, stateParams) {
    $scope.closeProfilePopover();

    state = state || 'app.view_wallet';

    if (!csWallet.isLogin()) {

      // Make sure to protect login modal, if HTTPS enable - fix #340
      if (csConfig.httpsMode && $window.location && $window.location.protocol !== 'https:') {
        var href = $window.location.href;
        var hashIndex = href.indexOf('#');
        var rootPath = (hashIndex != -1) ? href.substr(0, hashIndex) : href;
        rootPath = 'https' + rootPath.substr(4);
        href = rootPath + $state.href(state);
        if (csConfig.httpsModeDebug) {
          console.debug('[httpsMode] --- Should redirect to: ' + href);
          // continue
        }
        else {
          $window.location.href = href;
          return;
        }

      }

      return $scope.showLoginModal()
        .then(function(walletData){
          if (walletData) {
            return $state.go(state ? state : 'app.view_wallet', stateParams)
              .then(UIUtils.loading.hide);
          }
        });
    }
    else {
      return $state.go(state, stateParams);
    }
  };

  // Show login modal
  $scope.showLoginModal = function() {
    return Modals.showLogin()
    .then(function(formData){
      if (!formData) return;
      var rememberMeChanged = (csSettings.data.rememberMe !== formData.rememberMe);
      if (rememberMeChanged) {
        csSettings.data.rememberMe = formData.rememberMe;
        csSettings.data.useLocalStorage = csSettings.data.rememberMe ? true : csSettings.data.useLocalStorage;
        csSettings.store();
      }
      return csWallet.loginBySalt(formData.username, formData.password);
    })
    .then(function(walletData){
      if (walletData) {
        $rootScope.walletData = walletData;
      }
      return walletData;
    })
    .catch(UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR'));
  };

  // Logout
  $scope.logout = function(options) {
    options = options || {};
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
    return csWallet.logout()
      .then(function() {
        $ionicSideMenuDelegate.toggleLeft();
        $ionicHistory.clearHistory();

        return $ionicHistory.clearCache()
          .then(function() {
            return $scope.showHome();
          });
      })
      .catch(UIUtils.onError());
  };

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return csWallet.isUserPubkey(pubkey);
  };

  // add listener on wallet event
  csWallet.api.data.on.login($scope, function(walletData, deferred) {
    $scope.login = true;
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.logout($scope, function() {
    $scope.login = false;
  });

  ////////////////////////////////////////
  // Useful modals
  ////////////////////////////////////////

  // Open transfer modal
  $scope.showTransferModal = function(parameters) {
    return $scope.loadWallet()
    .then(function(walletData){
      UIUtils.loading.hide();
      if (walletData) {
        return Modals.showTransfer(parameters);
      }
    })
    .then(function(result){
      if (result){
        return $timeout(function(){
          return UIUtils.toast.show('INFO.TRANSFER_SENT');
        }, 10);
      }
    });
  };

  $scope.showAboutModal = function() {
    return Modals.showAbout();
  };

  $scope.showJoinModal = function() {
    $scope.closeProfilePopover();
    return Modals.showJoin()
      .then(function(res){
        if (!res) return;
        return (res.accountType == 'member') ?
          Modals.showJoinMember(res) :
          Modals.showJoinWallet(res);
      });
  };

  $scope.showSettings = function() {
    $scope.closeProfilePopover();
    return $state.go('app.settings');
  };

  $scope.showHelpModal = function(parameters) {
    return Modals.showHelp(parameters);
  };

  ////////////////////////////////////////
  // Change node (expert mode)
  ////////////////////////////////////////

  $scope.showNodeListPopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl: 'templates/network/popover_peer_info.html',
      autoremove: true,
      scope: $scope.$new(true)
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
}


function AboutController($scope, csConfig) {
  'ngInject';
  $scope.config = csConfig;
}


function HomeController($scope, $state, $timeout, $ionicHistory, csPlatform, csCurrency) {
  'ngInject';

  $scope.loading = true;

  $scope.enter = function(e, state) {
    if (state && state.stateParams && state.stateParams.error) { // Query parameter
      $scope.error = state.stateParams.error;
      $scope.node =  csCurrency.data.node;
      $scope.loading = false;
      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: true,
        historyRoot: true
      });
      $state.go('app.home', {error: undefined}, {
        reload: false,
        inherit: true,
        notify: false});
    }
    else {
      // Start platform
      csPlatform.ready()
        .then(function() {
          $scope.loading = false;
        })
        .catch(function(err) {
          $scope.node =  csCurrency.data.node;
          $scope.loading = false;
          $scope.error = err;
        });
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.reload = function() {
    $scope.loading = true;
    delete $scope.error;

    $timeout($scope.enter, 200);
  };

  /**
   * Catch click for quick fix
   * @param event
   */
  $scope.doQuickFix = function(event) {
    if (event == 'settings') {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      $state.go('app.settings');
    }
  };
}


function PassCodeController($scope) {
  'ngInject';
}


function AutoLogoutController($scope, $ionicHistory, $state, Idle, UIUtils, $ionicLoading, csWallet, csSettings) {
  'ngInject';

  $scope.enableAutoLogout = false;

  $scope.checkAutoLogout = function(isLogin) {
    isLogin = angular.isDefined(isLogin) ? isLogin : $scope.isLogin();
    var enable = !csSettings.data.rememberMe && csSettings.data.logoutIdle > 0 && isLogin;
    var changed = ($scope.enableAutoLogout != enable);

    // need start/top watching
    if (changed) {
      // start idle
      if (enable) {
        console.debug("[app] Start auto-logout (idle time: {0}s)".format(csSettings.data.logoutIdle));
        Idle.setIdle(csSettings.data.logoutIdle);
        Idle.watch();
      }
      // stop idle, if need
      else if ($scope.enableAutoLogout){
        console.debug("[app] Stop auto-logout");
        Idle.unwatch();
      }
      $scope.enableAutoLogout = enable;
    }

    // if idle time changed: apply it
    else if (enable && Idle.getIdle() !== csSettings.data.logoutIdle) {
      console.debug("[app] Updating auto-logout (idle time: {0}s)".format(csSettings.data.logoutIdle));
      Idle.setIdle(csSettings.data.logoutIdle);
    }
  };
  csSettings.api.data.on.changed($scope, function() {
    $scope.checkAutoLogout();
  });

  // add listener on wallet event
  csWallet.api.data.on.login($scope, function(walletData, deferred) {
    $scope.checkAutoLogout(true);
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.logout($scope, function() {
    $scope.checkAutoLogout(false);
  });

  $scope.$on('IdleStart', function() {
    $ionicLoading.hide(); // close previous toast
    $ionicLoading.show({
      template: "<div idle-countdown=\"countdown\" ng-init=\"countdown=5\">{{'LOGIN.AUTO_LOGOUT.IDLE_WARNING'|translate:{countdown:countdown} }}</div>"
    });
  });

  $scope.$on('IdleEnd', function() {
    $ionicLoading.hide();
  });

  $scope.$on('IdleTimeout', function() {
    return csWallet.logout()
      .then(function() {
        $ionicHistory.clearCache();
        if ($state.current.data.auth === true) {
          $ionicHistory.clearHistory();
          return $scope.showHome();
        }
      })
      .then(function() {
        $ionicLoading.hide();
        return UIUtils.alert.confirm('LOGIN.AUTO_LOGOUT.MESSAGE',
          'LOGIN.AUTO_LOGOUT.TITLE', {
          cancelText: 'COMMON.BTN_CLOSE',
          okText: 'COMMON.BTN_LOGIN'
        });
      })
      .then(function(relogin){
        if (relogin) {
          //$ionicHistory.clean
          return $scope.loginAndGo($state.current.name, $state.params,
            {reload: true});
        }
      })
      .catch(UIUtils.onError());
  });
}
