angular.module('cesium.es.wallet.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.view_wallet', {
          points: {
            'before-technical': {
              templateUrl: "plugins/es/templates/wallet/view_wallet_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            }
          }
        })
      ;
    }

  })

 .controller('ESWalletCtrl', ESWalletViewController)

;

function ESWalletViewController($scope, esSettings) {
  'ngInject';

  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });

}
