
angular.module('cesium.login.controllers', ['cesium.services'])

  .controller('LoginModalCtrl', LoginModalController)
;

function LoginModalController($scope, $rootScope, $ionicModal, Wallet, CryptoUtils, UIUtils, $q, $state, $timeout, $ionicSideMenuDelegate, $ionicHistory) {
  'ngInject';

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {
    rememberMe: Wallet.data.settings.rememberMe
  };
  $rootScope.viewFirstEnter = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $rootScope.viewFirstEnter = true;
  });

  // Login form submit
  $scope.doLogin = function() {
    if(!$scope.form.$valid) {
      return;
    }
    // removeIf(no-device)
    if (window.cordova && cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.close();
    }
    // endRemoveIf(no-device)
    UIUtils.loading.show();

    $scope.closeModal($scope.formData);
  };

  $scope.formDataChanged = function() {
    $scope.computing=false;
    $scope.pubkey = '';
    /*if (!$scope.isDeviceEnable()){
      $scope.showPubkey();
    }*/
  };
  $scope.$watch('formData.username', $scope.formDataChanged, true);
  $scope.$watch('formData.password', $scope.formDataChanged, true);


  $scope.showPubkey = function() {
    $scope.computing=true;
    CryptoUtils.connect($scope.formData.username, $scope.formData.password).then(
      function(keypair) {
        $scope.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
        $scope.computing=false;
      }
    )
    .catch(function(err) {
      $scope.pubkey = '';
      $scope.computing=false;
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  // TODO : for DEV only
  /*$timeout(function() {
    $scope.formData = {
      username: 'benoit.lavenier@e-is.pro',
      password: ''
    };
    //$scope.form = {$valid:true};
  }, 900);*/
}

