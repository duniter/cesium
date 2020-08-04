
angular.module('cesium.map.user.controllers', ['cesium.services', 'cesium.map.services', 'cesium.map.common.controllers'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.edit_profile', {
          points: {
            'after-position': {
              templateUrl: 'plugins/map/templates/common/edit_position_extend.html',
              controller: 'MapProfileEditCtrl'
            }
          }
        })

        .extendState('app.edit_profile_by_id', {
          points: {
            'after-position': {
              templateUrl: 'plugins/map/templates/common/edit_position_extend.html',
              controller: 'MapProfileEditCtrl'
            }
          }
        });
    }
  })

  .controller('MapProfileEditCtrl', MapProfileEditController);


function MapProfileEditController($scope, $controller) {
  'ngInject';

  $scope.mapId = 'map-profile-' + $scope.$id;

  // Initialize the super classes and extend it.
  angular.extend(this, $controller('MapEditPositionAbstractCtrl', { $scope: $scope}));
}
