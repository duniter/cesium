angular.module('cesium.es.wallet.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider
        .extendStates(['app.view_wallet', 'app.view_wallet_by_id'], {
          points: {
            'after-general': {
              templateUrl: "plugins/es/templates/wallet/view_wallet_extend.html",
              controller: 'ESWalletCtrl'
            }
          }
        })
      ;
    }

  })


  .controller('ESWalletCtrl', ESWalletController)

;

function ESWalletController($scope, $controller, esModals) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.showProfileHelp = false;

  /* -- modals -- */

  $scope.showNewPageModal = function() {
    return esModals.showNewPage();
  };
}

