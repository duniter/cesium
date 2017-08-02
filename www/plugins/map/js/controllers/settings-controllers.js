angular.module('cesium.map.settings.controllers', ['cesium.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Extend settings via extension points
      PluginServiceProvider.extendState('app.es_settings', {
        points: {
          'common': {
            templateUrl: "plugins/map/templates/settings/es_settings_extend.html"
          }
        }
      });
    }
  })

;


