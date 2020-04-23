
angular.module('cesium.login.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider
      .state('app.login', {
        url: "/login",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'LoginCtrl'
          }
        }
      })
    ;
  })

  .controller('LoginCtrl', LoginController)

  .controller('LoginModalCtrl', LoginModalController)

  .controller('AuthCtrl', AuthController)

;


function LoginController($scope, $timeout, $controller, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('HomeCtrl', {$scope: $scope}));

  $scope.showLoginModal = function() {
    if ($scope.loading) return $timeout($scope.showLoginModal, 500); // recursive call

    if (!csWallet.isLogin() && !$scope.error) {
      return $timeout(csWallet.login, 300);
    }
  };
  $scope.$on('$ionicView.enter', $scope.showLoginModal);

}

function LoginModalController($scope, $timeout, $q, $ionicPopover, $window, CryptoUtils, csCrypto, ionicReady,
                              UIUtils, BMA, Modals, csSettings, Device, parameters) {
  'ngInject';

  parameters = parameters || {};

  $scope.computing = false;
  $scope.pubkey = null;
  $scope.formData = {};
  $scope.showPubkey = false;
  $scope.showComputePubkeyButton = false;
  $scope.autoComputePubkey = false;
  $scope.pubkeyPattern = '^(:?{0}|{1})$'.format(BMA.constants.regexp.PUBKEY, BMA.constants.regexp.PUBKEY_WITH_CHECKSUM);

  $scope.isAuth = parameters.auth;
  $scope.okText = parameters.okText;
  $scope.title = parameters.title || ($scope.isAuth ? 'AUTH.TITLE' : 'LOGIN.TITLE');
  $scope.showMethods = angular.isDefined(parameters.showMethods) ? parameters.showMethods : true;
  $scope.showNewAccountLink = angular.isDefined(parameters.showNewAccountLink) ? parameters.showNewAccountLink : true;
  $scope.expectedPubkey = parameters.expectedPubkey;
  $scope.expectedUid = parameters.uid;

  $scope.scryptParamsValues = _.keys(CryptoUtils.constants.SCRYPT_PARAMS)
    .reduce(function(res, key) {
      return res.concat({id: key, label: 'LOGIN.SCRYPT.' + key, params: CryptoUtils.constants.SCRYPT_PARAMS[key]});
    }, [{id: 'USER', label: 'LOGIN.SCRYPT.USER', params: {}}]);

  // modal init
  $scope.init = function() {

    ionicReady().then(function(){
      // Should auto-compute pubkey ?
      $scope.autoComputePubkey = ionic.Platform.grade.toLowerCase()==='a' &&
        !UIUtils.screen.isSmall();
    });

    // Init remember me
    $scope.formData.rememberMe = csSettings.data.rememberMe;

    // Init keep auth, from idle time
    $scope.formData.keepAuthIdle = csSettings.data.keepAuthIdle;
    $scope.formData.keepAuth = ($scope.formData.keepAuthIdle == csSettings.constants.KEEP_AUTH_IDLE_SESSION);

    // Init method
    var method = parameters.method || csSettings.data.login && csSettings.data.login.method || 'SCRYPT_DEFAULT';
    var params = csSettings.data.login && csSettings.data.login.params;
    // used default method, when PUBKEY + auth, or SCAN, or if ask for 'default'
    if (($scope.isAuth && method === 'PUBKEY') || (method === 'SCAN') || (method === 'default')) {
      method = 'SCRYPT_DEFAULT';
    }
    $scope.changeMethod(method, params);
  };

  // modal enter
  $scope.enter = function() {
    UIUtils.loading.hide();
    // Ink effect
    UIUtils.ink({selector: '.modal-login .ink'});
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
  $scope.doLogin = function(skipForm) {
    var method = $scope.formData.method;

    if(!$scope.form.$valid && method !== 'SCAN') return;

    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)

    var keepAuthIdle = $scope.formData.keepAuthIdle;
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
          if (parameters.expectedPubkey && parameters.expectedPubkey != pubkey) {
            $scope.pubkey = pubkey;
            $scope.showPubkey = true;
            $scope.pubkeyError = true;
            return UIUtils.loading.hide(10);
          }

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

      // If checkbox keep auth checked: set idle time to session
      keepAuthIdle = ($scope.formData.keepAuth && csSettings.constants.KEEP_AUTH_IDLE_SESSION) || keepAuthIdle;

      promise =
        UIUtils.loading.show()
        .then(function() {
          return $scope.readKeyFile($scope.formData.file, {
            withSecret: ($scope.isAuth || $scope.formData.keepAuth)
          });
        })
        .then(function(keypair) {
          if (!keypair) return UIUtils.loading.hide(10);
          var pubkey = CryptoUtils.util.encode_base58(keypair.signPk);

          // Check pubkey
          if (parameters.expectedPubkey && parameters.expectedPubkey != pubkey) {
            $scope.formData.file.valid = false;
            return UIUtils.loading.hide(10);
          }

          $scope.pubkeyError = false;

          return {
            pubkey: pubkey,
            keypair: keypair
          };
        })
        .catch(UIUtils.onError('ERROR.AUTH_FILE_ERROR'));
    }

    // Pubkey
    else if (method === 'PUBKEY') {
      var pubkey = $scope.formData.pubkey && $scope.formData.pubkey.trim();
      var uid = $scope.formData.uid && $scope.formData.uid.trim() || undefined;
      if (!pubkey) return;
      var matches = BMA.regexp.PUBKEY.exec(pubkey);
      // valid pubkey: use it
      if (matches) {
        promise = UIUtils.loading.show()
          .then(function() {
            return {
              pubkey: pubkey,
              uid : uid
            };
          });
      }

      // Check checksum
      else {

        matches = BMA.regexp.PUBKEY_WITH_CHECKSUM.exec(pubkey);
        if (matches) {

          pubkey = matches[1];
          var checksum = matches[2];
          var expectedChecksum = csCrypto.util.pkChecksum(pubkey);
          if (checksum != expectedChecksum) {
            $scope.form.pubkey.$error = {checksum: true};
          }
          else {
            promise = UIUtils.loading.show()
              .then(function() {
                return {
                  pubkey: pubkey,
                  uid : uid
                };
              });
          }
        }
        // Not a pubkey: launch search on
        else {
          return $scope.showWotLookupModal(pubkey);
        }
      }
    }

    // Scan QR code
    else if (method === 'SCAN') {
      var valid = $scope.formData.pubkey && (!$scope.isAuth || !!$scope.formData.keypair);
      if (!valid) return;

      promise = UIUtils.loading.show()
        .then(function() {
          return {
            pubkey: $scope.formData.pubkey,
            keypair: $scope.formData.keypair
          };
        });
    }

    if (!promise) {
      console.warn('[login] unknown method: ', method);
      return;
    }

    return promise.then(function(res) {
      if (!res) return;

      // Update settings (if need)
      var rememberMeChanged = !angular.equals(csSettings.data.rememberMe, $scope.formData.rememberMe);
      var keepAuthIdleChanged = !angular.equals(csSettings.data.keepAuthIdle, keepAuthIdle);
      var methodChanged = !angular.equals(csSettings.data.login && csSettings.data.login.method, method);
      var paramsChanged = !angular.equals(csSettings.data.login && csSettings.data.login.params, res.params);
      if (rememberMeChanged || keepAuthIdleChanged || methodChanged || paramsChanged) {
        csSettings.data.rememberMe = $scope.formData.rememberMe;
        csSettings.data.keepAuthIdle = keepAuthIdle;
        csSettings.data.useLocalStorage = csSettings.data.rememberMe ? true : csSettings.data.useLocalStorage;
        csSettings.data.login = csSettings.data.login || {};
        csSettings.data.login.method = method;
        csSettings.data.login.params = res.params;
        $timeout(csSettings.store, 500);
      }

      if (parameters.success) {
        parameters.success($scope.formData);
      }

      // hide loading
      if (parameters.silent) {
        UIUtils.loading.hide();
      }

      // Return result then close
      return $scope.closeModal(res);
    });
  };

  $scope.onScryptFormChanged = function() {
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
  $scope.$watch('formData.username + formData.password', $scope.onScryptFormChanged, true);

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
        $scope.autoComputePubkey = false; // Avoid a infinite loop (computePubkey -> onScryptFormChanged -> computePubkey)
        $scope.onScryptFormChanged();
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

  $scope.doScan = function() {
    if ($scope.computing) return;

    $scope.computing = true;
    $scope.formData.pubkey = null;
    $scope.formData.keypair = null;

    // Run scan cordova plugin, on device
    return Device.barcode.scan()
      .then(function(data) {
        if (!data) return;

        // Skip simple parsing, if auth if need
        if ($scope.isAuth) return $q.when(data);

        // Try to parse as an URI
        return BMA.uri.parse(data)
          .then(function (res) {
            if (!res || !res.pubkey) throw {message: 'ERROR.SCAN_UNKNOWN_FORMAT'};
            // If simple pubkey
            return res;
          })
          .catch(function(err) {
            console.debug('[login] Error while parsing as URI: ' + (err && err.message || err));
            return data;
          });
      })
      .then(function(data) {
        if (!data) return;
        // Parse success: continue
        if (data && data.pubkey) return data;

        // Try to read as WIF format
        return csCrypto.keyfile.parseData(data, {silent: true})
          .then(function(keypair) {
            if (!keypair || !keypair.signPk || !keypair.signSk) throw {message: 'ERROR.SCAN_UNKNOWN_FORMAT'}; // rethrow an error

            var pubkey = CryptoUtils.base58.encode(keypair.signPk);

            // Login using keypair
            return {
              pubkey: pubkey,
              keypair: keypair
            };
          })
          // Unknown format (nor URI, nor WIF/EWIF)
          .catch(UIUtils.onError('ERROR.SCAN_UNKNOWN_FORMAT'));
      })
      .then(function(res) {
        if (!res || !res.pubkey) return; // no data

        $scope.pubkeyError = $scope.expectedPubkey && $scope.expectedPubkey != res.pubkey;
        $scope.formData.pubkey = res.pubkey;
        $scope.formData.keypair = res.keypair;
      })
      .then(function() {
        $scope.computing = false;
        UIUtils.loading.hide(10);
      })
      .catch(function(err) {
        $scope.computing = false;
        UIUtils.onError('ERROR.SCAN_FAILED')(err);
      });
  };

  $scope.changeMethod = function(method, params){
    $scope.hideMethodsPopover();

    if (!method || method === $scope.formData.method) return; // same method

    console.debug("[login] method is: " + method);
    $scope.formData.method = method;
    $scope.formData.uid = null;

    if ($scope.form) {
      // hide form's fields errors on the form
      delete $scope.form.$submitted;
    }

    // Scrypt (advanced or not)
    if (method === 'SCRYPT_DEFAULT' || method === 'SCRYPT_ADVANCED') {
      $scope.pubkey = null;


      // Search scrypt object
      var scrypt;
      if (params) {
        scrypt = _.find($scope.scryptParamsValues, function(item){
            return item.params && angular.equals(item.params, params);
          });
        if (!scrypt) {
          scrypt = _.findWhere($scope.scryptParamsValues, {id: 'USER'}) || {};
          scrypt.params = params;
        }
      }
      else {
        scrypt = _.findWhere($scope.scryptParamsValues, {id: 'DEFAULT'});
      }
      $scope.changeScrypt(scrypt);

      $scope.autoComputePubkey = $scope.autoComputePubkey && (method === 'SCRYPT_DEFAULT');
    }
    else if (method === 'SCAN') {
      return $scope.doScan();
    }
    else {
      $scope.formData.username = null;
      $scope.formData.password = null;
      $scope.formData.pubkey = null;
      $scope.pubkey = null;
      $scope.computing = false;
    }
  };

  $scope.changeScrypt = function(scrypt) {
    // Protect params against changes
    $scope.formData.scrypt = angular.copy(scrypt||{});
    $scope.onScryptFormChanged();
  };

  $scope.readKeyFile = function(file, options) {
    options = options || {};

    options.password = options.password || $scope.formData.file.password || function() {
      $scope.formData.file.password = undefined;
      return Modals.showPassword({
            title: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.TITLE',
            subTitle: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.HELP',
            error: options.error,
            scope: $scope
          })
          .then(function (password) {
            // Remember password (for validation)
            $scope.formData.file.password = password;
            // Timeout is need to force popup to be hide
            return $timeout(function() {
              return password;
            }, 150);
          });
      };

    return csCrypto.keyfile.read($scope.formData.file, options)
      .catch(function(err) {
        $scope.formData.file.password = undefined;
        if (err === 'CANCELLED') {
          UIUtils.loading.hide(10);
        }
        if (err && err.ucode == csCrypto.errorCodes.BAD_PASSWORD) {
          // Recursive call
          return $scope.readKeyFile($scope.formData.file, {withSecret: options.withSecret, error: 'ACCOUNT.SECURITY.KEYFILE.ERROR.BAD_PASSWORD'});
        }
        throw err;
      });
  };

  $scope.onFileChanged = function(file) {
    if (!file || !file.fileData) {
      $scope.validatingFile = false;
      return; // Skip
    }
    $scope.formData.file = {
      name: file.fileData.name,
      size: file.fileData.size,
      content: file.fileContent
    };
    $scope.validatingFile = true;
    $timeout(function() {
      console.debug("[login] key file changed: ", $scope.formData.file);
      $scope.validatingFile = true;

      return $scope.readKeyFile($scope.formData.file, {withSecret: false, password: $scope.formData.file.password})
        .then(function(keypair) {
          if (!keypair || !keypair.signPk) {
            $scope.formData.file.valid = false;
            $scope.formData.file.pubkey = undefined;
          }
          else {
            $scope.formData.file.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            $scope.formData.file.valid = !$scope.expectedPubkey || $scope.expectedPubkey === $scope.formData.file.pubkey;
            $scope.validatingFile = false;
          }

        })
        .catch(function(err) {
          if (err && err === 'CANCELLED') {
            $scope.removeKeyFile();
            return;
          }
          $scope.validatingFile = false;
          $scope.formData.file.valid = false;
          $scope.formData.file.pubkey = undefined;
          UIUtils.onError('ERROR.AUTH_FILE_ERROR')(err);
        });
    });
  };

  $scope.removeKeyFile = function() {
    $scope.formData.file = undefined;
  };

  /* -- modals -- */

  $scope.showWotLookupModal = function(searchText) {
    return Modals.showWotLookup({q: searchText})
      .then(function(res){
        if (res && res.pubkey) {
          $scope.formData.pubkey = res.pubkey;
          $scope.formData.uid = res.uid || undefined;
          return $timeout($scope.doLogin, 300);
        }
      });
  };

  /* -- popover -- */
  $scope.showMethodsPopover = function(event) {
    if (event.defaultPrevented) return;
    UIUtils.popover.show(event, {
      templateUrl :'templates/login/popover_methods.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.methodsPopover = popover;
        UIUtils.ink({selector: '.popover-login-methods .item'});
      }
    });
  };

  $scope.hideMethodsPopover = function() {
    if ($scope.methodsPopover) {
      $scope.methodsPopover.hide();
      $scope.methodsPopover = null;
    }
  };

  // Default action
  $scope.init();


  // TODO : for DEV only
  /*$timeout(function() {
    $scope.formData = {
      method: 'SCRYPT_DEFAULT',
      username: 'abc',
      password: 'def'
    };
    $scope.form = {$valid:true};

    $timeout($scope.doLogin, 500);
  }, 900); */
}


function AuthController($scope, $controller){

  // Initialize the super class and extend it.
  angular.extend(this, $controller('LoginModalCtrl', {$scope: $scope, parameters: {auth: true}}));

  $scope.setForm = function(form) {
    $scope.form = form;
  };

}
