
angular.module('cesium.login.controllers', ['cesium.services'])

  .controller('LoginModalCtrl', LoginModalController)
;

function LoginModalController($scope, $timeout, CryptoUtils, UIUtils, Modals, csPlatform, csSettings, Device) {
  'ngInject';

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {
    rememberMe: csSettings.data.rememberMe
  };
  $scope.showSalt = csSettings.data.showLoginSalt;
  $scope.showPubkey = false;
  $scope.showComputePubkeyButton = false;
  $scope.autoComputePubkey = false;

  csPlatform.ready().then(function() {
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
    if ($scope.computing) return; // avoid multiple call
    $scope.computing=false;
    $scope.pubkey = null;
    $scope.showPubkey = !!$scope.formData.username && !!$scope.formData.password;
    if ($scope.autoComputePubkey && $scope.showPubkey) {
      $scope.computePubkey();
      $scope.showComputePubkeyButton = false;
    }
    else {
      $scope.showComputePubkeyButton = !$scope.autoComputePubkey && $scope.showPubkey;
    }
  };
  $scope.$watch('formData.username + formData.password', $scope.formDataChanged, true);

  $scope.computePubkey = function() {
    $scope.showComputePubkeyButton = false;
    $scope.computing = true;
    $scope.pubkey = null;
    return $timeout(function() {
      var salt = $scope.formData.username;
      var pwd = $scope.formData.password;
      return CryptoUtils.connect(salt, pwd).then(
        function (keypair) {

          // If model has changed before the response, then retry
          if (salt !== $scope.formData.username || pwd !== $scope.formData.password) {
            return $scope.computePubkey();
          }

          $scope.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
          $scope.computing = false;
        }
      )
        .catch(function (err) {
          UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR')(err);
          $scope.formDataChanged();
        });
    }, 100);
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

  $scope.showHelpModal = function(parameters) {
    return Modals.showHelp(parameters);
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

