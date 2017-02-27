angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
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

  $scope.showNewMessageModal = function(confirm) {
    return $scope.loadWallet({minData: true})

      .then(function() {
        UIUtils.loading.hide();

        // Ask confirmation, if user has no Cesium+ profil
        if (!confirm && !$scope.formData.profile) {
          return UIUtils.alert.confirm('MESSAGE.CONFIRM.USER_HAS_NO_PROFILE')
            .then(function (confirm) {
              // Recursive call (with confirm flag)
              if (confirm) return true;
            });
        }
        return true;
      })
      // Open modal
      .then(function(confirm) {
        if (!confirm) return false;

        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        });
      });
  };
}
