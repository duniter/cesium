
angular.module('cesium.login.controllers', ['cesium.services'])

  .controller('LoginModalCtrl', LoginModalController)
;

function LoginModalController($scope, $timeout, CryptoUtils, UIUtils, Modals, csSettings) {
  'ngInject';

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {
    rememberMe: csSettings.data.rememberMe
  };

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

  $scope.showJoinModal = function() {
    $scope.closeModal();
    $timeout(function() {
      Modals.showJoin();
    }, 300);
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

