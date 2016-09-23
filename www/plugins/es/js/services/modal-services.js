angular.module('cesium.es.modal.services', ['cesium.modal.services', 'cesium.es.message.services'])

.factory('esModals', function(ModalUtils) {
  'ngInject';

  function showMessageCompose(parameters) {
    return ModalUtils.show('plugins/es/templates/message/modal_compose.html','ESMessageComposeModalCtrl',
      parameters, {focusFirstInput: true});
  }

  return {
    showMessageCompose: showMessageCompose
  };

});
