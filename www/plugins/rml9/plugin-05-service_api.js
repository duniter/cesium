
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {
      // [NEW] Will force to load this RML9 service
      PluginServiceProvider.registerEagerLoadingService('rml9Service');
    }

  })

  // [NEW] Add a RML9 service, that listen some Cesium events
  .factory('rml9Service', function($rootScope, csWallet, csWot) {
    'ngInject';

    var exports = {};

    console.log('[RML9] Starting rml9Service service...');

    // [NEW] add listeners on Cesium services
    csWallet.api.data.on.login($rootScope, function(walletData, deferred){
      console.log('[RML9] Successfull login. Wallet data:', walletData);

      // IMPORTANT: this is required, because of async call of extension
      deferred.resolve();
    }, this);

    csWot.api.data.on.load($rootScope, function(idty, deferred){
      console.log('[RML9] Loading a wot identity: ', idty);
      deferred.resolve();
    }, this);

    csWot.api.data.on.search($rootScope, function(searchText, datas, pubkeyAtributeName, deferred){
      console.log('[RML9] Searching on Wot registry, using [searchText,datas]: ', searchText, datas);
      deferred.resolve();
    }, this);

    return exports;
  });
