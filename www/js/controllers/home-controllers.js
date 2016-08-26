
angular.module('cesium.home.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';
    $stateProvider

      .state('app.home', {
        url: "/home",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'AppCtrl'
          }
        }
      })

      .state('app.join', {
        url: "/join",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'JoinCtrl'
          }
        }
      })
    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('JoinCtrl', JoinController)

  .controller('NewAccountModalCtrl', NewAccountModalController)

  .controller('AboutCtrl', AboutController)
;


function NewAccountModalController($scope, $state, UIUtils, CryptoUtils, Wallet, csCurrency) {
  'ngInject';

  $scope.formData = {
    pseudo: ''
  };
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.search = {
    looking: true
  };

  csCurrency.load()
  .then(function (data) {
    if (data) {
      $scope.knownCurrencies = data.currencies;
    }
    $scope.search.looking = false;
  })
  .catch(UIUtils.onError('GET_CURRENCIES_FAILED'));


  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
  };

  $scope.slideNext = function() {
      $scope.slides.slider.unlockSwipes();
      $scope.slides.slider.slideNext();
      $scope.slides.slider.lockSwipes();
    };

  $scope.selectCurrency = function(currency) {
    $scope.formData.currency = currency;
    $scope.slideNext();
  };

  $scope.selectAccountTypeMember = function(bool) {
    $scope.formData.isMember = bool;
    $scope.slideNext();
  };

  $scope.showAccountPubkey = function() {
    $scope.formData.computing=true;
    CryptoUtils.connect($scope.formData.username, $scope.formData.password)
    .then(function(keypair) {
      $scope.formData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
      $scope.formData.computing=false;
    })
    .catch(function(err) {
      $scope.formData.computing=false;
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  $scope.formDataChanged = function() {
    $scope.formData.computing=false;
    $scope.formData.pubkey=null;
  };

  $scope.doNewAccount = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid) {
      return;
    }

    var onErrorLogout = function(message) {
      return function(err) {
        Wallet.logout()
        .then(function(){
          UIUtils.onError(message)(err);
        });
      };
    };

    UIUtils.loading.show();

    Wallet.login($scope.formData.username, $scope.formData.password)
    .then(function() {
      if (!$scope.formData.isMember) {
        // Redirect to wallet
        $state.go('app.view_wallet');
        return;
      }

      // Send self
      Wallet.self($scope.formData.pseudo, false/*do NOT load membership here*/)
        .then(function() {
          // Send membership IN
          Wallet.membership.inside()
          .then(function() {

            $scope.closeModal();

            // Redirect to wallet
            $state.go('app.view_wallet');
          })
          .catch(onErrorLogout('ERROR.SEND_MEMBERSHIP_IN_FAILED'));
        })
        .catch(onErrorLogout('ERROR.SEND_IDENTITY_FAILED'));
    })
    .catch(function(err) {
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  // TODO: remove auto add account when done
  /*$timeout(function() {
    $scope.newAccount();
  }, 400);
  */
}

function JoinController($scope, $timeout, Modals) {
  'ngInject';


  // Open new account wizard
  $timeout(function() {
    $scope.showNewAccountModal();
  }, 100);

}

function AboutController($scope, csConfig) {
  'ngInject';
  $scope.config = csConfig;
}
