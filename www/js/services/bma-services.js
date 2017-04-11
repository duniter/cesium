//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngResource', 'ngApi', 'cesium.http.services', 'cesium.settings.services'])

.factory('BMA', function($q, $window, $rootScope, $timeout, Api, Device, csConfig, csSettings, csHttp) {
  'ngInject';

  function BMA(host, port, useSsl, useCache) {

    var
      // TX output conditions
      SIG = "SIG\\(([0-9a-zA-Z]{43,44})\\)",
      XHX = 'XHX\\(([A-F0-9]{1,64})\\)',
      CSV = 'CSV\\(([0-9]{1,8})\\)',
      CLTV = 'CLTV\\(([0-9]{1,10})\\)',
      OUTPUT_FUNCTION = SIG+'|'+XHX+'|'+CSV+'|'+CLTV,
      OUTPUT_OPERATOR = '(&&)|(\\|\\|)',
      OUTPUT_FUNCTIONS = OUTPUT_FUNCTION+'([ ]*' + OUTPUT_OPERATOR + '[ ]*' + OUTPUT_FUNCTION +')*',
      OUTPUT_OBJ = 'OBJ\\(([0-9]+)\\)',
      OUTPUT_OBJ_OPERATOR = OUTPUT_OBJ + '[ ]*' + OUTPUT_OPERATOR + '[ ]*' + OUTPUT_OBJ,
      regexp = {
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
        WRONG_SIGNATURE_MEMBERSHIP: 2006,
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
        regex: regexp, // deprecated
        regexp: regexp
      },
      listeners,
      that = this;

    that.date = {now: csHttp.date.now};
    that.api = new Api(this, 'BMA-' + that.server);
    that.started = false;
    that.init = init;

    if (host) {
      init(host, port, useSsl, useCache);
    }
    that.useCache = useCache; // need here because used in get() function

    function init(host, port, useSsl, useCache) {
      if (that.started) that.stop();
      that.alive = false;
      that.cache = _emptyCache();

      // Allow to force SSL connection with port different from 443
      var forceUseSsl = (csConfig.httpsMode === true || csConfig.httpsMode == 'true' ||csConfig.httpsMode === 'force') ||
        ($window.location && $window.location.protocol === 'https:') ? true : false;
      if (forceUseSsl) {
        console.debug('[BMA] Enable SSL (forced by config or detected in URL)');
      }
      // Use settings as default, if exists
      if (csSettings.data && csSettings.data.node) {
        host = host || csSettings.data.node.host;
        port = port || csSettings.data.node.port;

        useSsl = angular.isDefined(useSsl) ? useSsl : (csSettings.data.node.port == 443 || csSettings.data.node.useSsl || forceUseSsl);
        useCache =  angular.isDefined(useCache) ? useCache : true;
      }

      if (!host) {
        return; // could not init yet
      }
      that.host = host;
      that.port = port || 80;
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || forceUseSsl);
      that.useCache = angular.isDefined(useCache) ? useCache : false;
      that.server = csHttp.getServer(host, port);
      that.url = csHttp.getUrl(host, port, ''/*path*/, useSsl);
    }

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function test(regexpContent) {
      return new RegExp(regexpContent);
    }

    function _emptyCache() {
      return {
        getByPath: {},
        postByPath: {},
        wsByPath: {}
      };
    }

    function closeWs() {
      _.keys(that.cache.wsByPath).forEach(function(key) {
        var sock = that.cache.wsByPath[key];
        sock.close();
      });
    }

    that.cleanCache = function() {
      console.debug('[BMA] Cleaning requests cache...');
      closeWs();
      that.cache = _emptyCache();
    };

    get = function (path, cacheTime) {

      cacheTime = that.useCache && cacheTime;
      var cacheKey = path + (cacheTime ? ('#'+cacheTime) : '');

      var getRequest = function(params) {

        if (!that.started) {
          if (!that._startPromise) {
            console.error('[BMA] Trying to get [{0}] before start()...'.format(path));
          }
          return that.ready().then(function() {
            return getRequest(params);
          });
        }

        var request = that.cache.getByPath[cacheKey];
        if (!request) {
          if (cacheTime) {
            request = csHttp.getWithCache(that.host, that.port, path, that.useSsl, cacheTime);
          }
          else {
            request = csHttp.get(that.host, that.port, path, that.useSsl);
          }
          that.cache.getByPath[cacheKey] = request;
        }
        return request(params);
      };

      return getRequest;
    };

    post = function(path) {
      postRequest = function(obj, params) {
        if (!that.started) {
          if (!that._startPromise) {
            console.error('[BMA] Trying to post [{0}] before start()...'.format(path));
          }
          return that.ready().then(function() {
            return postRequest(obj, params);
          });
        }

        var request = that.cache.postByPath[path];
        if (!request) {
          request =  csHttp.post(that.host, that.port, path, that.useSsl);
          that.cache.postByPath[path] = request;
        }
        return request(obj, params);
      };

      return postRequest;
    };

    ws = function(path) {
      return function() {
        var sock = that.cache.wsByPath[path];
        if (!sock) {
          sock =  csHttp.ws(that.host, that.port, path, that.useSsl);
          that.cache.wsByPath[path] = sock;
        }
        return sock;
      };
    };

    that.isAlive = function() {
      return csHttp.get(that.host, that.port, '/node/summary', that.useSsl)()
        .then(function(json) {
          var isDuniter = json && json.duniter && json.duniter.software == 'duniter' && json.duniter.version;
          var isCompatible = isDuniter && csHttp.version.isCompatible(csSettings.data.minVersion, json.duniter.version);
          if (isDuniter && !isCompatible) {
            console.error('[BMA] Uncompatible version [{0}] - expected at least [{1}]'.format(json.duniter.version, csSettings.data.minVersion));
          }
          return isCompatible;
        })
        .catch(function() {
          return false;
        });
    };

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      listeners = [
        // Listen if node changed
        csSettings.api.data.on.changed($rootScope, onSettingsChanged, this)
      ];
    }

    function onSettingsChanged(settings) {

      var server = csHttp.getUrl(settings.node.host, settings.node.port, ''/*path*/, settings.node.useSsl);
      var hasChanged = (server != that.url);
      if (hasChanged) {
        init(settings.node.host, settings.node.port, settings.node.useSsl, that.useCache);
        that.restart();
      }
    }

    that.isStarted = function() {
      return that.started;
    };

    that.ready = function() {
      if (that.started) return $q.when();
      return that._startPromise || that.start();
    };

    that.start = function() {
      if (that._startPromise) return that._startPromise;
      if (that.started) return $q.when(that.alive);

      if (!that.host) {
        return csSettings.ready()
          .then(function() {
            that.init();

            // Always enable cache
            that.useCache = true;

            return that.start(); // recursive call
          });
      }

      if (that.useSsl) {
        console.debug('[BMA] Starting [{0}] (SSL on)...'.format(that.server));
      }
      else {
        console.debug('[BMA] Starting [{0}]...'.format(that.server));
      }

      var now = new Date().getTime();

      that._startPromise = $q.all([
          csSettings.ready,
          that.isAlive()
        ])
        .then(function(res) {
          that.alive = res[1];
          if (!that.alive) {
            // TODO : alert user ?
            console.error('[BMA] Could not start [{0}]: node unreachable'.format(that.server));
            that.started = true;
            delete that._startPromise;
            return false;
          }

          // Add listeners
          if (!listeners || listeners.length === 0) {
            addListeners();
          }
          console.debug('[BMA] Started in '+(new Date().getTime()-now)+'ms');

          that.api.node.raise.start();
          that.started = true;
          delete that._startPromise;
          return true;
        });
      return that._startPromise;
    };

    that.stop = function() {
      console.debug('[BMA] Stopping...');
      removeListeners();
      that.cleanCache();
      that.alive = false;
      that.started = false;
      that.api.node.raise.stop();
    };

    that.restart = function() {
      csHttp.cache.clear();
      that.stop();
      return $timeout(function() {
        that.start();
      }, 200);
    };

    that.api.registerEvent('node', 'start');
    that.api.registerEvent('node', 'stop');

    var exports = {
      errorCodes: errorCodes,
      constants: constants,
      regexp: {
        USER_ID: exact(regexp.USER_ID),
        COMMENT: exact(regexp.COMMENT),
        PUBKEY: exact(regexp.PUBKEY),
        CURRENCY: exact(regexp.CURRENCY),
        URI: exact(regexp.URI),
        BMA_ENDPOINT: exact(regexp.BMA_ENDPOINT),
        BMAS_ENDPOINT: exact(regexp.BMAS_ENDPOINT),
        // TX output conditions
        TX_OUTPUT_SIG: exact(SIG),
        TX_OUTPUT_FUNCTION: test(OUTPUT_FUNCTION),
        TX_OUTPUT_OBJ_OPERATOR_AND: test(OUTPUT_OBJ + '([ ]*&&[ ]*(' + OUTPUT_OBJ + '))+'),
        TX_OUTPUT_OBJ_OPERATOR_OR: test(OUTPUT_OBJ + '([ ]*\\|\\|[ ]*(' + OUTPUT_OBJ + '))+'),
        TX_OUTPUT_OBJ: test(OUTPUT_OBJ),
        TX_OUTPUT_OBJ_OPERATOR: test(OUTPUT_OBJ_OPERATOR),
        TX_OUTPUT_OBJ_PARENTHESIS: test('\\(('+OUTPUT_OBJ+')\\)'),
        TX_OUTPUT_FUNCTIONS: test(OUTPUT_FUNCTIONS)
      },
      node: {
        summary: get('/node/summary', csHttp.cache.LONG),
        same: function(host2, port2) {
          return host2 == host && ((!port && !port2) || (port == port2));
        }
      },
      network: {
        peering: {
          self: get('/network/peering'),
          peers: get('/network/peering/peers')
        },
        peers: get('/network/peers')
      },
      wot: {
        lookup: get('/wot/lookup/:search'),
        certifiedBy: get('/wot/certified-by/:pubkey'),
        certifiersOf: get('/wot/certifiers-of/:pubkey'),
        member: {
          all: get('/wot/members', csHttp.cache.LONG),
          pending: get('/wot/pending', csHttp.cache.SHORT)
        },
        requirements: get('/wot/requirements/:pubkey'),
        add: post('/wot/add'),
        certify: post('/wot/certify'),
        revoke: post('/wot/revoke')
      },
      blockchain: {
        parameters: get('/blockchain/parameters', csHttp.cache.LONG),
        block: get('/blockchain/block/:block', csHttp.cache.SHORT),
        blocksSlice: get('/blockchain/blocks/:count/:from'),
        current: get('/blockchain/current'),
        membership: post('/blockchain/membership'),
        stats: {
          ud: get('/blockchain/with/ud', csHttp.cache.SHORT),
          tx: get('/blockchain/with/tx'),
          newcomers: get('/blockchain/with/newcomers'),
          hardship: get('/blockchain/hardship/:pubkey'),
          difficulties: get('/blockchain/difficulties')
        }
      },
      tx: {
        sources: get('/tx/sources/:pubkey'),
        process: post('/tx/process'),
        history: {
          all: get('/tx/history/:pubkey'),
          times: get('/tx/history/:pubkey/times/:from/:to', csHttp.cache.LONG),
          timesNoCache: get('/tx/history/:pubkey/times/:from/:to'),
          blocks: get('/tx/history/:pubkey/blocks/:from/:to', csHttp.cache.LONG),
          pending: get('/tx/history/:pubkey/pending')
        }
      },
      ud: {
        history: get('/ud/history/:pubkey')
      },
      uri: {},
      raw: {

      }
    };
    exports.regex = exports.regexp; // deprecated

    exports.tx.parseUnlockCondition = function(unlockCondition) {

      //console.debug('[BMA] Parsing unlock condition: {0}.'.format(unlockCondition));
      var convertedOutput = unlockCondition;
      var treeItems = [];
      var treeItem;
      var treeItemId;
      var childrenContent;
      var childrenMatches;
      var functions = {};

      // Parse functions, then replace with an 'OBJ()' generic function, used to build a object tree
      var matches = exports.regexp.TX_OUTPUT_FUNCTION.exec(convertedOutput);
      while(matches) {
        treeItem = {};
        treeItemId = 'OBJ(' + treeItems.length + ')';
        treeItem.type = convertedOutput.substr(matches.index, matches[0].indexOf('('));
        treeItem.value = matches[1] || matches[2] || matches[3] || matches[4]; // get value from regexp OUTPUT_FUNCTION
        treeItems.push(treeItem);

        functions[treeItem.type] = functions[treeItem.type]++ || 1;

        convertedOutput = convertedOutput.replace(matches[0], treeItemId);
        matches = exports.regexp.TX_OUTPUT_FUNCTION.exec(convertedOutput);
      }

      var loop = true;
      while(loop) {
        // Parse AND operators
        matches = exports.regexp.TX_OUTPUT_OBJ_OPERATOR_AND.exec(convertedOutput);
        loop = !!matches;
        while (matches) {
          treeItem = {};
          treeItemId = 'OBJ(' + treeItems.length + ')';
          treeItem.type = 'AND';
          treeItem.children = [];
          treeItems.push(treeItem);

          childrenContent = matches[0];
          childrenMatches = exports.regexp.TX_OUTPUT_OBJ.exec(childrenContent);
          while(childrenMatches) {

            treeItem.children.push(treeItems[childrenMatches[1]]);
            childrenContent = childrenContent.replace(childrenMatches[0], '');
            childrenMatches = exports.regexp.TX_OUTPUT_OBJ.exec(childrenContent);
          }

          convertedOutput = convertedOutput.replace(matches[0], treeItemId);
          matches = exports.regexp.TX_OUTPUT_OBJ_OPERATOR_AND.exec(childrenContent);
        }

        // Parse OR operators

        matches = exports.regexp.TX_OUTPUT_OBJ_OPERATOR_OR.exec(convertedOutput);
        loop = loop || !!matches;
        while (matches) {
          treeItem = {};
          treeItemId = 'OBJ(' + treeItems.length + ')';
          treeItem.type = 'OR';
          treeItem.children = [];
          treeItems.push(treeItem);

          childrenContent = matches[0];
          childrenMatches = exports.regexp.TX_OUTPUT_OBJ.exec(childrenContent);
          while(childrenMatches) {
            treeItem.children.push(treeItems[childrenMatches[1]]);
            childrenContent = childrenContent.replace(childrenMatches[0], '');
            childrenMatches = exports.regexp.TX_OUTPUT_OBJ.exec(childrenContent);
          }

          convertedOutput = convertedOutput.replace(matches[0], treeItemId);
          matches = exports.regexp.TX_OUTPUT_OBJ_OPERATOR_AND.exec(convertedOutput);
        }

        // Remove parenthesis
        matches = exports.regexp.TX_OUTPUT_OBJ_PARENTHESIS.exec(convertedOutput);
        loop = loop || !!matches;
        while (matches) {
          convertedOutput = convertedOutput.replace(matches[0], matches[1]);
          matches = exports.regexp.TX_OUTPUT_OBJ_PARENTHESIS.exec(convertedOutput);
        }
      }

      functions = _.keys(functions);
      if (functions.length === 0) {
        console.error('[BMA] Unparseable unlock condition: ', output);
        return;
      }
      console.debug('[BMA] Unlock conditions successfully parsed:', treeItem);
      return {
        unlockFunctions: functions,
        unlockTree: treeItem
      };
    };

    exports.node.parseEndPoint = function(endpoint) {
      // Try BMA
      var matches = exports.regexp.BMA_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": matches[8] && matches[8] == 443
        };
      }
      // Try BMAS
      matches = exports.regexp.BMAS_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80,
        "useSsl": true
      };
    };

    exports.copy = function(otherNode) {
      init(otherNode.host, otherNode.port, otherNode.useSsl, that.useCache/*keep original value*/);
      return that.restart();
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
        if (exact(regexp.PUBKEY).test(uri)) {
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
        if (result.pubkey && !(exact(regexp.PUBKEY).test(result.pubkey))) {
          reject({message: "Invalid pubkey format [" + result.pubkey + "]"}); return;
        }
        if (result.uid && !(exact(regexp.USER_ID).test(result.uid))) {
          reject({message: "Invalid uid format [" + result.uid + "]"}); return;
        }
        if (result.currency && !(exact(regexp.CURRENCY).test(result.currency))) {
          reject({message: "Invalid currency format ["+result.currency+"]"}); return;
        }
        return result;
      });
    };



    exports.websocket = {
        block: ws('/ws/block'),
        peer: ws('/ws/peer'),
        close : closeWs
      };

    angular.merge(that, exports);
  }

  var service = new BMA(undefined, undefined, undefined, true);

  service.instance = function(host, port, useSsl, useCache) {
    var bma = new BMA();
    bma.init(host, port, useSsl, useCache);
    return bma;
  };

  service.lightInstance = function(host, port, useSsl) {
    port = port || 80;
    useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443);
    return {
      node: {
        summary: csHttp.getWithCache(host, port, '/node/summary', useSsl, csHttp.cache.LONG)
      },
      network: {
        peering: {
          self: csHttp.get(host, port, '/network/peering', useSsl)
        },
        peers: csHttp.get(host, port, '/network/peers', useSsl)
      },
      blockchain: {
        current: csHttp.get(host, port, '/blockchain/current', useSsl),
        stats: {
          hardship: csHttp.get(host, port, '/blockchain/hardship/:pubkey', useSsl)
        }
      }
    };
  };

  // default action
  service.start();

  return service;
})

;
