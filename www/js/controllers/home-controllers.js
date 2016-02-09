
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
  // Form data for the login modal
  $scope.loginData = {
    username: null,
    password: null
  };

  // Login modal
  $scope.loginModal = "undefined";

  // Create the login modal that we will use later
  $ionicModal.fromTemplateUrl('templates/login.html', {
    scope: $scope,
    focusFirstInput: true
  }).then(function(modal) {
    $scope.loginModal = modal;
    $scope.loginModal.hide();
  });

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
              console.error('>>>>>>>' , err);
              UIUtils.alert.error('Your browser is not compatible with cryptographic features.');
              UIUtils.loading.hide();
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
            console.error('>>>>>>>' , err);
            UIUtils.alert.error('Could not fetch wallet data from remote uCoin node.');
            UIUtils.loading.hide();
            reject(err);
          });
      }
      else {
        resolve(Wallet.data);
      }
    });
  };

  // Triggered in the login modal to close it
  $scope.closeLogin = function() {
    return $scope.loginModal.hide();
  };

  // Login form submit
  $scope.doLogin = function() {
    $scope.closeLogin();
    UIUtils.loading.show(); 

    // Call wallet login
    Wallet.login($scope.loginData.username, $scope.loginData.password)
    .catch(function(err) {
      $scope.loginData = {}; // Reset login data
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('Your browser is not compatible with cryptographic libraries.');
    })
    .then(function(){
      UIUtils.loading.hide();
      var callback = $scope.loginData.callback;
      $scope.loginData = {}; // Reset login data
      if (callback != "undefined" && callback != null) {
        callback();
      }
      // Default: redirect to wallet view
      else {
        $state.go('app.view_wallet');
      }
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
      UIUtils.alert.error('Your browser is not compatible with cryptographic libraries.');
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

  //CurrenciesController.call(this, $scope, $state);
  //LookupController.call(this, $scope, BMA, $state);
  LoginController.call(this, $scope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate);

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.cancel = function() {
    $scope.modal.hide();
    $timeout(function(){
      $scope.selectedCurrency = '';
      $scope.accountTypeMember = null;
      $scope.search.text = '';
      $scope.search.results = [];
    }, 200);
  };

  $scope.$on('currencySelected', function() {
    $ionicSlideBoxDelegate.slide(1);
  });

  $scope.selectAccountTypeMember = function(bool) {
    $scope.accountTypeMember = bool;
    $ionicSlideBoxDelegate.slide(2);
  };

  $scope.next = function() {
    $ionicSlideBoxDelegate.next();
  };
  $scope.previous = function() {
    $ionicSlideBoxDelegate.previous();
  };

  // Called each time the slide changes
  $scope.slideChanged = function(index) {
    $scope.slideIndex = index;
    $scope.nextStep = $scope.slideIndex == 2 ? 'Start using MyApp' : 'Next';
  };

  $scope.addAccount = function() {
    $scope.modal.show();
    $scope.slideChanged(0);
    $ionicSlideBoxDelegate.slide(0);
    $ionicSlideBoxDelegate.enableSlide(false);
    // TODO: remove default
    //$timeout(function() {
    //  $scope.selectedCurrency = $scope.knownCurrencies[0];
    //  $scope.accountTypeMember = true;
    //  $scope.searchChanged();
    //  $scope.search.text = 'cgeek';
    //  $ionicSlideBoxDelegate.next();
    //  $ionicSlideBoxDelegate.next();
    //}, 300);
  };

  // Create the account modal that we will use later
  $ionicModal.fromTemplateUrl('templates/account/new_account.html', {
    scope: $scope
  }).then(function(modal) {
    $scope.modal = modal;
    $scope.modal.hide();
    // TODO: remove auto add account when done
    //$timeout(function() {
    //  $scope.addAccount();
    //}, 400);
  });

  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $scope.next();
  }
}
