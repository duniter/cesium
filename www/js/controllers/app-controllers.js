angular.module('cesium.app.controllers', ['cesium.services'])

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
        controller: 'AppCtrl'
      })

      .state('app.home', {
        url: "/home",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'AppCtrl'
          }
        }
      })
    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })



  .controller('AppCtrl', AppController)

  .controller('PluginExtensionPointCtrl', PluginExtensionPointController)

  .controller('EmptyModalCtrl', EmptyModalController)

  .controller('AboutCtrl', AboutController)

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
function AppController($scope, $rootScope, $state, $ionicSideMenuDelegate, $q, $timeout, $ionicHistory, $controller,
                       UIUtils, BMA, csWallet, Device, Modals, csSettings, csConfig
  ) {
  'ngInject';

  $scope.search = {};
  $rootScope.walletData = csWallet.data;
  $rootScope.settings = csSettings.data;
  $rootScope.config = csConfig;
  $rootScope.device = Device;
  $rootScope.login = csWallet.isLogin();

  ////////////////////////////////////////
  // Show view
  ////////////////////////////////////////

  $scope.showHome = function() {
    $state.go('app.home');
  };

  $scope.showCurrencyView = function() {
    $state.go(UIUtils.screen.isSmall() ? 'app.currency_view': 'app.currency_view_lg');
  };

  ////////////////////////////////////////
  // Device Methods
  ////////////////////////////////////////

  $scope.scanQrCodeAndGo = function() {
    if (!Device.enable) {
      return;
    }
    Device.camera.scan()
    .then(function(uri) {
      if (!uri) {
        return;
      }
      BMA.uri.parse(uri)
      .then(function(result){
        // If pubkey
        if (result && result.pubkey) {
          $state.go('app.wot_view_identity', {
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
    if (!isTour && ($rootScope.tour || !$rootScope.settings.helptip.enable)) {
      return; // avoid other helptip to be launched (e.g. csWallet)
    }
    // Create a new scope for the tour controller
    var helptipScope = $scope.$new();
    $controller('HelpTipCtrl', { '$scope': helptipScope});
    return helptipScope;
  };

  $scope.startHelpTour = function() {
    $rootScope.tour = true; // to avoid other helptip to be launched (e.g. csWallet)
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
    return $rootScope.login;
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
    if (options && options.loadMinData) {
      return csWallet.loadMinData()
        .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR'));
    }
    return csWallet.loadData()
      .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR'))
      .then(function(walletData) {
        // Warn if wallet has been never used - see #167
        var showAlert = !csConfig.initPhase && csWallet.isNeverUsed() && (!csSettings.data.wallet || csSettings.data.wallet.alertIfUnusedWallet);
        if (!showAlert) return walletData;
        return UIUtils.alert.confirm('CONFIRM.LOGIN_UNUSED_WALLET',
          'CONFIRM.LOGIN_UNUSED_WALLET_TITLE', {
            okText: 'COMMON.BTN_CONTINUE'
          })
          .then(function(confirm) {
            if (confirm) return walletData;
          });
      })
      .then(function(walletData) {
        if (walletData) {
          $rootScope.walletData = walletData;
          return walletData;
        }
        else { // failed to login
          throw new Error('CANCELLED');
        }
      });
  };

  // Login and load wallet
  $scope.loadWallet = function(options) {
    options = options || {};
    if (!csWallet.isLogin()) {
      return $scope.showLoginModal()
        .then(function (walletData) {
          if (walletData) {
            $rootScope.viewFirstEnter = false;
            return $scope.loadWalletData(options);
          }
          else { // failed to login
            throw new Error('CANCELLED');
          }
        });
    }
    else if (!csWallet.data.loaded) {
      return $scope.loadWalletData(options);
    }
    else {
      var deferred = $q.defer();
      deferred.resolve(csWallet.data);
      return deferred.promise;
    }
  };

  // Login and go to wallet
  $scope.login = function() {
    return $scope.loginAndGo('app.view_wallet');
  };

  // Login and go to a state
  $scope.loginAndGo = function(state) {
    $scope.closeProfilePopover();

    if (!csWallet.isLogin()) {
      return $scope.showLoginModal()
      .then(function(walletData){
        UIUtils.loading.hide(10);
        if (walletData) {
          $state.go(state ? state : 'app.view_wallet');
        }
      });
    }
    else {
      return $state.go(state);
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
      return csWallet.login(formData.username, formData.password);
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
  $scope.logout = function(force) {
    if (!force && $scope.profilePopover) {
      // Make the popover if really closed, to avoid UI refresh on popover buttons
      $scope.profilePopover.hide()
        .then(function(){
          $scope.logout(true);
        });
      return;
    }
    UIUtils.loading.show();
    return csWallet.logout()
    .then(function() {
      $ionicSideMenuDelegate.toggleLeft();
      $ionicHistory.clearHistory();
      return $ionicHistory.clearCache()
      .then(function() {
        UIUtils.loading.hide();
        $state.go('app.home');
      });
    })
    .catch(UIUtils.onError());
  };

  // add listener on wallet event
  csWallet.api.data.on.login($scope, function(walletData, deferred) {
    deferred = deferred || $q.defer();
    $rootScope.login = true;
    deferred.resolve();
    return deferred.promise;
  });
  csWallet.api.data.on.logout($scope, function() {
    $rootScope.login = false;
  });

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return csWallet.isUserPubkey(pubkey);
  };

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
        UIUtils.alert.info('INFO.TRANSFER_SENT');
        $state.go('app.view_wallet');
      }
    });
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
  // Layout Methods
  ////////////////////////////////////////
  $scope.showFab = function(id, timeout) {
    if (!timeout) {
      timeout = 900;
    }
    $timeout(function () {
      // Could not use 'getElementById', because it return only once element,
      // but many fabs can have the same id (many view could be loaded at the same time)
      var fabs = document.getElementsByClassName('button-fab');
      _.forEach(fabs, function(fab){
        if (fab.id == id) {
          fab.classList.toggle('on', true);
        }
      });
    }, timeout);
  };

  $scope.hideFab = function(id, timeout) {
    if (!timeout) {
      timeout = 10;
    }
    $timeout(function () {
      // Could not use 'getElementById', because it return only once element,
      // but many fabs can have the same id (many view could be loaded at the same time)
      var fabs = document.getElementsByClassName('button-fab');
      _.forEach(fabs, function(fab){
        if (fab.id == id) {
          fab.classList.toggle('on', false);
        }
      });
    }, timeout);
  };


}


function AboutController($scope, csConfig) {
  'ngInject';
  $scope.config = csConfig;
}
