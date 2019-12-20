angular.module('cesium.modal.services', ['cesium.utils.services'])

// Useful for modal with no controller
.controller('EmptyModalCtrl', function () {
  'ngInject';

})

.controller('AboutModalCtrl', function ($scope, UIUtils, csHttp) {
  'ngInject';

  $scope.openLink = function(event, uri, options) {
    options = options || {};

    // If unable to open, just copy value
    options.onError = function() {
      return UIUtils.popover.copy(event, uri);
    };

    return csHttp.uri.open(uri, options);
  };
})

.factory('ModalUtils', function($ionicModal, $rootScope, $q, $injector, $controller, $timeout, Device) {
  'ngInject';


  function _evalController(ctrlName) {
    var result = {
        isControllerAs: false,
        controllerName: '',
        propName: ''
    };
    var fragments = (ctrlName || '').trim().split(/\s+/);
    result.isControllerAs = fragments.length === 3 && (fragments[1] || '').toLowerCase() === 'as';
    if (result.isControllerAs) {
        result.controllerName = fragments[0];
        result.propName = fragments[2];
    } else {
        result.controllerName = ctrlName;
    }

    return result;
  }

  function DefaultModalController($scope, deferred, parameters) {

    $scope.deferred = deferred || $q.defer();
    $scope.resolved = false;

    $scope.openModal = function () {
      return $scope.modal.show();
    };

    $scope.hideModal = function () {
      return $scope.modal.hide();
    };

    $scope.closeModal = function (result) {
      $scope.resolved = true;

      // removeIf(no-device)
      if (Device.enable) Device.keyboard.close();
      // endRemoveIf(no-device)

      return $scope.modal.remove()
        .then(function() {
          // Workaround modal-open not removed
          document.body.classList.remove('modal-open');
          $scope.deferred.resolve(result);
          return result;
        });
    };


    // Useful method for modal with forms
    $scope.setForm = function (form, propName) {
      if (propName) {
        $scope[propName] = form;
      }
      else {
        $scope.form = form;
      }
    };

    // Useful method for modal to get input parameters
    $scope.getParameters = function () {
      return parameters;
    };

    $scope.$on('modal.hidden', function () {
      // If not resolved yet: send result
      // (after animation out)
      if (!$scope.resolved) {
        $scope.resolved = true;

        $timeout(function() {
          $scope.deferred.resolve();
          return $scope.modal.remove().then(function() {
            // Workaround modal-open not removed
            document.body.classList.remove('modal-open');
          });
        }, ($scope.modal.hideDelay || 320) + 20);
      }
    });
  }

  function show(templateUrl, controller, parameters, options) {
    var deferred = $q.defer();

    options = options ? options : {} ;
    options.animation = options.animation || 'slide-in-up';

    var focusFirstInput = false;
    // removeIf(device)
    focusFirstInput = angular.isDefined(options.focusFirstInput) ? options.focusFirstInput : false;
    // endRemoveIf(device)
    options.focusFirstInput = focusFirstInput;

    // If modal has a controller
    if (controller) {
      // If a controller defined, always use a new scope
      options.scope = options.scope ? options.scope.$new() : $rootScope.$new();
      DefaultModalController.call({}, options.scope, deferred, parameters);

      // Invoke the controller on this new scope
      var locals = { '$scope': options.scope, 'parameters': parameters };
      var ctrlEval = _evalController(controller);
      var ctrlInstance = $controller(controller, locals);
      if (ctrlEval.isControllerAs) {
        ctrlInstance.openModal = options.scope.openModal;
        ctrlInstance.closeModal = options.scope.closeModal;
      }
    }

    $ionicModal.fromTemplateUrl(templateUrl, options)
      .then(function (modal) {
          if (controller) {
            // Set modal into the controller's scope
            modal.scope.$parent.modal = modal;
          }
          else {
            var scope = modal.scope;
            // Define default scope functions
            DefaultModalController.call({}, scope, deferred, parameters);
            // Set modal
            scope.modal = modal;
          }

          // Show the modal
          return modal.show();
        },
        function (err) {
          deferred.reject(err);
        });

    return deferred.promise;
  }

  return {
    show: show
  };
})

