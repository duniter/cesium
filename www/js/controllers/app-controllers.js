
angular.module('cesium.app.controllers', ['cesium.services'])

  .config(function($httpProvider) {
    //Enable cross domain calls
   $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .config(function($stateProvider, $urlRouterProvider) {
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
  // Login modal
  $scope.loginModal = null;
  $scope.loginData = {
    rememberMe: Wallet.defaultSettings.rememberMe
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
      rememberMe: Wallet.defaultSettings.rememberMe
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
    UIUtils.loading.show();

    $scope.loginModal.hide()
    .then(function(){
      // Call wallet login, then execute callback function
      Wallet.login($scope.loginData.username, $scope.loginData.password)
        .then(function(walletData){
          walletData.settings.rememberMe = $scope.formData.rememberMe;
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
  CryptoUtils, BMA, Wallet, Registry, Market, APP_CONFIG, $ionicHistory, System, $translate
  ) {

  $scope.knownCurrencies = null;
  $scope.search = { text: '', results: {} };
  $scope.isExpanded = false;
  $scope.hasHeaderFabLeft = false;
  $scope.hasHeaderFabRight = false;
  $scope.system = System;
  $scope.config = APP_CONFIG;
  $scope.options = {
      market: {
        enable: !!Market
      },
      registry: {
        enable: !!Registry
      }
    };

  LoginModalController.call(this, $scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory);

  TransferModalController.call(this, $scope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, System);

  ////////////////////////////////////////
  // Load currencies
  ////////////////////////////////////////

  $scope.loadCurrencies = function() {
    return $q(function (resolve, reject){
      if (!!$scope.knownCurrencies) {
        resolve($scope.knownCurrencies);
        return;
      }
      if (!!Registry) {
        Registry.currency.all()
        .then(function (res) {
          if (!!res.hits && res.hits.total > 0) {
            $scope.knownCurrencies = res.hits.hits.reduce(function(res, hit) {
              var peer = hit._source.peers.reduce(function(peers, peer){
                return peers.concat(new Peer(peer));
              }, [])[0];
              return res.concat({id: hit._id, peer: peer.host+':'+peer.port});
            }, []);
          }
          $scope.search.looking = false;
          resolve($scope.knownCurrencies);
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCIES_FAILED'));
      }
      else  {
        $scope.knownCurrencies = [];
        BMA.currency.parameters()
        .then(function(params) {
          $scope.knownCurrencies.push({
            id: params.currency,
            peer: APP_CONFIG.DUNITER_NODE}
          );
          $scope.search.looking = false;
          resolve($scope.knownCurrencies);
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_PARAMETER'));
      }
    });
  };

  ////////////////////////////////////////
  // Layout Methods
  ////////////////////////////////////////
  /*var navIcons = document.getElementsByClassName('ion-navicon');
  for (var i = 0; i < navIcons.length; i++) {
      navIcons.addEventListener('click', function() {
          this.classList.toggle('active');
      });
  }*/

  $scope.hideNavBar = function() {
      document.getElementsByTagName('ion-nav-bar')[0].style.display = 'none';
  };

  $scope.showNavBar = function() {
      document.getElementsByTagName('ion-nav-bar')[0].style.display = 'block';
  };

  $scope.noHeader = function() {
      var content = document.getElementsByTagName('ion-content');
      for (var i = 0; i < content.length; i++) {
          if (content[i].classList.contains('has-header')) {
              content[i].classList.toggle('has-header');
          }
      }
  };

  $scope.setExpanded = function(bool) {
      $scope.isExpanded = bool;
  };

  $scope.setHeaderFab = function(location) {
      var hasHeaderFabLeft = false;
      var hasHeaderFabRight = false;

      switch (location) {
          case 'left':
              hasHeaderFabLeft = true;
              break;
          case 'right':
              hasHeaderFabRight = true;
              break;
      }

      $scope.hasHeaderFabLeft = hasHeaderFabLeft;
      $scope.hasHeaderFabRight = hasHeaderFabRight;
  };

  $scope.hasHeader = function() {
      var content = document.getElementsByTagName('ion-content');
      for (var i = 0; i < content.length; i++) {
          if (!content[i].classList.contains('has-header')) {
              content[i].classList.toggle('has-header');
          }
      }
  };

  $scope.hideHeader = function() {
      $scope.hideNavBar();
      $scope.noHeader();
  };

  $scope.showHeader = function() {
      $scope.showNavBar();
      $scope.hasHeader();
  };

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
    }, 900);
  };
}

