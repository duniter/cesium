
angular.module('cesium.es.network.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.network', {
        points: {
          'buttons': {
            templateUrl: "plugins/es/templates/network/view_network_extend.html",
            controller: 'ESNetworkViewExtendCtrl'
          }
        }
      })
      ;
    }
  })

  .controller('ESNetworkViewExtendCtrl', ESNetworkViewExtendController)
;


function ESNetworkViewExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}
