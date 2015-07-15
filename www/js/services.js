angular.module('cesium.services', ['ngResource'])

.factory('BMA', function($resource) {
    function BMA(server) {
      return {
        wot: {
          lookup: $resource('http://' + server + '/wot/lookup/:search')
        },
        network: {
          peering: {
            peers: $resource('http://' + server + '/network/peering/peers')
          }
        },
        currency: {
          parameters: $resource('http://' + server + '/blockchain/parameters')
        },
        blockchain: {
          current: $resource('http://' + server + '/blockchain/current'),
          block: $resource('http://' + server + '/blockchain/block/:block'),
          stats: {
            ud: $resource('http://' + server + '/blockchain/with/ud'),
            tx: $resource('http://' + server + '/blockchain/with/tx')
          }
        }
      }
    }
    var service = BMA('metab.ucoin.io');
    service.instance = BMA;
  return service;
})

.factory('UIUtils', function($ionicLoading, $ionicPopup) {
    return {
      alert: {
        error: function(err, subtitle) {
          var message = err.message || err;
          return $ionicPopup.show({
            template: '<p>' + (message || 'Unknown error') + '</p>',
            title: 'Application error',
            subTitle: subtitle,
            buttons: [
              {
                text: '<b>OK</b>',
                type: 'button-assertive'
              }
            ]
          });
        }
      },
      loading: {
        show: function() {
          $ionicLoading.show({
            template: 'Loading...'
          });
        },
        hide: function(){
          $ionicLoading.hide();
        }
      }
    };
})

;
