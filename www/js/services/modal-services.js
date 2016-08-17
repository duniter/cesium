angular.module('cesium.modal.services', [])

.factory('ModalUtils', function($ionicModal, $rootScope, $q, $injector, $controller) {
  'ngInject';


  function show(templateUrl, controller, parameters, options) {
    // Grab the injector and create a new scope
    var deferred = $q.defer(),
        ctrlInstance,
        modalScope = $rootScope.$new(),
        thisScopeId = modalScope.$id;

    modalScope.setForm = function (form, propName) {
      if (propName) {
        modalScope[propName] = form;
      }
      else {
        modalScope.form = form;
      }
    };

    controller = controller ? controller : 'EmptyModalCtrl';

    options = options ? options : {} ;
    options.scope = options.scope ? options.scope : modalScope;
    options.animation = options.animation ? options.animation : 'slide-in-up';

    $ionicModal.fromTemplateUrl(templateUrl, options)
    .then(function (modal) {
      modalScope.modal = modal;

      modalScope.openModal = function () {
        modalScope.modal.show();
      };
      modalScope.closeModal = function (result) {
        deferred.resolve(result);
        modalScope.modal.hide();
      };

      modalScope.getParameters = function () {
        return parameters;
      };
      modalScope.$on('modal.hidden', function (thisModal) {
        if (thisModal.currentScope) {
          var modalScopeId = thisModal.currentScope.$id;
          if (thisScopeId === modalScopeId) {
            deferred.resolve(null);
            _cleanup(thisModal.currentScope);
          }
        }
      });

      // Invoke the controller
      var locals = { '$scope': modalScope, 'parameters': parameters };
      var ctrlEval = _evalController(controller);
      ctrlInstance = $controller(controller, locals);
      if (ctrlEval.isControllerAs) {
        ctrlInstance.openModal = modalScope.openModal;
        ctrlInstance.closeModal = modalScope.closeModal;
      }

      modalScope.modal.show();

    },
    function (err) {
      deferred.reject(err);
    });

    return deferred.promise;
  }

  function _cleanup(scope) {
    scope.$destroy();
    if (scope.modal) {
      scope.modal.remove();
    }
  }

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
      parameters, {focusFirstInput: true});
  }

  function showAbout(parameters) {
    return ModalUtils.show('templates/home/modal_about.html','EmptyModalCtrl',
      parameters);
  }

  function showNewAccount(parameters) {
      return ModalUtils.show('templates/home/modal_new_account.html','NewAccountModalCtrl',
        parameters, {animation: 'slide-in-up'});
    }


  return {
    showTransfer: showTransfer,
    showLogin: showLogin,
    showWotLookup: showWotLookup,
    showAbout: showAbout,
    showNewAccount: showNewAccount
  };

});
