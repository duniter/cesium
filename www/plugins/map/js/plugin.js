
angular.module('cesium.map.plugin', [
    'ui-leaflet',
    // Services
    'cesium.map.services',
    // Controllers
    'cesium.map.wot.controllers',
    'cesium.map.network.controllers'
  ])

  // Configure plugin
  .config(function() {
    'ngInject';

    // Define icon prefix for AwesomeMarker (a Leaflet plugin)
    L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion';
  });


