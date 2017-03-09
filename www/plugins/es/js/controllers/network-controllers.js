
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


function ESNetworkViewExtendController($scope, PluginService, csSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
      csSettings.data.plugins.es.enable :
      !!csSettings.data.plugins.host;
  };

  csSettings.api.data.on.changed($scope, $scope.updateView);
  csSettings.api.data.on.ready($scope, $scope.updateView);
}
