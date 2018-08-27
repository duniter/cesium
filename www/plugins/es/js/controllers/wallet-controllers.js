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

function ESWalletController($scope, $controller, $state, esModals, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.showProfileHelp = false;

  /* -- modals -- */

  $scope.showNewPageModal = function() {
    var wallet = ($state.params && $state.params.id) ? csWallet.children.get($state.params.id) : csWallet;
    if (!wallet) {
      UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
      return;
    }

    return esModals.showNewPage({wallet: wallet});
  };
}

