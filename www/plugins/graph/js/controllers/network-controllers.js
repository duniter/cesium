
angular.module('cesium.graph.network.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.network', {
        points: {
          'buttons': {
            templateUrl: "plugins/graph/templates/network/view_network_extend.html",
            controller: 'GpNetworkViewExtendCtrl'
          }
        }
      })
      ;
    }
  })

  .controller('GpNetworkViewExtendCtrl', GpNetworkViewExtendController)
;


function GpNetworkViewExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}
