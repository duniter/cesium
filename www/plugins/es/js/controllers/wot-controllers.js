angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.wot_identity', {
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
    }

  })

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)

;

function ESWotIdentityViewController($scope, csSettings, PluginService, esModals, UIUtils) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
      csSettings.data.plugins.es.enable :
      !!csSettings.data.plugins.host;
  };

  csSettings.api.data.on.changed($scope, function() {
    $scope.updateView();
  });

  $scope.updateView();

  /* -- modals -- */

  $scope.showNewMessageModal = function() {
    return $scope.loadWallet({minData: true})
      .then(function() {
        UIUtils.loading.hide();
        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        });
      });
  };
}
