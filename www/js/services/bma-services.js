//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngResource',
    'cesium.config'])

.factory('BMA', function($http, $q, APP_CONFIG) {
  'ngInject';

  function BMA(server, timeout) {

    var
    errorCodes = {
        NO_MATCHING_IDENTITY: 2001,
        UID_ALREADY_USED: 2003,
        NO_MATCHING_MEMBER: 2004,
        MEMBERSHRIP_ALREADY_SEND: 2007
      },
    regex = {
      USER_ID: "[A-Za-z0-9_-]*",
      PUBKEY: "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}",
      COMMENT: "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
      URI: "duniter://[a-zA-Z0-9-.]+.[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+"
    },
    sockets = [];

    if (!timeout) {
      timeout=4000;
    }

    function processError(reject, data, uri) {
      if (data && data.message) {
        reject(data);
      }
      else {
        if (uri) {
          reject('Error from Duniter node (' + uri + ')');
        }
        else {
          reject('Unknown error from Duniter node');
        }
      }
    }

    function prepare(uri, params, config, callback) {
      var pkeys = [], queryParams = {}, newUri = uri;
      if (typeof params == 'object') {
        pkeys = _.keys(params);
      }

      _.forEach(pkeys, function(pkey){
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
            timeout: timeout
          };

          prepare(uri, params, config, function(uri, config) {
              $http.get(uri, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                processError(reject, data, uri);
              });
          });
        });
      };
    }

    function postResource(uri) {
      return function(data, params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout,
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
      };
    }

    function ws(uri) {
      var sock = null;
      return {
        on: function(type, callback) {
          if (!sock) {
            sock = new WebSocket(uri);
            sockets.push(this);
          }
          sock.onmessage = function(e) {
            callback(JSON.parse(e.data));
          };
        },
        close: function(type, callback) {
          if (!!sock) {
            sock.close();
            sock = null;
          }
        }
      };
    }

    function closeWs() {
      if (sockets.length > 0) {
        _.forEach(sockets, function(sock) {
          sock.close();
        });
        sockets = []; // Reset socks list
      }
    }

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function copy(otherNode) {
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }

    return {
      node: {
        summary: getResource('http://' + server + '/node/summary'),
        url: server
      },
      wot: {
        lookup: getResource('http://' + server + '/wot/lookup/:search'),
        members: getResource('http://' + server + '/wot/members'),
        requirements: getResource('http://' + server + '/wot/requirements/:pubkey'),
        add: postResource('http://' + server + '/wot/add'),
        certify: postResource('http://' + server + '/wot/certify')
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
      ud: {
        history: getResource('http://' + server + '/ud/history/:pubkey')
      },
      websocket: {
        block: function() {
          return ws('ws://' + server + '/ws/block');
        },
        peer: function() {
          return ws('ws://' + server + '/ws/peer');
        },
        close : closeWs
      },
      copy: copy,
      errorCodes: errorCodes,
      regex: {
        USER_ID: exact(regex.USER_ID),
        COMMENT: exact(regex.COMMENT),
        PUBKEY: exact(regex.PUBKEY),
        URI: exact(regex.URI)
      }
    };
  }

  var service = BMA(APP_CONFIG.DUNITER_NODE, APP_CONFIG.TIMEOUT);
  service.instance = BMA;
  return service;
})
;
