angular.module('cesium.services', ['ngResource'])

.factory('BMA', function($http, $q) {

    function BMA(server) {

      function getResource(uri) {
        return function(params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000
            }, suffix = '', pkeys = [], queryParams = {};
            if (typeof params == 'object') {
              pkeys = _.keys(params);
            }
            pkeys.forEach(function(pkey){
              var prevURI = uri;
              uri = uri.replace(new RegExp(':' + pkey), params[pkey]);
              if (prevURI == uri) {
                queryParams[pkey] = params[pkey];
              }
            });
            config.params = queryParams;
            $http.get(uri + suffix, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                reject(data);
              });
          });
        }
      }

      function ws(uri) {
        var sock = new WebSocket(uri);
        return {
          on: function(type, callback) {
            sock.onmessage = function(e) {
              callback(JSON.parse(e.data));
            };
          }
        };
      }

      return {
        wot: {
          lookup: getResource('http://' + server + '/wot/lookup/:search'),
          members: getResource('http://' + server + '/wot/members')
        },
        network: {
          peering: {
            peers: getResource('http://' + server + '/network/peering/peers')
          },
          peers: getResource('http://' + server + '/network/peers')
        },
        currency: {
          parameters: getResource('http://' + server + '/blockchain/parameters')
        },
        blockchain: {
          current: getResource('http://' + server + '/blockchain/current'),
          block: getResource('http://' + server + '/blockchain/block/:block'),
          stats: {
            ud: getResource('http://' + server + '/blockchain/with/ud'),
            tx: getResource('http://' + server + '/blockchain/with/tx')
          }
        },
        websocket: {
          block: function() {
            return ws('ws://' + server + '/ws/block');
          },
          peer: function() {
            return ws('ws://' + server + '/ws/peer');
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
