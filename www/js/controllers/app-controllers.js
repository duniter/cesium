
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
    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('AppCtrl', AppController)
;

function LoginModalController2($scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory) {
  'ngInject';

  // Login modal
  $scope.loginModal = null;
  $scope.loginData = {
    rememberMe: Wallet.data.settings.rememberMe
  };
  $rootScope.viewFirstEnter = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $rootScope.viewFirstEnter = true;
  });

  // Create the login modal that we will use later
  $ionicModal.fromTemplateUrl('templates/login.html', {
    scope: $scope,
    focusFirstInput: true
  }).then(function(modal) {
    $scope.loginModal = modal;
    $scope.loginModal.hide();
  });

  $scope.setLoginForm = function(loginForm) {
    $scope.loginForm = loginForm;
  };

  // Open login modal
  $scope.login = function(success, cancel) {
    if ($scope.loginModal) {
      UIUtils.loading.hide();
      $scope.loginModal.show();
      $scope.loginData.callbacks = {};
      $scope.loginData.callbacks.success = success;
      $scope.loginData.callbacks.cancel = cancel;
    }
    else{
      $timeout(function(){
        $scope.login(success, cancel);
      }, 2000);
    }
  };

  // Login and load wallet
  $scope.loadWallet = function() {
    return $q(function(resolve, reject){

      if (!Wallet.isLogin()) {
        $timeout(function() {
          $scope.login(
            function() {
              $rootScope.viewFirstEnter = false;
              Wallet.loadData()
              .then(function(walletData){
                $rootScope.walletData = walletData;
                resolve(walletData);
              })
              .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
            },
            function() { // user cancel callback
              reject('CANCELLED');
            });
        }, $rootScope.viewFirstEnter ? 10 : 2000);
      }
      else if (!Wallet.data.loaded) {
        Wallet.loadData()
          .then(function(walletData){
            $rootScope.walletData = walletData;
            resolve(walletData);
          })
          .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
      }
      else {
        resolve(Wallet.data);
      }
    });
  };

  // Triggered in the login modal to close it
  $scope.cancelLogin = function() {
    var callback = $scope.loginData.callbacks.cancel;
    $scope.loginData = { // Reset login data
      rememberMe: Wallet.data.settings.rememberMe
    };
    $scope.loginForm.$setPristine(); // Reset form
    $scope.loginModal.hide();
    if (!!callback) {
      callback();
    }
  };

  // Open new account
  $scope.openNewAccount = function() {
    $scope.cancelLogin();
    $ionicHistory.nextViewOptions({
        disableBack: true
      });
    $state.go('app.join');
  };


  // TODO : for DEV only
  /*$timeout(function() {
    $scope.loginData = {
      username: 'benoit.lavenier@e-is.pro',
      password: ''
    };
    //$scope.loginForm = {$valid:true};
    $scope.login();
  }, 900);*/
}


function AppController($scope, $rootScope, $ionicModal, $state, $ionicSideMenuDelegate, UIUtils, $q, $timeout,
  CryptoUtils, BMA, Wallet, APP_CONFIG, $ionicHistory, Device, $ionicPopover, $translate, $filter,
  Modals
  ) {
  'ngInject';

  $scope.search = { text: '', results: {} };
  $scope.config = APP_CONFIG;
  $rootScope.walletData = Wallet.data;

  //LoginModalController.call(this, $scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory);

  //TransferModalController.call(this, $scope, $rootScope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, Device, $ionicPopover, $translate, $filter, $q);

  ////////////////////////////////////////
  // Load currencies
  ////////////////////////////////////////

  $scope.loadCurrencies = function() {
    return $q(function (resolve, reject){
      if (!!$rootScope.knownCurrencies) { // get list only once
        resolve($rootScope.knownCurrencies);
        return;
      }
      $rootScope.knownCurrencies = [];
      BMA.currency.parameters()
      .then(function(res) {
        $rootScope.knownCurrencies.push({
          name: res.currency,
          peer: BMA.node.url}
        );
        $scope.search.looking = false;
        resolve($rootScope.knownCurrencies);
      })
      .catch(UIUtils.onError('ERROR.GET_CURRENCY_PARAMETER'));
    });
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
    .then(function(result) {
      if (!result) {
        return;
      }
      // If pubkey
      if (BMA.regex.PUBKEY.test(result)) {
        $state.go('app.view_identity', {pub: result});
      }
      else {
        // TODO: parse URI (duniter:// )
        //if (BMA.regex.URI.test(result)) {
        //
        //}
        UIUtils.alert.error(result, 'ERROR.SCAN_UNKNOWN_FORMAT');
      }
    })
    .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };

  ////////////////////////////////////////
  // Login & wallet
  ////////////////////////////////////////

  // Login and load wallet
  $scope.loadWallet = function() {
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
            .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
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
          .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
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
      })
    }
  };

  // Show login modal
  $scope.showLoginModal = function() {
    return Modals.showLogin()
    .then(function(formData){
      if (!formData) return;
      Wallet.data.settings.rememberMe = formData.rememberMe;
      if (Wallet.data.settings.rememberMe) {
        Wallet.data.settings.useLocalStorage = true;
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
    Wallet.logout()
    .then(function() {
      $ionicSideMenuDelegate.toggleLeft();
      $state.go('app.home');
    })
    .catch(UIUtils.onError());
  };

  // Is connected
  $scope.isLogged = function() {
      return Wallet.isLogin();
  };

  // Is connected
  $rootScope.isLogged = function() {
      return Wallet.isLogin();
  };

  // Is not connected
  $scope.isNotLogged = function() {
    return !Wallet.isLogin();
  };

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return Wallet.isLogin() && Wallet.data.pubkey === pubkey;
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

