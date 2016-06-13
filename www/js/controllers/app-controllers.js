
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

function LoginModalController($scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory) {
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
          Wallet.restore() // try to restore wallet
          .then(function(){
            if (Wallet.isLogin()) { // Maybe now login
              $rootScope.viewFirstEnter = false;
              Wallet.loadData()
                .then(function(walletData){
                  resolve(walletData);
                })
                .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
            }
            else {
              $scope.login(
                function() {
                  $rootScope.viewFirstEnter = false;
                  Wallet.loadData()
                    .then(function(walletData){
                      resolve(walletData);
                    })
                    .catch(UIUtils.onError('ERROR.LOAD_WALLET_DATA_ERROR', reject));
                },
                function() { // user cancel callback
                  reject('CANCELLED');
                });
            }
          })
          .catch(UIUtils.onError('ERROR.RESTORE_WALLET_DATA_ERROR', reject));
        }, $rootScope.viewFirstEnter ? 10 : 2000);
      }
      else if (!Wallet.data.loaded) {
        Wallet.loadData()
          .then(function(walletData){
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

  // Login form submit
  $scope.doLogin = function() {
    if(!$scope.loginForm.$valid) {
      return;
    }
    // removeIf(no-device)
    if (window.cordova && cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.close();
    }
    // endRemoveIf(no-device)
    UIUtils.loading.show();

    $scope.loginModal.hide()
    .then(function(){
      // Call wallet login, then execute callback function
      Wallet.login($scope.loginData.username, $scope.loginData.password)
        .then(function(walletData){
          walletData.settings.rememberMe = $scope.loginData.rememberMe;
          if (walletData.settings.rememberMe) {
            walletData.settings.useLocalStorage = true;
            Wallet.store();
          }

          var callback = $scope.loginData.callbacks.success;
          $scope.loginData = {}; // Reset login data
          $scope.loginForm.$setPristine(); // Reset form
          if (!!callback) {
            callback();
          }
          // Default: redirect to wallet view
          else {
            $state.go('app.view_wallet');
          }
        })
        .catch(function(err) {
          $scope.loginData = {}; // Reset login data
          $scope.loginForm.$setPristine(); // Reset form
          UIUtils.loading.hide();
          console.error('>>>>>>>' , err);
          UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
        });
    });
  };

  $scope.loginDataChanged = function() {
    $scope.loginData.computing=false;
    $scope.loginData.pubkey=null;
  };

  $scope.showLoginPubkey = function() {
    $scope.loginData.computing=true;
    CryptoUtils.connect($scope.loginData.username, $scope.loginData.password).then(
        function(keypair) {
            $scope.loginData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            $scope.loginData.computing=false;
        }
    )
    .catch(function(err) {
      $scope.loginData.computing=false;
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
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

  // Open new account
  $scope.openNewAccount = function() {
    $scope.cancelLogin();
    $ionicHistory.nextViewOptions({
        disableBack: true
      });
    $state.go('app.join');
  };

  // Is connected
  $scope.isLogged = function() {
      return Wallet.isLogin();
  };

  // Is not connected
  $scope.isNotLogged = function() {
    return !Wallet.isLogin();
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
  CryptoUtils, BMA, Wallet, APP_CONFIG, $ionicHistory, Device, $translate, $ionicPopover
  ) {
  'ngInject';

  $scope.knownCurrencies = null;
  $scope.search = { text: '', results: {} };
  $scope.config = APP_CONFIG;

  LoginModalController.call(this, $scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory);

  TransferModalController.call(this, $scope, $rootScope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, Device, $ionicPopover);

  ////////////////////////////////////////
  // Load currencies
  ////////////////////////////////////////

  $scope.loadCurrencies = function() {
    return $q(function (resolve, reject){
      if (!!$scope.knownCurrencies) { // get list on once
        resolve($scope.knownCurrencies);
        return;
      }
      $scope.knownCurrencies = [];
      BMA.currency.parameters()
      .then(function(res) {
        $scope.knownCurrencies.push({
          name: res.currency,
          peer: BMA.node.url}
        );
        $scope.search.looking = false;
        resolve($scope.knownCurrencies);
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

