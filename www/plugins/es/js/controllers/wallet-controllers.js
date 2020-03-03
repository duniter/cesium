angular.module('cesium.es.wallet.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider
        .extendStates(['app.view_wallet', 'app.view_wallet_by_id'], {
          points: {
            'hero': {
              templateUrl: "plugins/es/templates/wallet/view_wallet_extend.html",
              controller: 'ESWalletLikesCtrl'
            },
            'after-general': {
              templateUrl: "plugins/es/templates/wallet/view_wallet_extend.html",
              controller: 'ESWalletViewCtrl'
            }
          }
        })

        .extendState('app.view_wallets', {
          points: {
            'item-wallet': {
              templateUrl: "plugins/es/templates/wallet/item_wallet_extend.html",
              controller: 'ESExtensionCtrl'
            }
          }
        })

      ;
    }

  })


  .controller('ESWalletViewCtrl', ESWalletViewController)

  .controller('ESWalletLikesCtrl', ESWalletLikesController)

;

function ESWalletViewController($scope, $controller, $state, csWallet, esModals) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.showProfileHelp = false;

  /* -- modals -- */

  $scope.showNewPageModal = function(event) {
    var wallet = ($state.params && $state.params.id) ? csWallet.children.get($state.params.id) : csWallet;
    if (!wallet) {
      UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
      return;
    }

    return esModals.showNewPage({wallet: wallet});
  };
}


function ESWalletLikesController($scope, $controller, UIUtils, esHttp, esProfile) {
  'ngInject';

  $scope.options = $scope.options || {};
  $scope.options.like = $scope.options.like || {
    index: 'user',
    type: 'profile',
    service: esProfile.like
  };
  $scope.canEdit = true; // Avoid to change like counter itself

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLikesCtrl', {$scope: $scope}));

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  // Load likes, when profile loaded
  $scope.$watch('formData.pubkey', function(pubkey) {
    if (pubkey) {
      $scope.loadLikes(pubkey);
    }
  });
}
