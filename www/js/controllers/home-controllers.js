
angular.module('cesium.home.controllers', ['cesium.services'])

  .config(function($httpProvider) {
    //Enable cross domain calls
   $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .controller('HomeCtrl', HomeController)

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/menu.html",
        controller: 'HomeCtrl'
      })

      .state('app.home', {
        url: "/home",
        views: {
          'menuContent': {
            templateUrl: "templates/home.html",
            controller: 'HomeCtrl'
          }
        }
      })

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');
  })
;

function LoginController($scope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate) {
  // Login modal
  $scope.loginModal = "undefined";
  $scope.loginData = {};

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
  }

  // Open login modal
  $scope.login = function(callback) {
    if ($scope.loginModal != "undefined" && $scope.loginModal != null) {
      $scope.loginModal.show();
      $scope.loginData.callback = callback;
    }
    else{
      $timeout($scope.login, 2000);
    }    
  };

  // Login and load wallet
  $scope.loadWallet = function() {
    return $q(function(resolve, reject){
      if (!Wallet.isLogin()) {
        $scope.login(function() {
          Wallet.loadData()
            .then(function(walletData){
              resolve(walletData);
            })
            .catch(function(err) {
              UIUtils.loading.hide();
              console.error('>>>>>>>' , err);
              UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
              reject(err);
            });
        });
      }
      else if (!Wallet.data.loaded) {
        Wallet.loadData()
          .then(function(walletData){
            resolve(walletData);
          })
          .catch(function(err) {
            UIUtils.loading.hide();
            console.error('>>>>>>>' , err);
            UIUtils.alert.error('Could not fetch wallet data from remote uCoin node.');
            reject(err);
          });
      }
      else {
        resolve(Wallet.data);
      }
    });
  };

  // Triggered in the login modal to close it
  $scope.cancelLogin = function() {
    $scope.loginData = {}; // Reset login data
    $scope.loginForm.$setPristine(); // Reset form
    $scope.loginModal.hide();
  };

  // Login form submit
  $scope.doLogin = function() {
    if(!$scope.loginForm.$valid) {
      return;
    }
    UIUtils.loading.show();

    $scope.loginModal.hide()
    .then(function(){
      // Call wallet login, then execute callback function
      Wallet.login($scope.loginData.username, $scope.loginData.password)
        .then(function(){
          var callback = $scope.loginData.callback;
          $scope.loginData = {}; // Reset login data
          $scope.loginForm.$setPristine(); // Reset form
          if (callback != "undefined" && callback != null) {
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
    })
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
    UIUtils.loading.show();
    Wallet.logout().then(
        function() {
          UIUtils.loading.hide();
          $ionicSideMenuDelegate.toggleLeft();
          $state.go('app.home');
        }
    );
  };

  // Is connected
  $scope.isLogged = function() {
      return Wallet.isLogin();
  };

  // Is not connected
  $scope.isNotLogged = function() {
    return !Wallet.isLogin();
  };
}

function HomeController($scope, $ionicSlideBoxDelegate, $ionicModal, $state, BMA, UIUtils, $q, $timeout, Wallet, CryptoUtils, $ionicSideMenuDelegate) {

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  LoginController.call(this, $scope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate);

  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];
  $scope.slideIndex = 0;
  $scope.accountData = {};
  $scope.accountForm = {};

  // Called to navigate to the main app
  $scope.cancel = function() {
    $scope.newAccountModal.hide();
    $timeout(function(){
      $scope.accountData = {};
      $scope.accountForm = {};
    }, 200);
  };

  $scope.setAccountForm =  function(accountForm) {
    $scope.accountForm = accountForm;
  };

  // Called each time the slide changes
  $scope.slide = function(index) {
    $ionicSlideBoxDelegate.slide(index);
    $scope.slideIndex = index;
    $scope.nextStep = $scope.slideIndex == 2 ? 'Start' : 'Next';
  };

  $scope.next = function() {
    $scope.slide($scope.slideIndex + 1);
  };

  $scope.previous = function() {
    $scope.slide($scope.slideIndex - 1);
  };

  $scope.newAccount = function() {
    var showModal = function() {
        $ionicSlideBoxDelegate.enableSlide(false);
        $scope.slide(0);
        $scope.newAccountModal.show();
        // TODO: remove default
        /*$timeout(function() {
          $scope.accountData.currency = $scope.knownCurrencies[0];
          $scope.accountData.isMember = true;
          $scope.next();
          $scope.next();
        }, 300);*/
    }

    if (!$scope.newAccountModal) {
      UIUtils.loading.show();
      // Create the account modal that we will use later
      $ionicModal.fromTemplateUrl('templates/account/new_account.html', {
        scope: $scope
      }).then(function(modal) {
        $scope.newAccountModal = modal;
        $scope.newAccountModal.hide()
        .then(function(){
          UIUtils.loading.hide();
          showModal();
        });

      });
    }
    else {
      showModal();
    }
  };

  $scope.selectCurrency = function(currency) {
    $scope.accountData.currency = currency;
    $ionicSlideBoxDelegate.slide(1);
    $scope.next();
  };

  $scope.selectAccountTypeMember = function(bool) {
    $scope.accountData.isMember = bool;
    $scope.next();
  };

  $scope.showAccountPubkey = function() {
    $scope.accountData.computing=true;
    CryptoUtils.connect($scope.accountData.username, $scope.accountData.password).then(
        function(keypair) {
            $scope.accountData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            $scope.accountData.computing=false;
        }
    )
    .catch(function(err) {
      $scope.accountData.computing=false;
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  $scope.doNewAccount = function() {
    $scope.accountForm.$submitted=true;
    if(!$scope.accountForm.$valid) {
      return;
    }

    UIUtils.loading.show();
    $scope.newAccountModal.hide()
    .then(function(){
      Wallet.login($scope.accountData.username, $scope.accountData.password)
        .then(function() {
          // Reset account data
          delete $scope.accountForm;
          $scope.accountData = {};
          UIUtils.loading.hide();
          $state.go('app.view_wallet');
        })
        .catch(function(err) {
          UIUtils.loading.hide();
          console.error('>>>>>>>' , err);
          UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
        });
    })
  };

  // TODO: remove auto add account when done
  /*$timeout(function() {
    $scope.newAccount();
  }, 400);
  */
}

