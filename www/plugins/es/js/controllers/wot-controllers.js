angular.module('cesium.es-wot.controllers', ['cesium.services'])

  .config(function(PluginServiceProvider) {
    'ngInject';
    PluginServiceProvider

    .extendState('app.wot_view_identity', {
       points: {
         'general': {
           templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
           controller: 'ESWotIdentityViewCtrl'
         }
       }
      })
    ;

  })

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)

;

function ESWotIdentityViewController($scope, PluginService) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

}
