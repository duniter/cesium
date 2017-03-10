angular.module('cesium.es.currency.controllers', ['ngResource', 'cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.currency.tab_blocks', {
        points: {
          'nav-buttons': {
            templateUrl: "plugins/es/templates/currency/tab_blocks_extend.html",
            controller: 'ESCurrencyTabBlocksExtendCtrl'
          }
        }
      })
      ;
    }
  })

  .controller('ESCurrencyTabBlocksExtendCtrl', ESCurrencyTabBlocksExtendController)
;

function ESCurrencyTabBlocksExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
      csSettings.data.plugins.es.enable :
      !!csSettings.data.plugins.host;
  };

  $scope.enable = esSettings.isEnable();
  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}
