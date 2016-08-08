
angular.module('cesium.plugins', [
    'cesium.plugins.translations',
    'cesium.plugins.templates',
    // Services
    'cesium.es.services',
    'cesium.social.services',
    'cesium.registry.services',
    'cesium.market.services',
    'cesium.user.services',
    // Controllers
    'cesium.es.controllers',
    'cesium.market.controllers',
    'cesium.registry.controllers',
    'cesium.user.controllers'
  ])
;
