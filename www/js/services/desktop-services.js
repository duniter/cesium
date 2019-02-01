var App, nw;

angular.module('cesium.desktop.services', ['cesium.device.services', 'cesium.settings.services'])

  .factory('csDesktop',  function($rootScope, Device) {
    'ngInject';

    if (!Device.isDesktop()) return;

    console.info("Starting desktop mode...");
  });
