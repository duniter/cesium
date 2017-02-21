//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngResource', 'cesium.http.services', 'cesium.settings.services'])

.factory('BMA', function($q, csSettings, csHttp, csCache, $rootScope, $timeout) {
  'ngInject';

  function factory(host, port, cacheEnable) {

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    var
      regex = {
        USER_ID: "[A-Za-z0-9_-]+",
        CURRENCY: "[A-Za-z0-9_-]+",
        PUBKEY: "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}",
        COMMENT: "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
        // duniter://[uid]:[pubkey]@[host]:[port]
        URI_WITH_AT: "duniter://(?:([A-Za-z0-9_-]+):)?([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})@([a-zA-Z0-9-.]+.[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+)",
        URI_WITH_PATH: "duniter://([a-zA-Z0-9-.]+.[a-zA-Z0-9-_:.]+)/([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})(?:/([A-Za-z0-9_-]+))?",
        BMA_ENDPOINT: "BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))",
        BMAS_ENDPOINT: "BMAS( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))"
      },
      errorCodes = {
        REVOCATION_ALREADY_REGISTERED: 1002,
        HTTP_LIMITATION: 1006,
        IDENTITY_SANDBOX_FULL: 1007,
        NO_MATCHING_IDENTITY: 2001,
        UID_ALREADY_USED: 2003,
        NO_MATCHING_MEMBER: 2004,
        NO_IDTY_MATCHING_PUB_OR_UID: 2021,
        MEMBERSHIP_ALREADY_SEND: 2007,
        NO_CURRENT_BLOCK: 2010,
        BLOCK_NOT_FOUND: 2011,
        TX_ALREADY_PROCESSED: 2030
      },
      constants = {
        PROTOCOL_VERSION: 10,
        ROOT_BLOCK_HASH: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
        LIMIT_REQUEST_COUNT: 5, // simultaneous async request to a Duniter node
        LIMIT_REQUEST_DELAY: 1000, // time (in second) to wait between to call of a rest request
        regex: regex
      };

    var exports = {
      errorCodes: errorCodes,
      constants: constants,
      regex: {
        USER_ID: exact(regex.USER_ID),
        COMMENT: exact(regex.COMMENT),
        PUBKEY: exact(regex.PUBKEY),
        CURRENCY: exact(regex.CURRENCY),
        URI: exact(regex.URI),
        BMA_ENDPOINT: exact(regex.BMA_ENDPOINT),
        BMAS_ENDPOINT: exact(regex.BMAS_ENDPOINT)
      },
      node: {
        server: csHttp.getServer(host, port),
        url: csHttp.getUrl(host, port),
        host: host,
        port: port,
        summary: csHttp.getWithCache(host, port, '/node/summary', csHttp.cache.LONG),
        same: function(host2, port2) {
          return host2 == host && ((!port && !port2) || (port == port2));
        }
      },
      network: {
        peering: {
          self: csHttp.get(host, port, '/network/peering'),
          peers: csHttp.get(host, port, '/network/peering/peers')
        },
        peers: csHttp.get(host, port, '/network/peers')
      },
      wot: {
        lookup: csHttp.get(host, port, '/wot/lookup/:search'),
        certifiedBy: csHttp.get(host, port, '/wot/certified-by/:pubkey'),
        certifiersOf: csHttp.get(host, port, '/wot/certifiers-of/:pubkey'),
        member: {
          all: cacheEnable ? csHttp.getWithCache(host, port, '/wot/members') : csHttp.get(host, port, '/wot/members'),
          pending: csHttp.get(host, port, '/wot/pending')
        },
        requirements: csHttp.get(host, port, '/wot/requirements/:pubkey'),
        add: csHttp.post(host, port, '/wot/add'),
        certify: csHttp.post(host, port, '/wot/certify'),
        revoke: csHttp.post(host, port, '/wot/revoke')
      },
      blockchain: {
        parameters: csHttp.getWithCache(host, port, '/blockchain/parameters', csHttp.cache.LONG),
        block: cacheEnable ? csHttp.getWithCache(host, port, '/blockchain/block/:block', csHttp.cache.SHORT) : csHttp.get(host, port, '/blockchain/block/:block'),
        blocksSlice: csHttp.get(host, port, '/blockchain/blocks/:count/:from'),
        current: csHttp.get(host, port, '/blockchain/current'),
        membership: csHttp.post(host, port, '/blockchain/membership'),
        stats: {
          ud: cacheEnable ? csHttp.getWithCache(host, port, '/blockchain/with/ud', csHttp.cache.SHORT) : csHttp.get(host, port, '/blockchain/with/ud'),
          tx: csHttp.get(host, port, '/blockchain/with/tx'),
          newcomers: csHttp.get(host, port, '/blockchain/with/newcomers'),
          hardship: csHttp.get(host, port, '/blockchain/hardship/:pubkey')
        }
      },
      tx: {
        sources: csHttp.get(host, port, '/tx/sources/:pubkey'),
        process: csHttp.post(host, port, '/tx/process'),
        history: {
          all: csHttp.get(host, port, '/tx/history/:pubkey'),
          times: cacheEnable ? csHttp.getWithCache(host, port, '/tx/history/:pubkey/times/:from/:to') : csHttp.get(host, port, '/tx/history/:pubkey/times/:from/:to'),
          timesNoCache: csHttp.get(host, port, '/tx/history/:pubkey/times/:from/:to'),
          blocks: cacheEnable ? csHttp.getWithCache(host, port, '/tx/history/:pubkey/blocks/:from/:to') : csHttp.get(host, port, '/tx/history/:pubkey/blocks/:from/:to'),
          pending: csHttp.get(host, port, '/tx/history/:pubkey/pending')
        }
      },
      ud: {
        history: csHttp.get(host, port, '/ud/history/:pubkey')
      },
      uri: {},
      raw: {

      }
    };

    exports.lightInstance = function(host, port) {
      return {
        node: {
          summary: csHttp.getWithCache(host, port, '/node/summary', csHttp.cache.LONG)
        },
        network: {
          peering: {
            self: csHttp.get(host, port, '/network/peering')
          },
          peers: csHttp.get(host, port, '/network/peers')
        },
        blockchain: {
          current: csHttp.get(host, port, '/blockchain/current'),
          stats: {
            hardship: csHttp.get(host, port, '/blockchain/hardship/:pubkey')
          }
        }
      };
    };

    exports.node.parseEndPoint = function(endpoint) {
      var matches = exports.regex.BMA_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80
      };
    };

    exports.copy = function(otherNode) {
      if (!!this.instance) { // if main service impl
        var instance = this.instance; // keep factory
        csCache.clearAll(); // clean all caches
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    };

    exports.wot.member.uids = function() {
      return exports.wot.member.all()
        .then(function(res){
          return res.results.reduce(function(res, member){
            res[member.pubkey] = member.uid;
            return res;
          }, {});
        });
    };

    exports.wot.member.get = function(pubkey) {
      return exports.wot.member.uids()
        .then(function(memberUidsByPubkey){
          var uid = memberUidsByPubkey[pubkey];
          return {
              pubkey: pubkey,
              uid: (uid ? uid : null)
            };
        });
    };

    exports.wot.member.getByUid = function(uid) {
      return exports.wot.member.all()
        .then(function(res){
          return _.findWhere(res.results, {uid: uid});
        });
    };

    /**
     * Return all expected blocks
     * @param blockNumbers a rray of block number
    */
    exports.blockchain.blocks = function(blockNumbers){
      return exports.raw.getHttpRecursive(exports.blockchain.block, 'block', blockNumbers);
    };

    /**
     * Return all expected blocks
     * @param blockNumbers a rray of block number
     */
    exports.network.peering.peersByLeaves = function(leaves){
      return exports.raw.getHttpRecursive(exports.network.peering.peers, 'leaf', leaves, 0, 10, callbackFlush);
    };

    exports.raw.getHttpRecursive = function(httpGetRequest, paramName, paramValues, offset, size, callbackFlush) {
      offset = angular.isDefined(offset) ? offset : 0;
      size = size || exports.constants.LIMIT_REQUEST_COUNT;
      return $q(function(resolve, reject) {
        var result = [];
        var jobs = [];
        _.each(paramValues.slice(offset, offset+size), function(paramValue) {
          var requestParams = {};
          requestParams[paramName] = paramValue;
          jobs.push(
            httpGetRequest(requestParams)
              .then(function(res){
                if (!res) return;
                result.push(res);
              })
          );
        });

        $q.all(jobs)
          .then(function() {
            if (offset < paramValues.length - 1) {
              $timeout(function() {
                exports.raw.getHttpRecursive(httpGetRequest, paramName, paramValues, offset+size, size)
                  .then(function(res) {
                    if (!res || !res.length) {
                      resolve(result);
                      return;
                    }

                    resolve(result.concat(res));
                  })
                  .catch(function(err) {
                    reject(err);
                  });
              }, exports.constants.LIMIT_REQUEST_DELAY);
            }
            else {
              resolve(result);
            }
          })
          .catch(function(err){
            if (err && err.ucode === errorCodes.HTTP_LIMITATION) {
              resolve(result);
            }
            else {
              reject(err);
            }
          });
      });
    };

    exports.blockchain.lastUd = function() {
      return exports.blockchain.stats.ud()
        .then(function(res) {
          if (!res.result.blocks || !res.result.blocks.length) {
            return null;
          }
          var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
          return exports.blockchain.block({block: lastBlockWithUD})
            .then(function(block){
              return (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
            });
        });
    };

    exports.uri.parse = function(uri) {
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
              })
              .catch(function(err) {
                console.log(err);
                reject({message: 'Could not get node parameter. Currency could not be retrieve'});
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
    };

    exports.websocket = {
        block: function() {
          return csHttp.ws((exports.node.port == 443 ? 'wss' : 'ws') + '://' + exports.node.server + '/ws/block');
        },
        peer: function() {
          return csHttp.ws((exports.node.port == 443 ? 'wss' : 'ws') + '://' + exports.node.server + '/ws/peer');
        },
        close : csHttp.closeAllWs
      };

    return exports;
  }

  var service = factory(csSettings.data.node.host, csSettings.data.node.port, true /*cache*/);
  service.instance = factory;

  // Listen settings changes
  csSettings.api.data.on.changed($rootScope, function(settings) {

    var nodeServer = csHttp.getServer(settings.node.host, settings.node.port);
    if (nodeServer != service.node.server) {
      var newService = factory(settings.node.host, settings.node.port, true /*cache*/);
      service.copy(newService); // reload service
    }

  });

  return service;
})

;
