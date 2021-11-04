var App, nw;

angular.module('cesium.desktop.services', ['cesium.device.services', 'cesium.settings.services'])

  .factory('csDesktop',  function($rootScope, Device) {
    'ngInject';

    Device.ready()
      .then(function() {
        if (!Device.isDesktop()) return;
        console.info("[desktop-service] Starting desktop service...");
        console.debug("[desktop-service] TODO: manage menu and other specific stuff here");
      });
  });
