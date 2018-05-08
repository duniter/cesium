angular.module('cesium.es.wallet.controllers', ['cesium.es.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider.extendState('app.view_wallet', {
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

function ESWalletController($scope, $controller, esModals,csWallet,UIUtils,esProfile) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESWotIdentityViewCtrl', {$scope: $scope}));

  /* -- modals -- */

  $scope.showNewPageModal = function() {
    return esModals.showNewPage();
  };

  $scope.deleteProfile = function(){    
        return csWallet && csWallet.auth({minData: true}) 
      .then(function(walletData) {
       UIUtils.loading.hide();
       UIUtils.alert.confirm('PROFILE.CONFIRM.DELETE')
         .then(function(confirm) {
              if (confirm){ 
                  esProfile.remove(walletData.pubkey)
                  .then(function () {
                    $scope.formData.name=null;
                    $scope.formData.profile = null;
                    $scope.doUpdate(true);
                  UIUtils.toast.show('PROFILE.INFO.PROFILE_REMOVED');
               }).catch(UIUtils.onError('PROFILE.ERROR.REMOVE_PROFILE_FAILED'));
              }
            });
      });
  };
}

