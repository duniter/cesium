//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngResource', 'cesium.http.services', 'cesium.settings.services'])

.factory('BMA', function($q, csSettings, csHttp, $rootScope) {
  'ngInject';

  function factory(host, port) {

    var
    errorCodes = {
        NO_MATCHING_IDENTITY: 2001,
        UID_ALREADY_USED: 2003,
        NO_MATCHING_MEMBER: 2004,
        NO_IDTY_MATCHING_PUB_OR_UID: 2021,
        MEMBERSHIP_ALREADY_SEND: 2007,
        IDENTITY_SANDBOX_FULL: 1007
      },
    regex = {
      USER_ID: "[A-Za-z0-9_-]+",
      CURRENCY: "[A-Za-z0-9_-]+",
      PUBKEY: "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}",
      COMMENT: "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
      // duniter://[uid]:[pubkey]@[host]:[port]
      URI_WITH_AT: "duniter://(?:([A-Za-z0-9_-]+):)?([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})@([a-zA-Z0-9-.]+.[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+)",
      URI_WITH_PATH: "duniter://([a-zA-Z0-9-.]+.[a-zA-Z0-9-_:.]+)/([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})(?:/([A-Za-z0-9_-]+))?"
    },
    server = csHttp.getServer(host, port);

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function copy(otherNode) {
      if (!!this.instance) { // if main service impl
        var instance = this.instance; // keep factory
        csHttp.cache.clearAll(); // clean cache for old node
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }

    function isSameNode(host2, port2) {
      return host2 == host && ((!port && !port2) ||(port == port2));
    }

    var getMembers = csHttp.getWithCache(host, port, '/wot/members');

    function getMemberUidsByPubkey() {
      return getMembers()
        .then(function(res){
          return res.results.reduce(function(res, member){
            res[member.pubkey] = member.uid;
            return res;
          }, {});
        });
    }

    function getMemberByPubkey(pubkey) {
      return getMemberUidsByPubkey()
        .then(function(memberUidsByPubkey){
          var uid = memberUidsByPubkey[pubkey];
          return {
              pubkey: pubkey,
              uid: (uid ? uid : null)
            };
        });
    }

    var getBlockchainWithUd = csHttp.getWithCache(host, port, '/blockchain/with/ud', csHttp.cache.SHORT);
    var getBlockchainBlock = csHttp.getWithCache(host, port, '/blockchain/block/:block', csHttp.cache.SHORT);

    function getBlockchainLastUd() {
      return getBlockchainWithUd()
        .then(function(res) {
          if (!res.result.blocks || !res.result.blocks.length) {
            return null;
          }
          var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
          return getBlockchainBlock({block: lastBlockWithUD})
            .then(function(block){
              return (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
            });
        });
    }

    function parseUri(uri) {
      return $q(function(resolve, reject) {
        // If pubkey: not need to parse
        if (exact(regex.PUBKEY).test(uri)) {
          resolve({
            pubkey: uri
          });
        }
        else if(uri.startsWith('duniter://')) {
          var parser = csHttp.uri.parse(uri),
            pubkey,
            uid,
            currency = parser.host.indexOf('.') === -1 ? parser.host : null,
            host = parser.host.indexOf('.') !== -1 ? parser.host : null;
          if (parser.username) {
            if (parser.password) {
              uid = parser.username;
              pubkey = parser.password;
            }
            else {
              pubkey = parser.username;
            }
          }
          if (parser.pathname) {
            var paths = parser.pathname.split('/');
            var pathCount = !paths ? 0 : paths.length;
            var index = 0;
            if (!currency && pathCount > index) {
              currency = paths[index++];
            }
            if (!pubkey && pathCount > index) {
              pubkey = paths[index++];
            }
            if (!uid && pathCount > index) {
              uid = paths[index++];
            }
            if (pathCount > index) {
              reject( {message: 'Bad Duniter URI format. Invalid path (incomplete or redundant): '+ parser.pathname}); return;
            }
          }

          if (!currency){
            if (host) {
              csHttp.get(host + '/blockchain/parameters')()
              .then(function(parameters){
                resolve({
                  uid: uid,
                  pubkey: pubkey,
                  host: host,
                  currency: parameters.currency
                });
              }).catch(function(err) {
                console.log(err);
                reject({message: 'Could not get node parameter. Currency could not be retrieve'}); return;
              });
            }
            else {
              reject({message: 'Bad Duniter URI format. Missing currency name (or node address).'}); return;
            }
          }
          else {
            if (!host) {
              resolve({
                uid: uid,
                pubkey: pubkey,
                currency: currency
              });
            }

            // Check if currency are the same (between node and uri)
            return csHttp.get(host + '/blockchain/parameters')()
            .then(function(parameters){
              if (parameters.currency !== currency) {
                reject( {message: "Node's currency ["+parameters.currency+"] does not matched URI's currency ["+currency+"]."}); return;
              }
              resolve({
                uid: uid,
                pubkey: pubkey,
                host: host,
                currency: currency
              });
            });
          }
        }
        else {
          throw {message: 'Bad URI format: ' + uri};
        }
      })

      // Check values against regex
      .then(function(result) {
        if (result.pubkey && !(exact(regex.PUBKEY).test(result.pubkey))) {
          reject({message: "Invalid pubkey format [" + result.pubkey + "]"}); return;
        }
        if (result.uid && !(exact(regex.USER_ID).test(result.uid))) {
          reject({message: "Invalid uid format [" + result.uid + "]"}); return;
        }
        if (result.currency && !(exact(regex.CURRENCY).test(result.currency))) {
          reject({message: "Invalid currency format ["+result.currency+"]"}); return;
        }
        return result;
      });
    }

    return {
      node: {
        summary: csHttp.get(host, port, '/node/summary'),
        server: server,
        host: host,
        port: port,
        same: isSameNode
      },
      wot: {
        lookup: csHttp.get(host, port, '/wot/lookup/:search'),
        certifiedBy: csHttp.get(host, port, '/wot/certified-by/:pubkey'),
        certifiersOf: csHttp.get(host, port, '/wot/certifiers-of/:pubkey'),
        member: {
          all: getMembers,
          uids: getMemberUidsByPubkey,
          get: getMemberByPubkey
        },
        requirements: csHttp.get(host, port, '/wot/requirements/:pubkey'),
        add: csHttp.post(host, port, '/wot/add'),
        certify: csHttp.post(host, port, '/wot/certify')
      },
      network: {
        peering: {
          peers: csHttp.get(host, port, '/network/peering/peers')
        },
        peers: csHttp.get(host, port, '/network/peers')
      },
      blockchain: {
        parameters: csHttp.getWithCache(host, port, '/blockchain/parameters', csHttp.cache.LONG),
        current: csHttp.get(host, port, '/blockchain/current'),
        block: getBlockchainBlock,
        membership: csHttp.post(host, port, '/blockchain/membership'),
        stats: {
          ud: getBlockchainWithUd,
          tx: csHttp.get(host, port, '/blockchain/with/tx'),
          newcomers: csHttp.get(host, port, '/blockchain/with/newcomers'),
        },
        lastUd: getBlockchainLastUd
      },
      tx: {
        sources: csHttp.get(host, port, '/tx/sources/:pubkey'),
        process: csHttp.post(host, port, '/tx/process'),
        history: {
          all: csHttp.get(host, port, '/tx/history/:pubkey'),
          times: csHttp.getWithCache(host, port, '/tx/history/:pubkey/times/:from/:to'),
          timesNoCache: csHttp.get(host, port, '/tx/history/:pubkey/times/:from/:to'),
          blocks: csHttp.getWithCache(host, port, '/tx/history/:pubkey/blocks/:from/:to'),
          pending: csHttp.get(host, port, '/tx/history/:pubkey/pending')
        }
      },
      ud: {
        history: csHttp.get(host, port, '/ud/history/:pubkey')
      },
      websocket: {
        block: function() {
          return csHttp.ws('ws://' + server + '/ws/block');
        },
        peer: function() {
          return csHttp.ws('ws://' + server + '/ws/peer');
        },
        close : csHttp.closeAllWs
      },
      copy: copy,
      errorCodes: errorCodes,
      regex: {
        USER_ID: exact(regex.USER_ID),
        COMMENT: exact(regex.COMMENT),
        PUBKEY: exact(regex.PUBKEY),
        CURRENCY: exact(regex.CURRENCY),
        URI: exact(regex.URI)
      },
      uri: {
        parse: parseUri
      }
    };
  }

  var service = factory(csSettings.data.node.host, csSettings.data.node.port);
  service.instance = factory;

  // Listen settings changes
  csSettings.api.data.on.changed($rootScope, function(settings) {

    var nodeServer = csHttp.getServer(settings.node.host, settings.node.port);
    if (nodeServer != service.node.server) {
      var newService = factory(settings.node.host, settings.node.port);
      service.copy(newService); // reload service
    }

  });

  return service;
})
;
