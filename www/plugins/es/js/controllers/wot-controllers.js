angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider) {
    'ngInject';
    PluginServiceProvider

    .extendState('app.wot_view_identity', {
       points: {
         'general': {
           templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
           controller: 'ESWotIdentityViewCtrl'
         },
         'buttons': {
           templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
           controller: 'ESWotIdentityViewCtrl'
         }
       }
      })
    ;

  })

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)

;

function ESWotIdentityViewController($scope, PluginService, esModals) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.showNewMessageModal = function() {
    return $scope.loadWallet()
      .then(function() {
        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        });
      });
  };
}
