
angular.module('cesium.plugins', [
    'cesium.plugins.translations',
    'cesium.plugins.templates',
    // Services
    'cesium.registry.services',
    'cesium.market.services',
    'cesium.user.services',
    // Controllers
    'cesium.registry.controllers',
    'cesium.market.controllers',
    'cesium.user.controllers'
  ])
;
