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

;

