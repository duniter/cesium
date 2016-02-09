//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngResource'])

.factory('BMA', function($http, $q) {

    function BMA(server, wsServer) {
        if (wsServer == "undefined" || wsServer == null) {
            wsServer = server;
        }

      function processError(reject, data) {
        if (data != null && data.message != "undefined" && data.message != null) {
          reject(data.ucode + ": " + data.message);
        }
        else {
          reject('Unknown error from ucoin node');
        }
      }

      function prepare(uri, params, config, callback) {
        var pkeys = [], queryParams = {}, newUri = uri;
        if (typeof params == 'object') {
          pkeys = _.keys(params);
        }

        pkeys.forEach(function(pkey){
          var prevURI = newUri;
          newUri = newUri.replace(new RegExp(':' + pkey), params[pkey]);
          if (prevURI == newUri) {
            queryParams[pkey] = params[pkey];
          }
        });
        config.params = queryParams;
        callback(newUri, config);
      }

      function getResource(uri) {
        return function(params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000
            };

            prepare(uri, params, config, function(uri, config) {
                $http.get(uri, config)
                .success(function(data, status, headers, config) {
                  resolve(data);
                })
                .error(function(data, status, headers, config) {
                  processError(reject, data);
                });
            });
          });
        }
      }

      function postResource(uri) {
        return function(data, params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000,
              headers : {'Content-Type' : 'application/json'}
            };

            prepare(uri, params, config, function(uri, config) {
                $http.post(uri, data, config)
                .success(function(data, status, headers, config) {
                  resolve(data);
                })
                .error(function(data, status, headers, config) {
                  processError(reject, data);
                });
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
          members: getResource('http://' + server + '/wot/members'),
          requirements: getResource('http://' + server + '/wot/requirements/:pubkey'),
          add: postResource('http://' + server + '/wot/add')
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
          membership: postResource('http://' + server + '/blockchain/membership'),
          stats: {
            ud: getResource('http://' + server + '/blockchain/with/ud'),
            tx: getResource('http://' + server + '/blockchain/with/tx')
          }
        },

        tx: {
          sources: getResource('http://' + server + '/tx/sources/:pubkey'),
          process: postResource('http://' + server + '/tx/process'),
          history: {
            all: getResource('http://' + server + '/tx/history/:pubkey'),
            times: getResource('http://' + server + '/tx/history/:pubkey/times/:from/:to'),
            blocks: getResource('http://' + server + '/tx/history/:pubkey/blocks/:from/:to')
          }
        },
        websocket: {
          block: function() {
            return ws('ws://' + wsServer + '/ws/block');
          },
          peer: function() {
            return ws('ws://' + wsServer + '/ws/peer');
          }
        }
      }
    }
    //var service = BMA('metab.ucoin.fr', 'metab.ucoin.fr:9201');
    //var service = BMA('192.168.0.28:9201');
    var service = BMA('metab.ucoin.io');
    service.instance = BMA;
  return service;
})
;
