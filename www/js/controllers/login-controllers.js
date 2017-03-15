
angular.module('cesium.login.controllers', ['cesium.services'])

  .controller('LoginModalCtrl', LoginModalController)
;

function LoginModalController($scope, $timeout, CryptoUtils, UIUtils, Modals, csSettings, Device) {
  'ngInject';

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {
    rememberMe: csSettings.data.rememberMe
  };
  $scope.showSalt = csSettings.data.showLoginSalt;
  $scope.showPubkeyButton = false;
  $scope.autoComputePubkey = false;

  Device.ready().then(function() {
    $scope.autoComputePubkey = ionic.Platform.grade.toLowerCase()==='a' &&
      !UIUtils.screen.isSmall();
  });

  // Login form submit
  $scope.doLogin = function() {
    if(!$scope.form.$valid) {
      return;
    }
    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)
    UIUtils.loading.show();

    $scope.closeModal($scope.formData);
  };

  $scope.formDataChanged = function() {
    $scope.computing=false;
    $scope.pubkey = null;
    if ($scope.autoComputePubkey && $scope.formData.username && $scope.formData.password) {
      $scope.showPubkey();
    }
    else {
      $scope.showPubkeyButton = $scope.formData.username && $scope.formData.password;
    }
  };
  $scope.$watch('formData.username', $scope.formDataChanged, true);
  $scope.$watch('formData.password', $scope.formDataChanged, true);

  $scope.showPubkey = function() {
    $scope.computing=true;
    $scope.showPubkeyButton = false;
    $scope.pubkey = '';
    $timeout(function() {
      var salt = $scope.formData.username;
      var pwd = $scope.formData.password;
      CryptoUtils.connect(salt, pwd).then(
        function (keypair) {
          // form has changed: retry
          if (salt !== $scope.formData.username || pwd !== $scope.formData.password) {
            $scope.showPubkey();
          }
          else {
            $scope.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            $scope.computing = false;
          }
        }
      )
        .catch(function (err) {
          $scope.pubkey = '';
          $scope.computing = false;
          UIUtils.loading.hide();
          console.error('>>>>>>>', err);
          UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
        });
    }, 500);
  };

  $scope.showJoinModal = function() {
    $scope.closeModal();
    $timeout(function() {
      Modals.showJoin();
    }, 300);
  };

  $scope.showAccountSecurityModal = function() {
    $scope.closeModal();
    $timeout(function() {
      Modals.showAccountSecurity();
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

