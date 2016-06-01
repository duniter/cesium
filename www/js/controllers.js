
angular.module('cesium.controllers', [
    'cesium.app.controllers',
    'cesium.home.controllers',
    'cesium.wallet.controllers',
    'cesium.currency.controllers',
    'cesium.currency-charts.controllers',
    'cesium.wot.controllers',
    'cesium.transfer.controllers',
    'cesium.settings.controllers'
  ])

  .config(function($httpProvider) {
    //Enable cross domain calls
   $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })
;