.factory('Modals', function($rootScope, $translate, $ionicPopup, $timeout, ModalUtils, UIUtils) {
  'ngInject';

  function showTransfer(parameters) {
    var useDigitKeyboard = UIUtils.screen.isSmall();
    return ModalUtils.show('templates/wallet/modal_transfer.html','TransferModalCtrl',
      parameters, {
        focusFirstInput: !useDigitKeyboard
      });
  }

  function showLogin(parameters) {
    return ModalUtils.show('templates/login/modal_login.html','LoginModalCtrl',
      parameters, {focusFirstInput: true, backdropClickToClose: false});
  }

  function showWotLookup(parameters) {
    return ModalUtils.show('templates/wot/modal_lookup.html','WotLookupModalCtrl',
      parameters || {}, {focusFirstInput: true});
  }

  function showNetworkLookup(parameters) {
    return ModalUtils.show('templates/network/modal_network.html', 'NetworkLookupModalCtrl',
      parameters, {focusFirstInput: true});
  }

  function showAbout(parameters) {
    return ModalUtils.show('templates/modal_about.html','AboutModalCtrl',
      parameters);
  }

  function showAccountSecurity(parameters) {
    return ModalUtils.show('templates/wallet/modal_security.html', 'WalletSecurityModalCtrl',
      parameters);
  }

  function showJoin(parameters) {
    return ModalUtils.show('templates/join/modal_choose_account_type.html','JoinChooseAccountTypeModalCtrl',
      parameters)
      .then(function(res){
        if (!res) return;
        return (res.accountType == 'member') ?
          showJoinMember(res) :
          showJoinWallet(res);
      });
  }

  function showJoinMember(parameters) {
    return ModalUtils.show('templates/join/modal_join_member.html','JoinModalCtrl',
      parameters);
  }

  function showJoinWallet(parameters) {
    return ModalUtils.show('templates/join/modal_join_wallet.html','JoinModalCtrl',
      parameters);
  }

  function showHelp(parameters) {
    return ModalUtils.show('templates/help/modal_help.html','HelpModalCtrl',
      parameters);
  }

  function showLicense(parameters) {
    return ModalUtils.show('templates/currency/modal_license.html','CurrencyLicenseModalCtrl',
      parameters);
  }

  function showSelectPubkeyIdentity(parameters) {
    return ModalUtils.show('templates/wot/modal_select_pubkey_identity.html', 'WotSelectPubkeyIdentityModalCtrl',
      parameters);
  }

  function showSelectWallet(parameters) {
    return ModalUtils.show('templates/wallet/list/modal_wallets.html','WalletSelectModalCtrl',
      parameters);
  }

  function showPassword(options) {
    options = options || {};
    options.title = options.title || 'COMMON.SET_PASSWORD_TITLE';
    options.subTitle = options.subTitle || 'COMMON.SET_PASSWORD_SUBTITLE';
    var scope = options.scope ? options.scope.$new() : $rootScope.$new();
    scope.formData = {password: undefined};
    scope.setForm = function(form) {
      scope.form=form;
    };
    scope.submit = function(e) {
      scope.form.$submitted=true;
      if (e && e.preventDefault) e.preventDefault();
      if(scope.form.$valid && scope.formData.password) {
        options.popup.close(scope.formData.password);
      }
    };

    scope.error = options.error || undefined;

    // Choose password popup
    return $translate([options.title, options.subTitle, 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
      .then(function (translations) {
        options.popup = $ionicPopup.show({
          templateUrl: 'templates/common/popup_password.html',
          title: translations[options.title],
          subTitle: translations[options.subTitle],
          scope: scope,
          buttons: [
            { text: translations['COMMON.BTN_CANCEL'] },
            { text: translations['COMMON.BTN_OK'],
              type: 'button-positive',
              onTap: scope.submit
            }
          ]
        });
        return options.popup;
      });

  }

  return {
    showTransfer: showTransfer,
    showLogin: showLogin,
    showWotLookup: showWotLookup,
    showNetworkLookup: showNetworkLookup,
    showAbout: showAbout,
    showJoin: showJoin,
    showJoinMember: showJoinMember,
    showJoinWallet: showJoinWallet,
    showHelp: showHelp,
    showAccountSecurity: showAccountSecurity,
    showLicense: showLicense,
    showSelectPubkeyIdentity: showSelectPubkeyIdentity,
    showSelectWallet: showSelectWallet,
    showPassword: showPassword
  };

})

.factory('csPopovers', function($rootScope, $translate, $ionicPopup, $timeout, UIUtils, $controller) {
    'ngInject';

    function showSelectWallet(event, options) {
      options = options || {};

      var parameters = options.parameters || {};
      delete options.parameters;

      var scope = options.scope && options.scope.$new() || $rootScope.$new(true);
      options.scope = scope;
      options.templateUrl = 'templates/wallet/list/popover_wallets.html';
      options.autoremove = true;

      // Initialize the popover controller, with parameters
      angular.extend(this, $controller('WalletSelectPopoverCtrl', {$scope: options.scope, parameters: parameters}));

      var afterShowSaved = options.afterShow;
      options.afterShow = function(popover) {

        // Add a missing method, to close the popover
        scope.closePopover = function(res) {
          popover.scope.closePopover(res);
        };

        // Execute default afterShow fn, if any
        if (afterShowSaved) afterShowSaved(popover);
      };
      // Show the popover
      return UIUtils.popover.show(event, options)
        .then(function(res) {
          // Then destroy the scope
          scope.$destroy();
          return res;
        });
    }

    return {
      showSelectWallet: showSelectWallet
    };

  });
