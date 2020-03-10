
angular.module('cesium.map.plugin', [
    'ui-leaflet',
    // Services
    'cesium.map.services',
    // Controllers
    'cesium.map.common.controllers',
    'cesium.map.wot.controllers',
    'cesium.map.registry.controllers',
    'cesium.map.network.controllers',
    'cesium.map.user.controllers',
    'cesium.map.settings.controllers',
    'cesium.map.help.controllers'
  ])

  // Configure plugin
  .config(function() {
    'ngInject';

    // Define icon prefix for AwesomeMarker (a Leaflet plugin)
    L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion';
  });


