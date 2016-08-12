angular.module('cesium.es.settings.controllers', ['cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider) {
    'ngInject';
    PluginServiceProvider

    // Settings extension points
    .extendState('app.settings', {
       points: {
         'network': {
           templateUrl: "plugins/es/templates/settings/settings_extend.html",
           controller: "ESExtendSettingsCtrl"
         }
       }
      })
    ;
  })

 .controller('ESExtendSettingsCtrl', ESExtendSettingsController)

;

/*
 * Settings extend controller
 */
function ESExtendSettingsController ($scope, UIUtils, PluginService, APP_CONFIG, esHttp, esMarket, esRegistry, esUser) {

  $scope.extensionPoint = PluginService.extensions.points.current.get();

  // Update settings if need
  $scope.onSettingsLoaded = function() {
    if ($scope.loading) {
      if (!$scope.formData.esNode && APP_CONFIG.DUNITER_NODE_ES) {
        $scope.formData.esNode = APP_CONFIG.DUNITER_NODE_ES;
      }
    }
  };
  $scope.$watch('formData', $scope.onSettingsLoaded, true);

  // Change ESnode
  $scope.changeEsNode= function(node) {
    if (!node) {
      node = $scope.formData.esNode;
    }
    $scope.showNodePopup(node)
    .then(function(node) {
      if (node == $scope.formData.esNode) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var newInstance = esHttp.instance(node);
      esHttp.copy(newInstance);

      newInstance = esMarket.instance(node);
      esMarket.copy(newInstance);

      newInstance = esRegistry.instance(node);
      esRegistry.copy(newInstance);

      newInstance = esUser.instance(node);
      esUser.copy(newInstance);

      $scope.formData.esNode = node;

      UIUtils.loading.hide(10);
    });
  };
}
