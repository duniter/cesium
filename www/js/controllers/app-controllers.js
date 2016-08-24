
angular.module('cesium.app.controllers', ['cesium.services'])

  .config(function($httpProvider) {
    'ngInject';

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/menu.html",
        controller: 'AppCtrl'
      })
    ;

  })

  .controller('AppCtrl', AppController)

  .controller('PluginExtensionPointCtrl', PluginExtensionPointController)

  .controller('EmptyModalCtrl', EmptyModalController)

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
function AppController($scope, $rootScope, $state, $ionicSideMenuDelegate, UIUtils, $q, $timeout,
  BMA, Wallet, $ionicHistory, Device, Modals, csSettings, csConfig, csCurrency
  ) {
  'ngInject';

  $scope.search = {};
  $rootScope.walletData = Wallet.data;
  $rootScope.settings = csSettings.data;
  $rootScope.config = csConfig;

  ////////////////////////////////////////
  // Load currencies
  ////////////////////////////////////////

  $scope.loadCurrencies = function() {
    console.debug("[WARN] $scope.loadCurrencies() si deprecated. use csNetwork.all() instead");
    return csCurrency.all()
      .catch(UIUtils.onError('ERROR.GET_CURRENCY_PARAMETER'));
  };

  ////////////////////////////////////////
  // Device Methods
  ////////////////////////////////////////

  $scope.isDeviceEnable = function() {
    return Device.isEnable();
  };

  $scope.scanQrCodeAndGo = function() {
    if (!Device.isEnable()) {
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
  // Login & wallet
  ////////////////////////////////////////

  // Login and load wallet
  $scope.loadWallet = function(rejectIfError) {
    return $q(function(resolve, reject){

      if (!Wallet.isLogin()) {
        $scope.showLoginModal()
        .then(function(walletData) {
          if (walletData) {
            $rootScope.viewFirstEnter = false;
            Wallet.loadData()
            .then(function(walletData){
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

  // Login
  $scope.login = function(state) {
    if (!Wallet.isLogin()) {
      $scope.showLoginModal()
      .then(function(walletData){
        UIUtils.loading.hide();
        if (walletData) {
          $state.go(state ? state : 'app.view_wallet');
        }
      });
    }
  };

  // Show login modal
  $scope.showLoginModal = function() {
    return Modals.showLogin()
    .then(function(formData){
      if (!formData) return;
      var rememberMeChanged = (csSettings.data.rememberMe !== formData.rememberMe);
      if (rememberMeChanged) {
        csSettings.data.useLocalStorage = csSettings.data.rememberMe ? true : csSettings.data.useLocalStorage;
        Wallet.store();
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
    Wallet.logout()
    .then(function() {
      $ionicSideMenuDelegate.toggleLeft();
      $ionicHistory.clearHistory();
      $ionicHistory.clearCache()
      .then(function() {
        UIUtils.loading.hide();
        $state.go('app.home');
      });
    })
    .catch(UIUtils.onError());
  };

  // Is connected
  $scope.isLogin = function() {
      return Wallet.isLogin();
  };

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

  $scope.showNewAccountModal = function() {
    Modals.showNewAccount();
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


}

