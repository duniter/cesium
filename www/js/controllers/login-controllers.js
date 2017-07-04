
angular.module('cesium.login.controllers', ['cesium.services'])

  .controller('LoginModalCtrl', LoginModalController)

  .controller('AuthModalCtrl', AuthModalController)

  .controller('AuthIdleCtrl', AuthIdleController)

;

function LoginModalController($scope, $timeout, $q, CryptoUtils, UIUtils, Modals, csSettings, Device, parameters) {
  'ngInject';

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {};
  $scope.showPubkey = false;
  $scope.showComputePubkeyButton = false;
  $scope.autoComputePubkey = false;

  $scope.error = parameters && parameters.error;
  $scope.isAuth = parameters && parameters.auth;
  $scope.expectedPubkey = parameters && parameters.expectedPubkey;

  var loginMethods = [
    {id: 'PUBKEY', label: 'LOGIN.METHOD.PUBKEY'}
  ];
  var authMethods = [
    {id: 'SCRYPT_DEFAULT', label: 'LOGIN.METHOD.SCRYPT_DEFAULT'},
    {
      id: 'SCRYPT_ADVANCED', label: 'LOGIN.METHOD.SCRYPT_ADVANCED',
      values: _.keys(CryptoUtils.constants.SCRYPT_PARAMS).reduce(function(res, key) {
        return res.concat({id: key, label: 'LOGIN.SCRYPT.' + key, params: CryptoUtils.constants.SCRYPT_PARAMS[key]});
      }, [{id: 'user', label: 'LOGIN.SCRYPT.USER', params: {}}])
    },
    {id: 'FILE', label: 'LOGIN.METHOD.FILE'}
  ];
  $scope.showMethods = false;

  // modal enter
  $scope.enter = function() {
    UIUtils.loading.hide();

    // Should auto-compute pubkey ?
    $scope.autoComputePubkey = ionic.Platform.grade.toLowerCase()==='a' &&
      !UIUtils.screen.isSmall();

    // Init remember me
    $scope.formData.rememberMe = csSettings.data.rememberMe;

    // Prepare methods
    if (parameters && parameters.auth) {
      $scope.methods = authMethods;
    }
    else {
      // All methods : login and auth
      $scope.methods = authMethods.concat(loginMethods);
    }

    // Init method
    var defaultMethod = csSettings.data.login && csSettings.data.login.method || 'SCRYPT_DEFAULT';
    $scope.formData.method = _.findWhere($scope.methods, {id:  defaultMethod}) || $scope.methods[0];
    $scope.changeMethod($scope.formData.method);
  };
  $scope.$on('modal.shown', $scope.enter);

  // modal leave
  $scope.leave = function() {
    $scope.formData = {};
    $scope.computing = false;
    $scope.pubkey = null;
    $scope.methods = [];
  };
  $scope.$on('modal.hide', $scope.leave);

  // Login form submit
  $scope.doLogin = function() {
    if(!$scope.form.$valid) {
      return;
    }
    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)

    var method = $scope.formData.method.id;
    var promise;

    // Scrypt
    if (method === 'SCRYPT_DEFAULT' || method === 'SCRYPT_ADVANCED') {
      if (!$scope.formData.username || !$scope.formData.password) return;
      var scryptPrams = $scope.formData.scrypt && $scope.formData.scrypt.params;
      UIUtils.loading.show();
      promise = CryptoUtils.scryptKeypair($scope.formData.username, $scope.formData.password, scryptPrams)
        .then(function(keypair) {
          if (!keypair) return UIUtils.loading.hide(10);
          var pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
          // Check pubkey
          if ($scope.expectedPubkey && $scope.expectedPubkey != pubkey) {
            $scope.pubkey = pubkey;
            $scope.showPubkey = true;
            $scope.pubkeyError = true;
            return UIUtils.loading.hide(10);
          }

          $scope.error = null;
          $scope.pubkeyError = false;

          return {
            pubkey: pubkey,
            keypair: keypair,
            params: ($scope.formData.scrypt && $scope.formData.scrypt.id != 'SCRYPT_DEFAULT') ? scryptPrams : undefined
          };
        })
        .catch(UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR'));
    }

    // File
    else if (method === 'FILE') {
      if (!$scope.formData.file || !$scope.formData.file.valid || !$scope.formData.file.pubkey) return;

      UIUtils.loading.show();
      promise = CryptoUtils.readKeyFile($scope.formData.file, $scope.formData.keepAuth/*withSecret*/)
        .then(function(keypair) {
          if (!keypair) return UIUtils.loading.hide(10);
          var pubkey = CryptoUtils.util.encode_base58(keypair.signPk);

          // Check pubkey
          if ($scope.expectedPubkey && $scope.expectedPubkey != pubkey) {
            $scope.formData.file.valid = false;
            return UIUtils.loading.hide(10);
          }

          $scope.error = null;
          $scope.pubkeyError = false;

          return {
            pubkey: pubkey,
            keypair: keypair,
            params: $scope.formData.file
          };
        })
        .catch(UIUtils.onError('ERROR.AUTH_FILE_ERROR'));
    }

    // Pubkey
    else if (method === 'PUBKEY') {
      if (!$scope.formData.pubkey) return;
      promise = $q.when({
        pubkey: $scope.formData.pubkey
      });
    }

    if (!promise) {
      console.warn('[login] unknown method: ', method);
      return;
    }

    return promise.then(function(res) {
      if (!res) return;

      return $scope.closeModal({
        pubkey: res.pubkey,
        keypair: res.keypair,
        method: method,
        rememberMe: $scope.formData.rememberMe,
        params: res.params
      });
    });
  };

  $scope.scryptFormDataChanged = function() {
    if ($scope.computing) return; // avoid multiple call
    $scope.pubkey = null;
    $scope.pubkeyError = false;
    $scope.showPubkey = !!$scope.formData.username && !!$scope.formData.password;
    if ($scope.autoComputePubkey && $scope.showPubkey) {
      $scope.computePubkey();
      $scope.showComputePubkeyButton = false;
    }
    else {
      $scope.showComputePubkeyButton = !$scope.autoComputePubkey && $scope.showPubkey;
    }
  };
  $scope.$watch('formData.username + formData.password', $scope.scryptFormDataChanged, true);

  $scope.computePubkey = function() {
    $scope.showComputePubkeyButton = false;
    $scope.computing = true;
    $scope.pubkey = null;
    return $timeout(function() {
      var salt = $scope.formData.username;
      var pwd = $scope.formData.password;
      var scryptPrams = $scope.formData.scrypt && $scope.formData.scrypt.params;
      return CryptoUtils.scryptSignPk(salt, pwd, scryptPrams)
        .then(function (signPk) {

          // If model has changed before the response, then retry
          if (salt !== $scope.formData.username || pwd !== $scope.formData.password) {
            return $scope.computePubkey();
          }

          $scope.pubkey = CryptoUtils.util.encode_base58(signPk);
          if ($scope.expectedPubkey && $scope.expectedPubkey != $scope.pubkey) {
            $scope.pubkeyError = true;
          }

          $scope.computing = false;
        }
      )
      .catch(function (err) {
        UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR')(err);
        $scope.computing = false;
        $scope.scryptFormDataChanged();
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

  $scope.changeMethod = function(method){
    console.debug("[login] method changed: ", method);
    // Scrypt (advanced or not)
    if (method && (method.id == "SCRYPT_DEFAULT" || method.id == "SCRYPT_ADVANCED")) {
      $scope.changeScrypt(method.values && method.values[1]/*=default scrypt params*/);
      $scope.autoComputePubkey = $scope.autoComputePubkey && (method.id == "SCRYPT_DEFAULT");
    }
    else {
      $scope.formData.username = null;
      $scope.formData.password = null;
      $scope.formData.pubkey = null;
      $scope.formData.computing = false;
    }
  };

  $scope.changeScrypt = function(scrypt) {
    // Protect params against changes
    $scope.formData.scrypt = angular.copy(scrypt||{});
  };

  $scope.fileChanged = function(event) {
    $scope.validatingFile = true;
    $scope.formData.file = event && event.target && event.target.files && event.target.files.length && event.target.files[0];
    if (!$scope.formData.file) {
      $scope.validatingFile = false;
      return;
    }

    $timeout(function() {
      console.debug("[login] key file changed: ", $scope.formData.file);
      $scope.validatingFile = true;

      return CryptoUtils.readKeyFile($scope.formData.file, false/*withSecret*/)
        .then(function(keypair) {
          if (!keypair || !keypair.signPk) {
            $scope.formData.file.valid = false;
            $scope.formData.file.pubkey = undefined;
          }
          else {
            $scope.formData.file.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            $scope.formData.file.valid = !$scope.expectedPubkey || $scope.expectedPubkey == $scope.formData.file.pubkey;
            $scope.validatingFile = false;
          }

        })
        .catch(function(err) {
          $scope.validatingFile = false;
          $scope.formData.file.valid = false;
          $scope.formData.file.pubkey = undefined;
          UIUtils.onError('ERROR.AUTH_FILE_ERROR')(err);
        });
    });


  };

  $scope.readFileContent = function(content) {
    console.log(content);
  };

  $scope.removeKeyFile = function() {
    $scope.formData.file = undefined;
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



function AuthModalController($scope, $controller, parameters) {
  'ngInject';

  parameters = parameters || {};
  parameters.auth = true;

  // Initialize the super class and extend it.
  angular.extend(this, $controller('LoginModalCtrl', {$scope: $scope, parameters: parameters}));
}


/**
 * Manage automatic authentication reset
 * @param $scope
 * @param $ionicHistory
 * @param $state
 * @param $q
 * @param Idle
 * @param UIUtils
 * @param $ionicLoading
 * @param csWallet
 * @param csSettings
 * @constructor
 */
function AuthIdleController($scope, $ionicHistory, $state, $q, Idle, UIUtils, $ionicLoading, csWallet, csSettings) {
  'ngInject';

  $scope.enableAuthIdle = false;

  $scope.checkAuth = function(isAuth) {
    isAuth = angular.isDefined(isAuth) ? isAuth : csWallet.isAuth();
    var enable = csSettings.data.keepAuthIdle > 0 && csSettings.data.keepAuthIdle != 9999 && isAuth;
    var changed = ($scope.enableAuthIdle != enable);

    // need start/top watching
    if (changed) {
      // start idle
      if (enable) {
        console.debug("[app] Start auth idle (delay: {0}s)".format(csSettings.data.keepAuthIdle));
        Idle.setIdle(csSettings.data.keepAuthIdle);
        Idle.watch();
      }
      // stop idle, if need
      else if ($scope.enableAuthIdle){
        console.debug("[app] Stop auth idle");
        Idle.unwatch();
      }
      $scope.enableAuthIdle = enable;
    }

    // if idle time changed: apply it
    else if (enable && Idle.getIdle() !== csSettings.data.keepAuthIdle) {
      console.debug("[app] Updating auth idle (delay: {0}s)".format(csSettings.data.keepAuthIdle));
      Idle.setIdle(csSettings.data.keepAuthIdle);
    }
  };
  csSettings.api.data.on.changed($scope, function() {
    $scope.checkAuth();
  });

  // add listeners on wallet events
  csWallet.api.data.on.login($scope, function(walletData, deferred) {
    $scope.checkAuth();
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.auth($scope, function(walletData, deferred) {
    $scope.checkAuth(true);
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.unauth($scope, function() {
    $scope.checkAuth(false);
  });
  csWallet.api.data.on.logout($scope, function() {
    $scope.checkAuth(false);
  });

  $scope.$on('IdleStart', function() {
    if (!csSettings.data.rememberMe) {
      $ionicLoading.hide(); // close previous toast
      $ionicLoading.show({
        template: "<div idle-countdown=\"countdown\" ng-init=\"countdown=5\">{{'LOGIN.AUTO_LOGOUT.IDLE_WARNING'|translate:{countdown:countdown} }}</div>"
      });
    }
  });

  $scope.$on('IdleEnd', function() {
    if (!csSettings.data.rememberMe) {
      $ionicLoading.hide();
    }
  });

  $scope.$on('IdleTimeout', function() {
    // Keep user login, but remove auth
    if (csSettings.data.rememberMe) {
      return csWallet.unauth()
        .then(function () {
          $ionicHistory.clearCache();
        })
        .catch(UIUtils.onError());
    }

    // Do not keep user login, so = logout
    else {
      return csWallet.logout()
        .then(function () {
          $ionicHistory.clearCache();
          if ($state.current.data.auth === true) {
            $ionicHistory.clearHistory();
            return $scope.showHome();
          }
        })
        .then(function () {
          $ionicLoading.hide();
          return UIUtils.alert.confirm('LOGIN.AUTO_LOGOUT.MESSAGE',
            'LOGIN.AUTO_LOGOUT.TITLE', {
              cancelText: 'COMMON.BTN_CLOSE',
              okText: 'COMMON.BTN_LOGIN'
            });
        })
        .then(function (relogin) {
          if (relogin) {
            return $scope.loginAndGo($state.current.name, $state.params,
              {reload: true});
          }
        })
        .catch(UIUtils.onError());
    }
  });


  // Catch windows close event
  window.addEventListener("beforeunload", function(e){
    console.log("[auth idle] Getting event beforeunload");
    return "Are you sure ?";
  }, false);
}
