//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['ngApi', 'cesium.http.services', 'cesium.settings.services'])

.factory('BMA', function($q, $window, $rootScope, $timeout, $http,
                         csCrypto, Api, Device, UIUtils, csConfig, csSettings, csCache, csHttp) {
  'ngInject';

  function BMA(host, port, path, useSsl, useCache, timeout) {

    var
      id = (!host ? 'default' : '{0}:{1}'.format(host, (port || (useSsl ? '443' : '80')))), // Unique id of this instance
      cachePrefix = "BMA-",
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
        GVA: 'GVA',
        GVAS: 'GVA S',
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
        GVA_ENDPOINT: api.GVA + REGEX_ENDPOINT_PARAMS,
        GVAS_ENDPOINT: api.GVAS + REGEX_ENDPOINT_PARAMS,
        WS2P_ENDPOINT: api.WS2P + " ([a-f0-9]{8})" + REGEX_ENDPOINT_PARAMS,
        BMATOR_ENDPOINT: api.BMATOR + " ([a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+.onion)(?: ([0-9]+))?",
        WS2PTOR_ENDPOINT: api.WS2PTOR + " ([a-f0-9]{8}) ([a-z0-9-_.]*|[0-9.]+|[0-9a-f:]+.onion)(?: ([0-9]+))?(?: (.+))?"
      },
      errorCodes = {
        REVOCATION_ALREADY_REGISTERED: 1002,
        HTTP_LIMITATION: 1006,
        IDENTITY_SANDBOX_FULL: 1007,
        CERTIFICATION_SANDBOX_FULL: 1008,
        MEMBERSHIP_SANDBOX_FULL: 1009,
        TRANSACTIONS_SANDBOX_FULL: 1010,
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
        TIMEOUT: {
          NONE: -1,
          SHORT: 1000, // 1s
          MEDIUM: 5000, // 5s
          LONG: 10000, // 10s
          DEFAULT: csConfig.timeout,
          VERY_LONG: 60000 * 2 // 2 min (.e.g need by /tx/sources for Duniter < v1.9
        },
        regexp: regexp,
        api: api
      },
      listeners,
      that = this;

    that.raw = {
      getByPath: {},
      getCountByPath: {},
      postByPath: {},
      wsByPath: {}
    };
    that.api = new Api(this, 'BMA-' + id);
    that.started = false;
    that.init = init;

    // Allow to force SSL connection with port different from 443
    that.forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
    ($window.location && $window.location.protocol === 'https:') ? true : false;
    if (that.forceUseSsl) {
      console.debug('[BMA] Enable SSL (forced by config or detected in URL)');
    }

    if (host)  init(host, port, path, useSsl);
    that.useCache = angular.isDefined(useCache) ? useCache : true; // need here because used in get() function

    function init(host, port, path, useSsl) {
      if (that.started) that.stop();
      that.alive = false;

      // Use settings as default, if exists
      var node = csSettings.data && csSettings.data.node;
      if (node) {
        host = host || node.host;
        port = port || node.port;
        path = path || node.path;
        useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || node.useSsl || that.forceUseSsl);
      }

      if (!host) return; // could not init yet

      path = path && path.length ? path : (host.indexOf('/') !== -1 ? host.substring(host.indexOf('/')) : '');
      if (path.endsWith('/')) path = path.substring(0, path.length -1); // Remove trailing slash
      host = host.indexOf('/') !== -1 ? host.substring(0, host.indexOf('/')) : host; // Remove path from host

      that.host = host;
      that.port = port || 80;
      that.path = path || '';
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || that.forceUseSsl);
      that.server = csHttp.getServer(that.host, that.port);
      that.url = csHttp.getUrl(that.host, that.port, that.path, that.useSsl);
    }

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function test(regexpContent) {
      return new RegExp(regexpContent);
    }

    function closeWs() {
      if (!that.raw) return;

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

      // Clean raw requests by path cache
      that.raw.getByPath = {};
      that.raw.getCountByPath = {};
      that.raw.postByPath = {};
      that.raw.wsByPath = {};
    }

    function getCacheable(path, cacheTime, forcedTimeout) {

      cacheTime = that.useCache && cacheTime || 0 /* no cache*/ ;
      forcedTimeout = forcedTimeout || timeout;
      var cacheKey = path + (cacheTime ? ('#'+cacheTime) : '');

      // Store requestFn into a variable a function, to be able to call it to loop
      var wrappedRequest = function(params) {

        if (!that.started) {
          if (!that._startPromise) {
            console.warn('[BMA] Trying to get [{0}] before start(). Waiting...'.format(path));
          }
          return that.ready()
            .then(function() {
              return wrappedRequest(params);
            });
        }

        // Create the request function, if not exists
        var request = that.raw.getByPath[cacheKey];
        if (!request) {
          if (cacheTime) {
            request = csHttp.getWithCache(that.host, that.port, that.path + path, that.useSsl, cacheTime, null/*autoRefresh*/, forcedTimeout, cachePrefix);
          }
          else {
            request = csHttp.get(that.host, that.port, that.path + path, that.useSsl, forcedTimeout);
          }

          that.raw.getByPath[cacheKey] = request;
        }

        return request(params);
      };

      return wrappedRequest;
    }

    function get(path, cacheTime, forcedTimeout) {
      var request = getCacheable(path, cacheTime, forcedTimeout);

      var execCount = 1;
      var wrappedRequest = function(params) {
        return request(params)
          .then(function(res) {
            execCount--;
            return res;
          })
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
                  return wrappedRequest(params); // Loop
                }, exports.constants.LIMIT_REQUEST_DELAY);
              }
            }
            throw err;
          });
      }
      return wrappedRequest;
    }



    function incrementGetUsageCount(path, limitRequestCount) {
      limitRequestCount = limitRequestCount || constants.LIMIT_REQUEST_COUNT;
      // Wait if too many requests on this path
      if (that.raw.getCountByPath[path] >= limitRequestCount) {

        // DEBUG
        //console.debug("[BMA] Delaying request '{0}' to avoid a quota error...".format(path));

        return $timeout(function() {
          return incrementGetUsageCount(path, limitRequestCount);
        }, constants.LIMIT_REQUEST_DELAY);
      }

      that.raw.getCountByPath[path]++;
      return $q.when();
    }

    function decrementGetPathCount(path, timeout) {
      if (timeout > 0) {
        $timeout(function() {
          decrementGetPathCount(path);
        }, timeout);
      }
      else {
        that.raw.getCountByPath[path]--;
      }
    }

    /**
     * Allow to call GET requests, with a limited rate (in Duniter node). Parallel execution will be done,
     * until the max limitRequestCount, then BMA will wait few times, and continue.
     * @param path
     * @param cacheTime
     * @param forcedTimeout
     * @param limitRequestCount
     * @returns {function(*): *}
     */
    function getHighUsage(path, cacheTime, forcedTimeout, limitRequestCount) {
      limitRequestCount = limitRequestCount || constants.LIMIT_REQUEST_COUNT;

      that.raw.getCountByPath[path] = that.raw.getCountByPath[path] || 0;
      var request = getCacheable(path, cacheTime, forcedTimeout);

      var wrappedRequest = function(params) {

        var start = Date.now();
        return incrementGetUsageCount(path, limitRequestCount)
          .then(function() {
            return request(params);
          })
          .then(function(res) {
            decrementGetPathCount(path, constants.LIMIT_REQUEST_DELAY - (Date.now() - start));
            return res;
          })
          .catch(function(err) {
            decrementGetPathCount(path, constants.LIMIT_REQUEST_DELAY - (Date.now() - start));
            // When too many request, retry in 3s
            if (err && err.ucode === errorCodes.HTTP_LIMITATION) {

              // retry
              return $timeout(function () {
                return wrappedRequest(params);
              }, constants.LIMIT_REQUEST_DELAY);
            }
            throw err;
          });
      };

      return wrappedRequest;
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
          request =  csHttp.post(that.host, that.port, that.path + path, that.useSsl);
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
          sock =  csHttp.ws(that.host, that.port, that.path + path, that.useSsl);

          // When close, remove from cache
          sock.onclose = function() {
            delete that.raw.wsByPath[path];
          };

          that.raw.wsByPath[path] = sock;
        }
        return sock;
      };
    }

    that.isAlive = function(node, timeout) {
      node = node || that;
      // WARN:
      //  - Cannot use previous get() function, because
      //    node can be !=that, or not be started yet
      //  - Do NOT use cache here
      return csHttp.get(node.host, node.port, (node.path || '') + '/node/summary', node.useSsl || that.forceUseSsl, timeout)()
        .then(function(json) {
          var software = json && json.duniter && json.duniter.software;
          var isCompatible = true;

          // Check duniter min version
          if (software === 'duniter' && json.duniter.version) {
            isCompatible = csHttp.version.isCompatible(csSettings.data.minVersion, json.duniter.version) &&
              // version < 1.8.7 (no storage) OR transaction storage enabled
              (!json.duniter.storage || json.duniter.storage.transactions === true);
            if (!isCompatible) {
              console.error('[BMA] Incompatible Duniter peer [{0}{1}] (actual version {2}): min expected version is {3} with transactions storage enabled'.format(
                csHttp.getServer(node.host, node.port),
                node.path ||'',
                json.duniter.version || '?', csSettings.data.minVersion));
            }
          }
          else {
            console.warn('[BMA] Unknown software [{0}] found in peer [{1}{2}] (version {3}): could not check compatibility.'.format(
              software || '?',
              csHttp.getServer(node.host, node.port),
              node.path ||'',
              json.duniter.version || '?'));
          }
          return isCompatible;
        })
        .catch(function() {
          return false; // Unreachable
        });
    };

    function isSameNode(node2) {
      node2 = node2 || {};
      var useSsl = angular.isDefined(node2.useSsl) ? node2.useSsl : (node2.port && node2.port == 443);
      var port = node2.port || (useSsl ? 443 : 80);
      // Same host
      return that.host === node2.host &&
        // Same path
          ((!that.path && !node2.path) || (that.path == node2.path||'')) &&
          // Same port
          ((!that.port && !node2.port) || (that.port == port)) &&
          // Same useSsl
          (that.useSsl === useSsl);
    }

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
      // Wait 1s (because settings controller can have restart the service), then copy the settings node
      $timeout(function() {
        exports.copy(settings.node);
      }, 1000);
    }

    that.isStarted = function() {
      return that.started;
    };

    that.ready = function() {
      if (that.started) return $q.when(that.alive);
      return (that._startPromise || that.start());
    };

    that.start = function() {
      if (that._startPromise) return that._startPromise;
      if (that.started) return $q.when(that.alive);

      // Load without argument: wait settings, then init using setting's data
      if (!that.host || !csSettings.isStarted()) {
        return csSettings.ready()
          .then(function() {
            that.init();

            // Always enable cache
            that.useCache = true;

            return that.start(); // recursive call
          });
      }

      console.debug("[BMA] Starting from [{0}{1}] {ssl: {2})...".format(that.server, that.path, that.useSsl));
      var now = Date.now();

      that._startPromise = that.isAlive()
        .then(function(alive) {
          that.alive = alive;
          if (!that.alive) {
            console.error("[BMA] Could not start using peer [{0}{1}]: unreachable or incompatible".format(that.server, that.path));
            that.started = true;
            delete that._startPromise;
            return false; // Not alive
          }

          // Add listeners
          if (!listeners || !listeners.length) {
            addListeners();
          }
          console.debug('[BMA] Started in {0}ms'.format(Date.now()-now));

          that.api.node.raise.start();
          that.started = true;
          delete that._startPromise;
          return true; // Alive
        });
      return that._startPromise;
    };

    that.stop = function() {
      if (!that.started && !that._startPromise) return $q.when(); // Skip multiple call

      console.debug('[BMA] Stopping...');

      removeListeners();
      delete that._startPromise;

      if (that.alive) {
        closeWs();
        cleanCache();
        that.alive = false;
        that.started = false;
        that.api.node.raise.stop();
      }
      else {
        that.started = false;
      }
      return $q.when();
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

    that.filterAliveNodes = function(fallbackNodes, timeout) {
      timeout = timeout || csSettings.data.timeout;

      // Filter to exclude the current BMA node
      fallbackNodes = _.filter(fallbackNodes || [], function(node) {
        node.server = node.server || node.host + ((!node.port && node.port != 80 && node.port != 443) ? (':' + node.port) : '');
        var same = that.node.same(node);
        if (same) console.debug('[BMA] Skipping fallback node [{0}]: same as current BMA node'.format(node.server));
        return !same;
      });

      console.debug('[BMA] Getting alive fallback nodes... {timeout: {0}}'.format(timeout));

      var aliveNodes = [];
      return $q.all(_.map(fallbackNodes, function(node) {
        return that.isAlive(node, timeout)
          .then(function(alive) {
            if (alive) {
              node.url = csHttp.getUrl(node);
              node.server = csHttp.getUrl(node);
              aliveNodes.push({
                host: node.host,
                port: node.port,
                useSsl: node.useSsl || node.port == 443,
                path: node.path
              });
            }
            else {
              console.error('[BMA] Unreachable (or not compatible) fallback node [{0}]: skipping'.format(node.server));
            }
          });
        }))
        .then(function() {
          return aliveNodes;
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
        GVA_ENDPOINT: exact(regexp.GVA_ENDPOINT),
        GVAS_ENDPOINT: exact(regexp.GVAS_ENDPOINT),
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
        summary: get('/node/summary', csCache.constants.MEDIUM),
        sandbox: get('/node/sandbox'),
        same: isSameNode,
        forceUseSsl: that.forceUseSsl
      },
      network: {
        peering: {
          self: get('/network/peering'),
          peers: getHighUsage('/network/peering/peers', null, null, 10)
        },
        peers: get('/network/peers'),
        ws2p: {
          info: get('/network/ws2p/info'),
          heads: get('/network/ws2p/heads')
        }
      },
      wot: {
        lookup: get('/wot/lookup/:search'),
        certifiedBy: get('/wot/certified-by/:pubkey?pubkey=true', csCache.constants.SHORT),
        certifiersOf: get('/wot/certifiers-of/:pubkey?pubkey=true', csCache.constants.SHORT),
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
                res.history = res.history || {};
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
                res.history = res.history || {};
                // Clean sending and pendings, because already returned by tx/history/:pubkey/pending
                res.history.sending = [];
                res.history.pendings = [];
                return res;
              });
          },
          /*blocks: get('/tx/history/:pubkey/blocks/:from/:to', csCache.constants.LONG),*/
          pending: getHighUsage('/tx/history/:pubkey/pending')
        }
      },
      ud: {
        history: {
          all: get('/ud/history/:pubkey'),
          times: function(params, cache) {
            // No cache by default
            return ((cache !== true) ? exports.raw.ud.history.times(params) : exports.raw.ud.history.timesWithCache(params));
          },
          /*blocks: get('/ud/history/:pubkey/blocks/:from/:to', csCache.constants.LONG),*/
        }
      },
      uri: {},
      version: {},
      raw: {
        blockchain: {
          currentWithCache: get('/blockchain/current', csCache.constants.SHORT),
          current: get('/blockchain/current')
        },
        wot: {
          requirementsWithCache: get('/wot/requirements/:pubkey?pubkey=true', csCache.constants.LONG),
          requirements: get('/wot/requirements/:pubkey?pubkey=true')
        },
        tx: {
          history: {
            timesWithCache: getHighUsage('/tx/history/:pubkey/times/:from/:to', csCache.constants.LONG),
            times: getHighUsage('/tx/history/:pubkey/times/:from/:to'),
            all: get('/tx/history/:pubkey')
          }
        },
        ud: {
          history: {
            timesWithCache: get('/ud/history/:pubkey/times/:from/:to', csCache.constants.LONG),
            times: get('/ud/history/:pubkey/times/:from/:to')
          }
        }
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
      var path = null;

      // Try BMA
      var matches = exports.regexp.BMA_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[10];
        if (path && !path.startsWith('/')) path = '/' + path; // Fix path
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": matches[8] && matches[8] == 443,
          "path": path || '',
          "useBma": true
        };
      }
      // Try BMAS
      matches = exports.regexp.BMAS_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[10];
        if (path && !path.startsWith('/')) path = '/' + path; // Fix path
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": true,
          "path": path || '',
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
          "useBma": true,
          "useWs2p": false,
          "useGva": false
        };
      }

      // Try GVA
      matches = exports.regexp.GVA_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[10];
        if (path && !path.startsWith('/')) path = '/' + path; // Add starting slash
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 80,
          "useSsl": matches[8] && matches[8] == 443,
          "path": path || '',
          "useBma": false,
          "useWs2p": false,
          "useGva": true,
        };
      }
      // Try GVAS
      matches = exports.regexp.GVAS_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[10];
        if (!path.startsWith('/')) path = '/' + path; // Fix GVA path
        return {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 443,
          "useSsl": true,
          "path": path || '',
          "useBma": false,
          "useWs2p": false,
          "useGva": true,
        };
      }
      // Try WS2P
      matches = exports.regexp.WS2P_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[11];
        if (path && !path.startsWith('/')) path = '/' + path;
        return {
          "ws2pid": matches[1] || '',
          "dns": matches[3] || '',
          "ipv4": matches[5] || '',
          "ipv6": matches[7] || '',
          "port": matches[9] || 80,
          "useSsl": matches[9] && matches[9] == 443,
          "path": path || '',
          "useWs2p": true,
          "useBma": false
        };
      }
      // Try WS2PTOR
      matches = exports.regexp.WS2PTOR_ENDPOINT.exec(endpoint);
      if (matches) {
        path = matches[4];
        if (path && !path.startsWith('/')) path = '/' + path;
        return {
          "ws2pid": matches[1] || '',
          "dns": matches[2] || '',
          "port": matches[3] || 80,
          "path": path || '',
          "useSsl": false,
          "useTor": true,
          "useWs2p": true,
          "useBma": false
        };
      }

      // Use generic match
      if (epPrefix) {
        matches = exact(epPrefix + REGEX_ENDPOINT_PARAMS).exec(endpoint);
        if (matches) {
          path = matches[10];
          if (path && !path.startsWith('/')) path = '/' + path;
          return {
            "dns": matches[2] || '',
            "ipv4": matches[4] || '',
            "ipv6": matches[6] || '',
            "port": matches[8] || 80,
            "useSsl": matches[8] && matches[8] == 443,
            "path": path || '',
            "useBma": false
          };
        }
      }

    };

    exports.copy = function(otherNode) {

      var url = csHttp.getUrl(otherNode.host, otherNode.port, otherNode.path || '', otherNode.useSsl);
      var hasChanged = (url !== that.url);
      if (hasChanged) {
        var wasStarted = that.started;
        if (wasStarted) that.stop();
        that.init(otherNode.host, otherNode.port, otherNode.path || '', otherNode.useSsl);
        if (wasStarted) {
          return $timeout(function () {
            return that.start()
              .then(function (alive) {
                if (alive) {
                  that.api.node.raise.restart();
                }
                return alive;
              });
          }, 200); // Wait stop finished
        }
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
     * @param blockNumbers an array of block number
    */
    exports.blockchain.blocks = function(blockNumbers){
      return $q.all(blockNumbers.map(function(block) {
        return exports.blockchain.block({block: block});
      }));
    };

    /**
     * Return all expected blocks
     * @param leaves
     */
    exports.network.peering.peersByLeaves = function(leaves){
      return $q.all(leaves.map(function(leaf) {
        return exports.network.peering.peers({leaf: leaf});
      }));
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
      if (!uri) return $q.reject("Missing required argument 'uri'");

      return $q(function(resolve, reject) {
        // Pubkey or pubkey+checksum
        if (exports.regexp.PUBKEY.test(uri) || exports.regexp.PUBKEY_WITH_CHECKSUM.test(uri)) {
          resolve({
            pubkey: uri
          });
        }

        // Uid
        else if (uri.startsWith('@') && exports.regexp.USER_ID.test(uid.substr(1))) {
          resolve({
            uid: uid.substr(1)
          });
        }

        // G1 protocols
        else if(uri.startsWith('june:') || uri.startsWith('web+june:')) {
          var parser = csHttp.uri.parse(uri);

          // Pubkey (explicit path)
          var pubkey;
          if (parser.hostname === 'wallet' || parser.hostname === 'pubkey') {
            if (exports.regexp.PUBKEY.test(parser.pathSegments[0]) || exports.regexp.PUBKEY_WITH_CHECKSUM.test(parser.pathSegments[0])) {
              pubkey = parser.pathSegments[0];
              parser.pathSegments = parser.pathSegments.slice(1);
            }
            else {
              reject({message: 'ERROR.INVALID_PUBKEY'});
              return;
            }
          }
          else if (parser.hostname &&
            (exports.regexp.PUBKEY.test(parser.hostname) || exports.regexp.PUBKEY_WITH_CHECKSUM.test(parser.hostname))) {
            pubkey = parser.hostname;
          }

          if (pubkey) {
            resolve({
              pubkey: pubkey,
              pathSegments: parser.pathSegments,
              params: parser.searchParams
            });
          }

          // UID
          else if (parser.hostname && parser.hostname.startsWith('@') && exports.regexp.USER_ID.test(parser.hostname.substr(1))) {
            resolve({
              uid: parser.hostname.substr(1),
              pathSegments: parser.pathSegments,
              params: parser.searchParams
            });
          }

          // Block
          else if (parser.hostname === 'block') {
            resolve({
              block: {number: parser.pathSegments[0]},
              pathSegments: parser.pathSegments.slice(1),
              params: parser.searchParams
            });
          }

          // Other case
          else {
            console.debug("[BMA.parse] Unknown URI format: " + uri);
            reject({message: 'ERROR.UNKNOWN_URI_FORMAT'});
          }
        }
        else {
          console.debug("[BMA.parse] Unknown URI format: " + uri);
          reject({message: 'ERROR.UNKNOWN_URI_FORMAT'});
        }
      })

      // Check values against regex
      .then(function(result) {
        if (!result) return;

        // Validate checksum
        if (result.pubkey && exports.regexp.PUBKEY_WITH_CHECKSUM.test(result.pubkey)) {
          console.debug("[BMA.parse] Validating pubkey checksum... ");
          var matches = exports.regexp.PUBKEY_WITH_CHECKSUM.exec(uri);
          pubkey = matches[1];
          var checksum = matches[2];
          var expectedChecksum = csCrypto.util.pkChecksum(pubkey);
          if (checksum !== expectedChecksum) {
            console.warn("[BMA.parse] Detecting a pubkey {"+pubkey+"} with checksum {" + checksum + "}, but expecting checksum is {" + expectedChecksum + "}");
            throw {message: 'ERROR.PUBKEY_INVALID_CHECKSUM'};
          }
          result.pubkey = pubkey;
          result.pubkeyChecksum = checksum;
        }
        return result;
      });
    };

    // Define get latest release (or fake function is no URL defined)
    if (csSettings.data.duniterLatestReleaseUrl) {
      var releaseUri = csHttp.uri.parse(csSettings.data.duniterLatestReleaseUrl);
      var releaseUriUseSsl = releaseUri.port == 443 || releaseUri.protocol === 'https:' || that.forceUseSsl;
      exports.raw.getLatestRelease = csHttp.getWithCache(releaseUri.host, releaseUri.port, "/" + releaseUri.pathname, releaseUriUseSsl,
        csCache.constants.LONG);
    }
    // No URL define: use a fake function
    else {
      exports.raw.getLatestRelease = function() {
        return $q.when();
      };
    }

    exports.version.latest = function() {
      return exports.raw.getLatestRelease()
        .then(function (json) {
          if (!json) return;

          // Gitlab
          if (Array.isArray(json)) {
            var releaseVersion = _.find(json, function(res) {
              return res.tag && res.description && res.description.contains(':white_check_mark: Release\n');
            });
            if (releaseVersion) {
              var version = releaseVersion.tag.startsWith('v') ? releaseVersion.tag.substring(1) : releaseVersion.tag;
              var url = (csSettings.data.duniterLatestReleaseUrl.endsWith('.json') ?
                csSettings.data.duniterLatestReleaseUrl.substring(0, csSettings.data.duniterLatestReleaseUrl.length - 4) :
                csSettings.data.duniterLatestReleaseUrl) + '/' + releaseVersion.tag;
              return {
                version: version,
                url: url
              };
            }
          }

          // Github
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

  service.instance = function(host, port, path, useSsl, useCache, timeout) {
    useCache = angular.isDefined(useCache) ? useCache : false; // No cache by default
    return new BMA(host, port, path, useSsl, useCache, timeout);
  };

  service.lightInstance = function(host, port, path, useSsl, timeout) {
    port = port || 80;
    useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443);
    timeout = timeout || csSettings.data.timeout;
    path = path || (host.indexOf('/') !== -1 ? host.substring(host.indexOf('/')) : '');
    if (!path.startsWith('/')) path = '/' + path; // Add starting slash
    if (path.endsWith('/')) path = path.substring(0, path.length - 1); // Remove trailing slash
    host = host.indexOf('/') !== -1 ? host.substring(0, host.indexOf('/')) : host;
    return {
      host: host,
      port: port,
      path: path,
      useSsl: useSsl,
      server: csHttp.getServer(host, port),
      url: csHttp.getUrl(host, port, path, useSsl),
      node: {
        summary: csHttp.getWithCache(host, port, path + '/node/summary', useSsl, csCache.constants.MEDIUM, false/*autoRefresh*/, timeout),
        sandboxes: csHttp.get(host, port, path + '/node/sandboxes', useSsl, timeout),
      },
      network: {
        peering: {
          self: csHttp.get(host, port, path + '/network/peering', useSsl, timeout)
        },
        peers: csHttp.get(host, port, path + '/network/peers', useSsl, timeout)
      },
      blockchain: {
        current: csHttp.get(host, port, path + '/blockchain/current', useSsl, timeout),
        stats: {
          hardship: csHttp.get(host, port, path + '/blockchain/hardship/:pubkey', useSsl, timeout)
        }
      },
      tx: {
        process: csHttp.post(host, port, path + '/tx/process', useSsl, timeout)
      }
    };
  };

  // default action
  //service.start();

  return service;
})

;
