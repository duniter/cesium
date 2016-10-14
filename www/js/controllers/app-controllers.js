
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
                       screenmatch, UIUtils, BMA, Wallet, Device, Modals, csSettings, csConfig
  ) {
  'ngInject';

  $scope.search = {};
  $rootScope.walletData = Wallet.data;
  $rootScope.settings = csSettings.data;
  $rootScope.config = csConfig;
  $rootScope.device = Device;
  $rootScope.login = Wallet.isLogin();

  ////////////////////////////////////////
  // Show currency view
  ////////////////////////////////////////

  $scope.showCurrencyView = function() {
    $state.go(screenmatch.is('sm, xs') ? 'app.currency_view': 'app.currency_view_lg');
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

  $scope.createHelptipScope = function() {
    if ($rootScope.tour) {
      return; // avoid other helptip to be launched (e.g. wallet)
    }
    // Create a new scope for the tour controller
    var helptipScope = $scope.$new();
    $controller('HelpTipCtrl', { '$scope': helptipScope});
    return helptipScope;
  };

  $scope.startHelpTour = function() {
    delete $rootScope.tour;
    var helptipScope = $scope.createHelptipScope();
    $rootScope.tour = true; // to avoid other helptip to be launched (e.g. wallet)
    return helptipScope.startHelpTour()
    .then(function() {
      helptipScope.$destroy();
      delete $rootScope.tour;
    })
    .catch(function(err){
      delete $rootScope.tour;
    });
  };

  $scope.isGlobalStart = function() {
    return $rootScope.tour;
  }

  $scope.startCurrencyTour = function(index) {
    index = index || csSettings.data.helptip.currency;
    if (index < 0) return;
    // Create a new scope for the tour controller
    var childScope = $scope.$new();
    $controller('HelpTourCtrl', { '$scope': childScope});
    childScope.tour = false;
    return childScope.startCurrencyTour(index) // skip menu helptip
      .then(function(endIndex) {
        childScope.$destroy();
        csSettings.data.helptip.currency = endIndex;
        csSettings.store();
      });
  };

  $scope.startWotTour = function(index) {
    index = index || csSettings.data.helptip.wot;
    if (index < 0) return;
    // Create a new scope for the tour controller
    var childScope = $scope.$new();
    $controller('HelpTourCtrl', { '$scope': childScope});
    childScope.tour = false;
    return childScope.startWotTour(1)
      .then(function(endIndex) {
        childScope.$destroy();
        csSettings.data.helptip.wot = endIndex;
        csSettings.store();
      });
  };

  ////////////////////////////////////////
  // Login & wallet
  ////////////////////////////////////////

  // Login and load wallet
  $scope.loadWallet = function(rejectIfError) {

    // Warn if wallet has been never used - see #167
    var alertIfUnusedWallet = function() {
      return $q(function(resolve, reject){
        if (!csConfig.initPhase && Wallet.isNeverUsed()) {
          return UIUtils.alert.confirm('CONFIRM.LOGIN_UNUSED_WALLET',
            'CONFIRM.LOGIN_UNUSED_WALLET_TITLE', {
              okText: 'COMMON.BTN_CONTINUE'
            })
            .then(function (confirm) {
              if (!confirm) {
                $scope.logout().then($scope.loadWallet);
              }
              resolve(confirm);
            });
        }
        resolve(true);
      })
    };



    return $q(function(resolve, reject){

      if (!Wallet.isLogin()) {
        $scope.showLoginModal()
        .then(function(walletData) {
          if (walletData) {
            $rootScope.viewFirstEnter = false;
            Wallet.loadData()
            .then(function(walletData){
              alertIfUnusedWallet();
              $rootScope.walletData = walletData;
              resolve(walletData);
            })
            .catch(function(err) {
              if (rejectIfError) {
                UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject)(err);
              }
              else {
                UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR')(err);
              }
            });
          }
          else { // failed to login
            reject('CANCELLED');
          }
        });
      }
      else if (!Wallet.data.loaded) {
        Wallet.loadData()
        .then(function(walletData){
          alertIfUnusedWallet();
          $rootScope.walletData = walletData;
          resolve(walletData);
        })
        .catch(function(err) {
          if (rejectIfError) {
            UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject)(err);
          }
          else {
            UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR')(err);
          }
        });
      }
      else {
        resolve(Wallet.data);
      }
    });
  };

  // Login and go to wallet
  $scope.login = function() {
    $scope.loginAndGo('app.view_wallet');
  };

  // Login and go to a state
  $scope.loginAndGo = function(state) {
    if (!Wallet.isLogin()) {
      $scope.showLoginModal()
      .then(function(walletData){
        UIUtils.loading.hide();
        if (walletData) {
          $state.go(state ? state : 'app.view_wallet');
        }
      });
    }
    else {
      $state.go(state);
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
      return Wallet.login(formData.username, formData.password);
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
  $scope.logout = function() {
    UIUtils.loading.show();
    return Wallet.logout()
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
  Wallet.api.data.on.login($scope, function() {
    $rootScope.login = true;
  }, this);
  Wallet.api.data.on.logout($scope, function() {
    $rootScope.login = false;
  }, this);

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return Wallet.isUserPubkey(pubkey);
  };

  ////////////////////////////////////////
  // Useful modals
  ////////////////////////////////////////

  // Open transfer modal
  $scope.showTransferModal = function(parameters) {
    $scope.loadWallet()
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
    Modals.showAbout();
  };

  $scope.showJoinModal = function() {
    Modals.showJoin();
  };

  $scope.showHelpModal = function(parameters) {
    Modals.showHelp(parameters);
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
