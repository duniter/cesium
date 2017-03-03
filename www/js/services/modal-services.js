angular.module('cesium.modal.services', [])

.factory('ModalUtils', function($ionicModal, $rootScope, $q, $injector, $controller, $timeout) {
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

    $scope.closeModal = function (result) {
      $scope.resolved = true;
      return $scope.modal.remove()
        .then(function() {
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
          return $scope.modal.remove();
        }, ($scope.modal.hideDelay || 320) + 20);
      }
    });
  }

  function show(templateUrl, controller, parameters, options) {
    var deferred = $q.defer();

    options = options ? options : {} ;
    options.animation = options.animation || 'slide-in-up';

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

.factory('Modals', function(ModalUtils) {
  'ngInject';


  function showTransfer(parameters) {
    return ModalUtils.show('templates/wallet/modal_transfer.html','TransferModalCtrl',
      parameters, {focusFirstInput: true});
  }

  function showLogin(parameters) {
    return ModalUtils.show('templates/modal_login.html','LoginModalCtrl',
      parameters, {focusFirstInput: true});
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
    return ModalUtils.show('templates/modal_about.html','AboutCtrl',
      parameters);
  }

  function showAccountSecurity(parameters) {
    return ModalUtils.show('templates/wallet/modal_security.html', 'WalletSecurityModalCtrl',
      parameters);
  }

  function showJoin(parameters) {
    return ModalUtils.show('templates/join/modal_join.html','JoinModalCtrl',
      parameters);
  }

  function showHelp(parameters) {
    return ModalUtils.show('templates/help/modal_help.html','HelpModalCtrl',
      parameters);
  }


  return {
    showTransfer: showTransfer,
    showLogin: showLogin,
    showWotLookup: showWotLookup,
    showNetworkLookup: showNetworkLookup,
    showAbout: showAbout,
    showJoin: showJoin,
    showHelp: showHelp,
    showAccountSecurity: showAccountSecurity
  };

});
