//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngApi', 'cesium.http.services', 'cesium.settings.services'])

.factory('BMA', function($q, $window, $rootScope, $timeout, csCrypto, Api, Device, UIUtils, csConfig, csSettings, csCache, csHttp) {
  'ngInject';

  function BMA(host, port, useSsl, useCache) {

    var cachePrefix = "BMA-",
      pubkey = "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}",
      // TX output conditions
      SIG = "SIG\\((" + pubkey + ")\\)",
      XHX = 'XHX\\(([A-F0-9]{1,64})\\)',
      CSV = 'CSV\\(([0-9]{1,8})\\)',
      CLTV = 'CLTV\\(([0-9]{1,10})\\)',
      OUTPUT_FUNCTION = SIG+'|'+XHX+'|'+CSV+'|'+CLTV,
      OUTPUT_OPERATOR = '(&&)|(\\|\\|)',
      OUTPUT_FUNCTIONS = OUTPUT_FUNCTION+'([ ]*' + OUTPUT_OPERATOR + '[ ]*' + OUTPUT_FUNCTION +')*',
      OUTPUT_OBJ = 'OBJ\\(([0-9]+)\\)',
      OUTPUT_OBJ_OPERATOR = OUTPUT_OBJ + '[ ]*' + OUTPUT_OPERATOR + '[ ]*' + OUTPUT_OBJ,
      REGEX_ENDPOINT_PARAMS = "( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( (.+))?",
      api = {
        BMA: 'BASIC_MERKLED_API',
        BMAS: 'BMAS',
        WS2P: 'WS2P',
        BMATOR: 'BMATOR',
        WS2PTOR: 'WS2PTOR'
      },
      regexp = {
        USER_ID: "[0-9a-zA-Z-_]+",
        CURRENCY: "[0-9a-zA-Z-_]+",
        PUBKEY: pubkey,
        PUBKEY_WITH_CHECKSUM: "(" + pubkey +"):([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{3})",
        COMMENT: "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
        INVALID_COMMENT_CHARS: "[^ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
        // duniter://[uid]:[pubkey]@[host]:[port]
        URI_WITH_AT: "duniter://(?:([A-Za-z0-9_-]+):)?("+pubkey+"@([a-zA-Z0-9-.]+.[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+)",
        URI_WITH_PATH: "duniter://([a-zA-Z0-9-.]+.[a-zA-Z0-9-_:.]+)/("+pubkey+")(?:/([A-Za-z0-9_-]+))?",
        BMA_ENDPOINT: api.BMA + REGEX_ENDPOINT_PARAMS,
        BMAS_ENDPOINT: api.BMAS + REGEX_ENDPOINT_PARAMS,
        WS2P_ENDPOINT: api.WS2P + " ([a-f0-9]{8})"+ REGEX_ENDPOINT_PARAMS,
        BMATOR_ENDPOINT: api.BMATOR + " ([a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+.onion)(?: ([0-9]+))?",
        WS2PTOR_ENDPOINT: api.WS2PTOR + " ([a-f0-9]{8}) ([a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+.onion)(?: ([0-9]+))?(?: (.+))?"
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
        SOURCE_ALREADY_CONSUMED: 2015,
        TX_INPUTS_OUTPUTS_NOT_EQUAL: 2024,
        TX_OUTPUT_SUM_NOT_EQUALS_PREV_DELTAS: 2025,
        TX_ALREADY_PROCESSED: 2030
      },
      constants = {
        PROTOCOL_VERSION: 10,
        ROOT_BLOCK_HASH: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855',
        LIMIT_REQUEST_COUNT: 5, // simultaneous async request to a Duniter node
        LIMIT_REQUEST_DELAY: 1000, // time (in ms) to wait between to call of a rest request
        regexp: regexp,
        api: api
      },
      listeners,
      that = this;

    that.raw = {
      getByPath: {},
      postByPath: {},
      wsByPath: {}
    };
    that.api = new Api(this, 'BMA-' + that.server);
    that.started = false;
    that.init = init;

    // Allow to force SSL connection with port different from 443
    that.forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
    ($window.location && $window.location.protocol === 'https:') ? true : false;
    if (that.forceUseSsl) {
      console.debug('[BMA] Enable SSL (forced by config or detected in URL)');
    }

    if (host)  init(host, port, useSsl);
    that.useCache = angular.isDefined(useCache) ? useCache : true; // need here because used in get() function

    function init(host, port, useSsl) {
      if (that.started) that.stop();
      that.alive = false;

      // Use settings as default, if exists
      if (csSettings.data && csSettings.data.node) {
        host = host || csSettings.data.node.host;
        port = port || csSettings.data.node.port;

        useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || csSettings.data.node.useSsl || that.forceUseSsl);
      }

      if (!host) {
        return; // could not init yet
      }
      that.host = host;
      that.port = port || 80;
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || that.forceUseSsl);
      that.server = csHttp.getServer(host, port);
      that.url = csHttp.getUrl(host, port, ''/*path*/, useSsl);
    }

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function test(regexpContent) {
      return new RegExp(regexpContent);
    }

    function closeWs() {
      if (!that.cache) return;

      console.warn('[BMA] Closing all websockets...');
      _.keys(that.raw.wsByPath||{}).forEach(function(key) {
        var sock = that.raw.wsByPath[key];
        sock.close();
      });
      that.raw.wsByPath = {};
    }

   function cleanCache() {
     console.debug("[BMA] Cleaning cache {prefix: '{0}'}...".format(cachePrefix));
     csCache.clear(cachePrefix);

     // Clean raw requests cache
     angular.merge(that.raw, {
        getByPath: {},
        postByPath: {},
        wsByPath: {}
     });
   }

   function get(path, cacheTime) {

      cacheTime = that.useCache && cacheTime || 0 /* no cache*/ ;
      var requestKey = path + (cacheTime ? ('#'+cacheTime) : '');

      var getRequestFn = function(params) {

        if (!that.started) {
          if (!that._startPromise) {
            console.warn('[BMA] Trying to get [{0}] before start(). Waiting...'.format(path));
          }
          return that.ready().then(function() {
            return getRequestFn(params);
          });
        }

        var request = that.raw.getByPath[requestKey];
        if (!request) {
          if (cacheTime) {
            request = csHttp.getWithCache(that.host, that.port, path, that.useSsl, cacheTime, null, null, cachePrefix);
          }
          else {
            request = csHttp.get(that.host, that.port, path, that.useSsl);
          }
          that.raw.getByPath[requestKey] = request;
        }
        var execCount = 1;
        return request(params)
          .catch(function(err){
            // If node return too many requests error
            if (err && err.ucode === exports.errorCodes.HTTP_LIMITATION) {
              // If max number of retry not reach
              if (execCount <= exports.constants.LIMIT_REQUEST_COUNT) {
                if (execCount === 1) {
                  console.warn("[BMA] Too many HTTP requests: Will wait then retry...");
                  // Update the loading message (if exists)
                  UIUtils.loading.update({template: "COMMON.LOADING_WAIT"});
                }
                // Wait 1s then retry
                return $timeout(function() {
                  execCount++;
                  return request(params);
                }, exports.constants.LIMIT_REQUEST_DELAY);
              }
            }
            throw err;
          });
      };

      return getRequestFn;
    }

    function post(path) {
      var postRequest = function(obj, params) {
        if (!that.started) {
          if (!that._startPromise) {
            console.error('[BMA] Trying to post [{0}] before start()...'.format(path));
          }
          return that.ready().then(function() {
            return postRequest(obj, params);
          });
        }

        var request = that.raw.postByPath[path];
        if (!request) {
          request =  csHttp.post(that.host, that.port, path, that.useSsl);
          that.raw.postByPath[path] = request;
        }
        return request(obj, params);
      };

      return postRequest;
    }

    function ws(path) {
      return function() {
        var sock = that.raw.wsByPath[path];
        if (!sock || sock.isClosed()) {
          sock =  csHttp.ws(that.host, that.port, path, that.useSsl);

          // When close, remove from cache
          sock.onclose = function() {
            delete that.raw.wsByPath[path];
          };

          that.raw.wsByPath[path] = sock;
        }
        return sock;
      };
    }

    that.isAlive = function() {
      // Warn: cannot use previous get() function, because node may not be started yet
      return csHttp.get(that.host, that.port, '/node/summary', that.useSsl)()
        .then(function(json) {
          var software = json && json.duniter && json.duniter.software;
          var isCompatible = true;

          // Check duniter min version
          if (software === 'duniter' && json.duniter.version) {
            isCompatible = csHttp.version.isCompatible(csSettings.data.minVersion, json.duniter.version);
          }
          // TODO: check version of other software (DURS, Juniter, etc.)
          else {
            console.debug('[BMA] Unknown node software [{0} v{1}]: could not check compatibility.'.format(software || '?', json.duniter.version || '?'));
          }
          if (!isCompatible) {
            console.error('[BMA] Incompatible node [{0} v{1}]: expected at least v{2}'.format(software, json.duniter.version, csSettings.data.minVersion));
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
      var hasChanged = (server !== that.url);
      if (hasChanged) {
        init(settings.node.host, settings.node.port, settings.node.useSsl, that.useCache);
        that.restart();
      }
    }

    that.isStarted = function() {
      return that.started;
    };

    that.ready = function() {
      if (that.started) return $q.when(true);
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

      var now = Date.now();

      that._startPromise = $q.all([
          csSettings.ready,
          that.isAlive()
        ])
        .then(function(res) {
          that.alive = res[1];
          if (!that.alive) {
            console.error('[BMA] Could not start [{0}]: node unreachable'.format(that.server));
            that.started = true;
            delete that._startPromise;
            return false;
          }

          // Add listeners
          if (!listeners || listeners.length === 0) {
            addListeners();
          }
          console.debug('[BMA] Started in '+(Date.now()-now)+'ms');

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
      closeWs();
      cleanCache();
      that.alive = false;
      that.started = false;
      delete that._startPromise;
      that.api.node.raise.stop();
    };

    that.restart = function() {
      that.stop();
      return $timeout(that.start, 200)
        .then(function(alive) {
          if (alive) {
            that.api.node.raise.restart();
          }
          return alive;
        });
    };

    that.api.registerEvent('node', 'start');
    that.api.registerEvent('node', 'stop');
    that.api.registerEvent('node', 'restart');

    var exports = {
      errorCodes: errorCodes,
      constants: constants,
      regexp: {
        USER_ID: exact(regexp.USER_ID),
        COMMENT: exact(regexp.COMMENT),
        PUBKEY: exact(regexp.PUBKEY),
        PUBKEY_WITH_CHECKSUM: exact(regexp.PUBKEY_WITH_CHECKSUM),
        CURRENCY: exact(regexp.CURRENCY),
        URI: exact(regexp.URI),
        BMA_ENDPOINT: exact(regexp.BMA_ENDPOINT),
        BMAS_ENDPOINT: exact(regexp.BMAS_ENDPOINT),
        WS2P_ENDPOINT: exact(regexp.WS2P_ENDPOINT),
        BMATOR_ENDPOINT: exact(regexp.BMATOR_ENDPOINT),
        WS2PTOR_ENDPOINT: exact(regexp.WS2PTOR_ENDPOINT),
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
        summary: get('/node/summary', csCache.constants.LONG),
        same: function(host2, port2) {
          return host2 === that.host && ((!that.port && !port2) || (that.port == port2||80)) && (that.useSsl == (port2 && port2 === 443));
        },
        forceUseSsl: that.forceUseSsl
      },
      network: {
        peering: {
          self: get('/network/peering'),
          peers: get('/network/peering/peers')
        },
        peers: get('/network/peers'),
        ws2p: {
          info: get('/network/ws2p/info'),
          heads: get('/network/ws2p/heads')
        }
      },
      wot: {
        lookup: get('/wot/lookup/:search'),
        certifiedBy: get('/wot/certified-by/:pubkey', csCache.constants.SHORT),
        certifiersOf: get('/wot/certifiers-of/:pubkey', csCache.constants.SHORT),
        member: {
          all: get('/wot/members', csCache.constants.LONG),
          pending: get('/wot/pending', csCache.constants.SHORT)
        },
        requirements: function(params, cache) {
          // No cache by default
          if (cache !== true) return exports.raw.wot.requirements(params);
          return exports.raw.wot.requirementsWithCache(params);
        },
        add: post('/wot/add'),
        certify: post('/wot/certify'),
        revoke: post('/wot/revoke')
      },
      blockchain: {
        parameters: get('/blockchain/parameters', csCache.constants.VERY_LONG),
        block: get('/blockchain/block/:block', csCache.constants.SHORT),
        blocksSlice: get('/blockchain/blocks/:count/:from'),
        current: function(cache) {
          // No cache by default
          return (cache !== true) ? exports.raw.blockchain.current() : exports.raw.blockchain.currentWithCache();
        },
        membership: post('/blockchain/membership'),
        stats: {
          ud: get('/blockchain/with/ud', csCache.constants.MEDIUM),
          tx: get('/blockchain/with/tx'),
          newcomers: get('/blockchain/with/newcomers', csCache.constants.MEDIUM),
          hardship: get('/blockchain/hardship/:pubkey'),
          difficulties: get('/blockchain/difficulties')
        }
      },
      tx: {
        sources: get('/tx/sources/:pubkey', csCache.constants.SHORT),
        process: post('/tx/process'),
        history: {
          all: function(params) {
            return exports.raw.tx.history.all(params)
              .then(function(res) {
                res.history = res.history || {};
                // Clean sending and pendings, because already returned by tx/history/:pubkey/pending
                res.history.sending = [];
                res.history.pendings = [];
                return res;
              });
          },
          times: function(params, cache) {
            // No cache by default
            return ((cache !== true) ? exports.raw.tx.history.times(params) : exports.raw.tx.history.timesWithCache(params))
              .then(function(res) {
                res.history = res.history || {};
                // Clean sending and pendings, because already returned by tx/history/:pubkey/pending
                res.history.sending = [];
                res.history.pendings = [];
                return res;
              });
          },
          blocks: get('/tx/history/:pubkey/blocks/:from/:to', csCache.constants.LONG),
          pending: get('/tx/history/:pubkey/pending')
        }
      },
      ud: {
        history: get('/ud/history/:pubkey')
      },
      uri: {},
      version: {},
      raw: {
        blockchain: {
          currentWithCache: get('/blockchain/current', csCache.constants.SHORT),
          current: get('/blockchain/current')
        },
        wot: {
          requirementsWithCache: get('/wot/requirements/:pubkey', csCache.constants.LONG),
          requirements: get('/wot/requirements/:pubkey')
        },
        tx: {
          history: {
            timesWithCache: get('/tx/history/:pubkey/times/:from/:to', csCache.constants.LONG),
            times: get('/tx/history/:pubkey/times/:from/:to'),
            all: get('/tx/history/:pubkey')
          }
        },
      }
    };

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

    exports.node.parseEndPoint = function(endpoint, epPrefix) {
      // Try BMA
      var matches = exports.regexp.BMA_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": matches[8] && matches[8] == 443,
          "path": matches[10],
          "useBma": true
        };
      }
      // Try BMAS
      matches = exports.regexp.BMAS_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": true,
          "path": matches[10],
          "useBma": true
        };
      }
      // Try BMATOR
      matches = exports.regexp.BMATOR_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "dns": matches[1] || '',
          "port": matches[2] || 80,
          "useSsl": false,
          "useTor": true,
          "useBma": true
        };
      }
      // Try WS2P
      matches = exports.regexp.WS2P_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "ws2pid": matches[1] || '',
          "dns": matches[3] || '',
          "ipv4": matches[5] || '',
          "ipv6": matches[7] || '',
          "port": matches[9] || 80,
          "useSsl": matches[9] && matches[9] == 443,
          "path": matches[11] || '',
          "useWs2p": true
        };
      }
      // Try WS2PTOR
      matches = exports.regexp.WS2PTOR_ENDPOINT.exec(endpoint);
      if (matches) {
        return {
          "ws2pid": matches[1] || '',
          "dns": matches[2] || '',
          "port": matches[3] || 80,
          "path": matches[4] || '',
          "useSsl": false,
          "useTor": true,
          "useWs2p": true
        };
      }

      // Use generic match
      if (epPrefix) {
        matches = exact(epPrefix + REGEX_ENDPOINT_PARAMS).exec(endpoint);
        if (matches) {
          return {
            "dns": matches[2] || '',
            "ipv4": matches[4] || '',
            "ipv6": matches[6] || '',
            "port": matches[8] || 80,
            "useSsl": matches[8] && matches[8] == 443,
            "path": matches[10],
            "useBma": false
          };
        }
      }

    };

    exports.copy = function(otherNode) {
      var wasStarted = that.started;

      var server = csHttp.getUrl(otherNode.host, otherNode.port, ''/*path*/, otherNode.useSsl);
      var hasChanged = (server !== that.url);
      if (hasChanged) {
        that.init(otherNode.host, otherNode.port, otherNode.useSsl, that.useCache/*keep original value*/);
        // Restart (only if was already started)
        return wasStarted ? that.restart() : $q.when();
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
      return exports.raw.getHttpRecursive(exports.network.peering.peers, 'leaf', leaves, 0, 10);
    };

    exports.raw.getHttpRecursive = function(httpGetRequest, paramName, paramValues, offset, size) {
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
            if (err && err.ucode === exports.errorCodes.HTTP_LIMITATION) {
              resolve(result);
            }
            else {
              reject(err);
            }
          });
      });
    };

    exports.raw.getHttpWithRetryIfLimitation = function(exec) {
      return exec()
        .catch(function(err){
          // When too many request, retry in 3s
          if (err && err.ucode == exports.errorCodes.HTTP_LIMITATION) {
            return $timeout(function() {
              // retry
              return exports.raw.getHttpWithRetryIfLimitation(exec);
            }, exports.constants.LIMIT_REQUEST_DELAY);
          }
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
        var pubkey;

        // If pubkey: not need to parse
        if (exact(regexp.PUBKEY).test(uri)) {
          resolve({
            pubkey: uri
          });
        }
        // If pubkey+checksum
        else if (exact(regexp.PUBKEY_WITH_CHECKSUM).test(uri)) {
          console.debug("[BMA.parse] Detecting a pubkey with checksum: " + uri);
          var matches = exports.regexp.PUBKEY_WITH_CHECKSUM.exec(uri);
          pubkey = matches[1];
          var checksum = matches[2];
          console.debug("[BMA.parse] Detecting a pubkey {"+pubkey+"} with checksum {" + checksum + "}");
          var expectedChecksum = csCrypto.util.pkChecksum(pubkey);
          console.debug("[BMA.parse] Expecting checksum for pubkey is {" + expectedChecksum + "}");
          if (checksum != expectedChecksum) {
            reject( {message: 'ERROR.PUBKEY_INVALID_CHECKSUM'});
          }
          else {
            resolve({
              pubkey: pubkey
            });
          }
        }
        else if(uri.startsWith('duniter://')) {
          var parser = csHttp.uri.parse(uri),
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
                console.error(err);
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
              })
              .catch(function(err) {
                console.error(err);
                reject({message: 'Could not get node parameter. Currency could not be retrieve'});
              });
          }
        }
        else {
          console.debug("[BMA.parse] Could not parse URI: " + uri);
          reject({message: 'ERROR.UNKNOWN_URI_FORMAT'});
        }
      })

      // Check values against regex
      .then(function(result) {
        if (!result) return;
        if (result.pubkey && !(exact(regexp.PUBKEY).test(result.pubkey))) {
          throw {message: "Invalid pubkey format [" + result.pubkey + "]"};
        }
        if (result.uid && !(exact(regexp.USER_ID).test(result.uid))) {
          throw {message: "Invalid uid format [" + result.uid + "]"};
        }
        if (result.currency && !(exact(regexp.CURRENCY).test(result.currency))) {
          throw {message: "Invalid currency format ["+result.currency+"]"};
        }
        return result;
      });
    };

    // Define get latest release (or fake function is no URL defined)
    var duniterLatestReleaseUrl = csSettings.data.duniterLatestReleaseUrl && csHttp.uri.parse(csSettings.data.duniterLatestReleaseUrl);
    exports.raw.getLatestRelease = duniterLatestReleaseUrl ?
      csHttp.getWithCache(duniterLatestReleaseUrl.host,
        duniterLatestReleaseUrl.port,
        "/" + duniterLatestReleaseUrl.pathname,
        /*useSsl*/ (+(duniterLatestReleaseUrl.port) === 443 || duniterLatestReleaseUrl.protocol === 'https:' || that.forceUseSsl),
        csCache.constants.LONG
      ) :
      // No URL define: use a fake function
      function() {
        return $q.when();
      };

    exports.version.latest = function() {
      return exports.raw.getLatestRelease()
        .then(function (json) {
          if (!json) return;
          if (json.name && json.html_url) {
            return {
              version: json.name,
              url: json.html_url
            };
          }
          if (json.tag_name && json.html_url) {
            return {
              version: json.tag_name.substring(1),
              url: json.html_url
            };
          }
        })
        .catch(function(err) {
          // silent (just log it)
          console.error('[BMA] Failed to get Duniter latest version', err);
        });
    };

    exports.websocket = {
        block: ws('/ws/block'),
        peer: ws('/ws/peer'),
        close : closeWs
      };

    angular.merge(that, exports);
  }

  var service = new BMA();

  service.instance = function(host, port, useSsl, useCache) {
    useCache = angular.isDefined(useCache) ? useCache : false; // No cache by default
    return new BMA(host, port, useSsl, useCache);
  };

  service.lightInstance = function(host, port, useSsl, timeout) {
    port = port || 80;
    useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443);
    return {
      host: host,
      port: port,
      useSsl: useSsl,
      url: csHttp.getUrl(host, port, ''/*no path*/, useSsl),
      node: {
        summary: csHttp.getWithCache(host, port, '/node/summary', useSsl, csCache.constants.MEDIUM, false/*autoRefresh*/, timeout)
      },
      network: {
        peering: {
          self: csHttp.get(host, port, '/network/peering', useSsl, timeout)
        },
        peers: csHttp.get(host, port, '/network/peers', useSsl, timeout)
      },
      blockchain: {
        current: csHttp.get(host, port, '/blockchain/current', useSsl, timeout),
        stats: {
          hardship: csHttp.get(host, port, '/blockchain/hardship/:pubkey', useSsl, timeout)
        }
      }
    };
  };

  // default action
  //service.start();

  return service;
})

;
