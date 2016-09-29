angular.module('cesium.modal.services', [])

.factory('ModalUtils', function($ionicModal, $rootScope, $q, $injector, $controller, $timeout) {
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
        return modalScope.modal.show();
      };
      modalScope.closeModal = function (result) {
        deferred.resolve(result);
        return modalScope.modal.hide();
      };

      modalScope.getParameters = function () {
        return parameters;
      };
      modalScope.$on('modal.hidden', function (thisModal) {
        var currentScope = thisModal.currentScope;
        var modalScopeId = currentScope ? currentScope.$id : null;
        // Destroy modal's scope when hide animation finished - fix #145
        $timeout(function() {
          if (modalScopeId && thisScopeId === modalScopeId) {
            deferred.resolve(null);
            _cleanup(currentScope);
          }
        }, 900);
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
    return ModalUtils.show('templates/modal_about.html','AboutCtrl',
      parameters);
  }

  function showJoin(parameters) {
    return ModalUtils.show('templates/join/modal_join.html','JoinModalCtrl',
      parameters, {animation: 'slide-in-up'});
  }

  function showHelp(parameters) {
    return ModalUtils.show('templates/help/modal_help.html','HelpModalCtrl',
      parameters);
  }

  return {
    showTransfer: showTransfer,
    showLogin: showLogin,
    showWotLookup: showWotLookup,
    showAbout: showAbout,
    showJoin: showJoin,
    showHelp: showHelp
  };

});
