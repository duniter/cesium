angular.module('cesium.es.currency.controllers', ['ngResource', 'cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.currency.tab_blocks', {
        points: {
          'nav-buttons': {
            templateUrl: "plugins/es/templates/currency/tab_blocks_extend.html",
            controller: 'ESExtensionCtrl'
          }
        }
      })
      ;
    }
  })
;

