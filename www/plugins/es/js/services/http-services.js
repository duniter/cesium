angular.module('cesium.es.http.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, $timeout, $rootScope, $state, $sce, $translate, $window, $filter,
                            CryptoUtils, UIUtils, csHttp, csConfig, csSettings, csCache, BMA, csWallet, csPlatform, Api) {
  'ngInject';

  // Allow to force SSL connection with port different from 443
  var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
  ($window.location && $window.location.protocol === 'https:') ? true : false;
  if (forceUseSsl) {
    console.debug('[ES] [https] Enable SSL (forced by config or detected in URL)');
  }

  function EsHttp(host, port, useSsl, enableCache) {

    var
      that = this,
      cachePrefix = 'esHttp-',
      constants = {
        ES_USER_API: 'ES_USER_API',
        ES_SUBSCRIPTION_API: 'ES_SUBSCRIPTION_API',
        ES_USER_API_ENDPOINT: 'ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))',
        ANY_API_ENDPOINT: '([A-Z_]+)(?:[ ]+([a-z_][a-z0-9-_.ğĞ]*))?(?:[ ]+([0-9.]+))?(?:[ ]+([0-9a-f:]+))?(?:[ ]+([0-9]+))(?:\\/[^\\/]+)?',
        MAX_UPLOAD_BODY_SIZE: csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.maxUploadBodySize || 2097152 /*=2M*/
      },
      regexp = {
        IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
        URL: match('(www\\.|https?:\/\/(www\\.)?)[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)'),
        HASH_TAG: match('(?:^|[\t\n\r\s ])#([0-9_-\\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)'),
        USER_TAG: match('(?:^|[\t\n\r\s ])@('+BMA.constants.regexp.USER_ID+')'),
        ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT),
        API_ENDPOINT: exact(constants.ANY_API_ENDPOINT),
      },
      fallbackNodeIndex = 0,
      listeners,
      defaultSettingsNode,
      truncUrlFilter = $filter('truncUrl');

    that.data = {
      isFallback: false,
      token: null// Used to store pod authentication token
    };
    that.useCache = angular.isDefined(enableCache) ? enableCache : false; // need here because used in get() function
    that.raw = {
      getByPath: {},
      postByPath: {},
      wsByPath: {}
    };
    that.api = new Api(this, "esHttp");
    that.started = false;
    that.init = init;

    init(host, port, useSsl);

    function init(host, port, useSsl) {
      // Use settings as default
      if (!host && csSettings.data) {
        host = host || (csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null);
        port = port || (host ? csSettings.data.plugins.es.port : null);
        useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || csSettings.data.plugins.es.useSsl || forceUseSsl);
      }

      that.alive = false;
      that.host = host;
      that.port = port || ((useSsl || forceUseSsl) ? 443 : 80);
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || forceUseSsl);

      that.server = csHttp.getServer(host, port);
    }

    function isSameNodeAsSettings(data) {
      data = data || csSettings.data;
      if (!data.plugins || !data.plugins.es) return false;

      var host = data.plugins.es.host;
      var useSsl = data.plugins.es.port == 443 || data.plugins.es.useSsl || forceUseSsl;
      var port = data.plugins.es.port || (useSsl ? 443 : 80);

      return isSameNode(host, port, useSsl);
    }

    function isSameNode(host, port, useSsl) {
      return (that.host === host) &&
        (that.port === port) &&
        (angular.isUndefined(useSsl) || useSsl == that.useSsl);
    }

    // Say if the ES node is a fallback node or the configured node
    function isFallbackNode() {
      return that.data.isFallback;
    }

    // Set fallback flag (e.g. called by ES settings, when resetting settings)
    function setIsFallbackNode(isFallback) {
      that.data.isFallback = isFallback;
    }

    function exact(regexpContent) {
      return new RegExp('^' + regexpContent + '$');
    }
    function match(regexpContent) {
      return new RegExp(regexpContent);
    }

    function onSettingsReset(data, deferred) {
      deferred = deferred || $q.defer();

      if (that.data.isFallback) {
        // Force a restart
        if (that.started) {
          that.stop();
        }
      }

      // Reset to default values
      that.data.isFallback = false;
      defaultSettingsNode = null;

      deferred.resolve(data);
      return deferred.promise;
    }

    that.closeWs = function() {

      if (!that.raw) return;

      console.debug('[ES] [http] Closing all websockets...');
      _.keys(that.raw.wsByPath||{}).forEach(function(key) {
        var sock = that.raw.wsByPath[key];
        sock.close();
      });
      that.raw.wsByPath = {};
    };

    that.cleanCache = function() {
      console.debug("[ES] [http] Cleaning cache {prefix: '{0}'}...".format(cachePrefix));
      csCache.clear(cachePrefix);

      that.raw.getByPath = {};
      that.raw.postByPath = {};
      that.raw.wsByPath = {};
    };

    that.copy = function(otherNode) {
      if (that.started) that.stop();
      that.init(otherNode.host, otherNode.port, otherNode.useSsl || otherNode.port == 443);
      that.data.isTemporary = false; // reset temporary flag
      return that.start(true /*skipInit*/);
    };

    // Get node time (UTC) FIXME: get it from the node
    that.date = { now : csHttp.date.now };

    that.byteCount = function (s) {
      s = (typeof s == 'string') ? s : JSON.stringify(s);
      return encodeURI(s).split(/%(?:u[0-9A-F]{2})?[0-9A-F]{2}|./).length - 1;
    };

    that.getUrl  = function(path) {
      return csHttp.getUrl(that.host, that.port, path, that.useSsl);
    };

    that.get = function (path, cacheTime) {

      cacheTime = that.useCache && cacheTime;
      var requestKey = path + (cacheTime ? ('#'+cacheTime) : '');

      var getRequestFn = function(params) {
        if (!that.started) {
          if (!that._startPromise) {
            console.warn('[ES] [http] Trying to get [{0}] before start(). Waiting...'.format(path));
          }
          return that.ready().then(function(start) {
            if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
            return getRequestFn(params); // loop
          });
        }

        var request = that.raw.getByPath[requestKey];
        if (!request) {
          if (cacheTime) {
            request =  csHttp.getWithCache(that.host, that.port, path, that.useSsl, cacheTime, null, null, cachePrefix);
          }
          else {
            request =  csHttp.get(that.host, that.port, path, that.useSsl);
          }
          that.raw.getByPath[requestKey] = request;
        }
        return request(params);
      };

      return getRequestFn;
    };

    that.post = function(path) {
      var postRequest = function(obj, params, config) {
        // Add auth token
        if (that.data.token) {
          config = angular.merge({
            headers: {
              'Authorization': 'token ' + that.data.token
            }
          }, config);
        }
        if (!that.started) {
          if (!that._startPromise) {
            console.error('[ES] [http] Trying to post [{0}] before start()...'.format(path));
          }
          return that.ready().then(function(start) {
            if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
            return postRequest(obj, params, config); // loop
          });
        }

        var request = that.raw.postByPath[path];
        if (!request) {
          request =  csHttp.post(that.host, that.port, path, that.useSsl);
          that.raw.postByPath[path] = request;
        }
        return request(obj, params, config);
      };
      return postRequest;
    };

    that.ws = function(path) {
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
    };

    that.wsChanges = function(source) {
      var wsChanges = that.ws('/ws/_changes')();
      if (!source) return wsChanges;

      // If a source is given, send it just after connection open
      var _inheritedOpen = wsChanges.open;
      wsChanges.open = function() {
        return _inheritedOpen.call(wsChanges).then(function(sock) {
          if(sock) {
            sock.send(source);
          }
          else {
            console.warn('Trying to access ws changes, but no sock anymore... already open ?');
          }
        });
      };
      return wsChanges;
    };

    that.isAlive = function() {
      return csHttp.get(that.host, that.port, '/node/summary', that.useSsl)()
        .then(function(json) {
          var software = json && json.duniter && json.duniter.software || 'unknown';
          if (software === "cesium-plus-pod" || software === "duniter4j-elasticsearch") return true;
          console.error("[ES] [http] Not a Cesium+ Pod, but a {0} node. Please check '/node/summary'".format(software));
          return false;
        })
        .catch(function() {
          return false;
        });
    };

    // Alert user if node not reached - fix issue #
    that.checkNodeAlive = function(alive) {
      if (alive) {
        setIsFallbackNode(!isSameNodeAsSettings());
        return true;
      }
      if (angular.isUndefined(alive)) {
        return that.isAlive().then(that.checkNodeAlive);
      }

      var settings = csSettings.data.plugins && csSettings.data.plugins.es || {};

      // Remember the default node
      defaultSettingsNode = defaultSettingsNode || {
        host: settings.host,
        port: settings.port
      };

      var fallbackNode = settings.fallbackNodes && fallbackNodeIndex < settings.fallbackNodes.length && settings.fallbackNodes[fallbackNodeIndex++];
      if (!fallbackNode) {
        $translate('ERROR.ES_CONNECTION_ERROR', {server: that.server})
          .then(UIUtils.alert.info);
        return false; // stop the loop
      }
      var newServer = csHttp.getServer(fallbackNode.host, fallbackNode.port);
      UIUtils.loading.hide();
      return $translate('CONFIRM.ES_USE_FALLBACK_NODE', {old: that.server, new: newServer})
        .then(UIUtils.alert.confirm)
        .then(function (confirm) {
          if (!confirm) return false; // stop the loop

          that.cleanCache();

          that.init(fallbackNode.host, fallbackNode.port, fallbackNode.useSsl || fallbackNode.port == 443);

          // check is alive then loop
          return that.isAlive().then(that.checkNodeAlive);
        });
    };

    that.isStarted = function() {
      return that.started;
    };

    that.ready = function() {
      if (that.started) return $q.when(true);
      return that._startPromise || that.start();
    };

    that.start = function(skipInit) {
      if (that._startPromise) return that._startPromise;
      if (that.started) return $q.when(that.alive);

      console.debug('[ES] [http] Starting...');

      that._startPromise = csPlatform.ready()
        .then(function() {

          if (!skipInit) {
            // Init with defaults settings
            that.init();
          }
        })
        .then(function() {
          console.debug('[ES] [http] Starting on [{0}]{1}...'.format(
            that.server,
            (that.useSsl ? ' (SSL on)' : '')
          ));
          var now = Date.now();

          return that.checkNodeAlive()
            .then(function(alive) {
              that.alive = alive;
              if (!alive) {
                console.error('[ES] [http] Could not start [{0}]: node unreachable'.format(that.server));
                that.started = true;
                delete that._startPromise;
                fallbackNodeIndex = 0; // reset the fallback node counter
                return false;
              }

              // Add listeners
              addListeners();

              console.debug('[ES] [http] Started in '+(Date.now()-now)+'ms');
              that.api.node.raise.start();

              that.started = true;
              delete that._startPromise;
              fallbackNodeIndex = 0; // reset the fallback node counter


              return true;
            });
        });
      return that._startPromise;
    };

    that.stop = function() {
      if (!that.started && !that._startPromise) return $q.when(); // Skip multiple call

      console.debug('[ES] [http] Stopping...');

      removeListeners();

      setIsFallbackNode(false); // will be re-computed during start phase
      delete that._startPromise;
      if (that.alive) {
        that.closeWs();
        that.cleanCache();
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
      return $timeout(that.start, 200);
    };

    function parseTagsFromText(value, prefix) {
      prefix = prefix || '#';
      var reg = prefix === '@' ? regexp.USER_TAG : regexp.HASH_TAG;
      var matches = value && reg.exec(value);
      var tags = matches && [];
      while(matches) {
        var tag = matches[1];
        if (!_.contains(tags, tag)) {
          tags.push(tag);
        }
        value = value.substr(matches.index + matches[1].length + 1);
        matches = value.length > 0 && reg.exec(value);
      }
      return tags;
    }

    function parseUrlsFromText(value) {
      var matches = value && regexp.URL.exec(value);
      var urls = matches && [];
      while(matches) {
        var url = matches[0];
        if (!_.contains(urls, url)) {
          urls.push(url);
        }
        value = value.substr(matches.index + matches[0].length + 1);
        matches = value && regexp.URL.exec(value);
      }
      return urls;
    }

    function parseMarkdownTitlesFromText(value, prefix, suffix) {
      prefix = prefix || '##';
      var reg = match('(?:^|[\\r\\s])('+prefix+'([^#></]+)' + (suffix||'') + ')');
      var matches = value && reg.exec(value);
      var lines = matches && [];
      var res = matches && [];
      while(matches) {
        var line = matches[1];
        if (!_.contains(lines, line)) {
          lines.push(line);
          res.push({
            line: line,
            title: matches[2]
          });
        }
        value = value.substr(matches.index + matches[1].length + 1);
        matches = value.length > 0 && reg.exec(value);
      }
      return res;
    }


    function escape(text) {
      if (!text) return text;
      return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function parseAsHtml(text, options) {

      var content = text ? escape(text.trim()) : undefined;
      if (content) {
        options = options || {};
        options.tagState = options.tagState || 'app.wot_lookup.tab_search';
        options.uidState = options.uidState || 'app.wot_identity_uid';
        if (options.newLine || !angular.isDefined(options.newLine)) {
          content = content.replace(/\n/g, '<br>\n');
        }

        // Replace URL in description
        var urls = parseUrlsFromText(content);
        _.forEach(urls, function(url){
          // Make sure protocol is defined
          var href = (url.startsWith('http://') || url.startsWith('https://')) ? url : ('http://' + url);
          // Redirect URL to the function 'openLink', to open a new window if need (e.g. desktop app)
          var link = '<a on-tap=\"openLink($event, \'{0}\')\" href=\"{1}\" target="_blank">{2}</a>'.format(href, href, truncUrlFilter(url));
          content = content.replace(url, link);
        });

        // Replace hashtags
        var hashTags = parseTagsFromText(content);
        _.forEach(hashTags, function(tag){
          var link = '<a ui-sref=\"{0}({hash: \'{1}\'})\">#{2}</a>'.format(options.tagState, tag, tag);
          content = content.replace('#'+tag, link);
        });

        // Replace user tags
        var userTags = parseTagsFromText(content, '@');
        _.forEach(userTags, function(tag){
          var link = '<a ui-sref=\"{0}({uid: \'{1}\'})\">@{2}</a>'.format(options.uidState, tag, tag);
          content = content.replace('@'+tag, link);
        });

        // Replace markdown titles
        var titles = parseMarkdownTitlesFromText(content, '#+[ ]*', '<br>');
        _.forEach(titles, function(matches){
          var size = matches.line.lastIndexOf('#', 5)+1;
          content = content.replace(matches.line, '<h{0}>{1}</h{2}>'.format(size, matches.title, size));
        });
      }
      return content;
    }

    function fillRecordTags(record, fieldNames) {
      fieldNames = fieldNames || ['title', 'description'];

      record.tags = fieldNames.reduce(function(res, fieldName) {
        var value = record[fieldName];
        var tags = value && parseTagsFromText(value);
        return tags ? res.concat(tags) : res;
      }, []);
    }

    function findObjectInTree(obj, attrName) {
      if (!obj) return;
      if (obj[attrName]) return obj[attrName];
      if (Array.isArray(obj)) {
        return obj.reduce(function(res, item) {
          return res ? res : findObjectInTree(item, attrName);
        }, false);
      }
      else if (typeof obj == "object") {
        return _.reduce(_.keys(obj), function (res, key) {
          return res ? res : findObjectInTree(obj[key], attrName);
        }, false);
      }
    }

    function postRecord(path, options) {
      options = options || {};
      var postRequest = that.post(path);
      return function(record, params) {
        params = params || {};
        var wallet = params.wallet || (params.walletId && csWallet.children.get(params.walletId)) ||
          ((!params.pubkey || csWallet.isUserPubkey(params.pubkey)) && csWallet) ||
          (params.pubkey && csWallet.children.getByPubkey(params.pubkey));

        var keypair = params.keypair || wallet && wallet.data && wallet.data.keypair;

        if (!keypair && !wallet) {
          throw new Error('Missing wallet or keypair, to sign record');
        }

        // Create the POSt request params,
        // but BEFORE, remove protected options
        delete params.wallet;
        delete params.walletId;
        delete params.keypair;
        var postParams = angular.copy(params);
        postParams.pubkey = postParams.pubkey || wallet.data.pubkey;

        return (wallet.isAuth() ? $q.when(wallet.data) : wallet.auth({silent: true, minData: true}))
          .then(function() {
            if (params.creationTime && !record.creationTime) {
              record.creationTime = moment().utc().unix();
            }
            // Always update the time - fix #572
            // Make sure time is always > previous (required by ES node)
            var now = moment().utc().unix();
            record.time = (!record.time || record.time < now) ? now : (record.time+1);

            var obj = angular.copy(record);
            delete obj.signature;
            delete obj.hash;
            obj.issuer = postParams.pubkey; // force keypair pubkey
            if (!obj.version) {
              obj.version = 2;
            }

            // Fill tags
            if (options.tagFields) {
              fillRecordTags(obj, options.tagFields);
            }

            // Remove unused fields
            if (options.ignoreFields) {
              _.forEach(options.ignoreFields, function(key) {
                if (angular.isDefined(obj[key])) {
                  delete obj[key];
                }
              });
            }

            var str = JSON.stringify(obj);

            return CryptoUtils.util.hash(str)
              .then(function(hash) {
                return CryptoUtils.sign(hash, keypair)
                  .then(function(signature) {
                    // Prepend hash+signature
                    str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                    // Send data
                    return postRequest(str, postParams)
                      .then(function (id){

                        // Clear cache
                        csCache.clear(cachePrefix);

                        return id;
                      })
                      .catch(function(err) {
                        var bodyLength = that.byteCount(obj);
                        if (bodyLength > constants.MAX_UPLOAD_BODY_SIZE) {
                          throw {message: 'ERROR.ES_MAX_UPLOAD_BODY_SIZE', length: bodyLength};
                        }
                        throw err;
                      });
                  });
              });
          });
      };
    }

    function countRecords(index, type, cacheTime) {
      var getRequest = that.get("/{0}/{1}/_search?size=0".format(index, type), cacheTime);
      return function(params) {
        return getRequest(params)
            .then(function(res) {
              return res && res.hits && res.hits.total;
            });
      };
    }

    function removeRecord(index, type) {
      return function(id, options) {
        options = options || {};
        var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
        return (wallet.isAuth() ? $q.when(wallet.data) : wallet.auth({silent: true, minData: true}))
          .then(function(walletData) {

            var obj = {
              version: 2,
              index: index,
              type: type,
              id: id,
              issuer: walletData.pubkey,
              time: moment().utc().unix()
            };
            var str = JSON.stringify(obj);
            return CryptoUtils.util.hash(str)
              .then(function (hash) {
                return CryptoUtils.sign(hash, walletData.keypair)
                  .then(function (signature) {
                    // Prepend hash+signature
                    str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                    // Send data
                    return that.post('/history/delete')(str)
                      .then(function (id) {
                        return id;
                      });
                  });
              });
          });
      };
    }

    that.image = {};

    function imageFromAttachment(attachment) {
      if (!attachment || !attachment._content_type || !attachment._content || attachment._content.length === 0) {
        return null;
      }
      var image = {
        src: "data:" + attachment._content_type + ";base64," + attachment._content
      };
      if (attachment._title) {
        image.title = attachment._title;
      }
      if (attachment._name) {
        image.name = attachment._name;
      }
      return image;
    }

    function imageToAttachment(image) {
      if (!image || !image.src) return null;
      var match = regexp.IMAGE_SRC.exec(image.src);
      if (!match) return null;
      var attachment = {
        _content_type: match[1],
        _content: match[2]
      };
      if (image.title) {
        attachment._title = image.title;
      }
      if (image.name) {
        attachment._name = image.name;
      }
      return attachment;
    }

    /**
     * This will create a image (src, title, name) using the _content is present, or computing a image URL to the ES node
     * @param host
     * @param port
     * @param hit
     * @param imageField
     * @returns {{}}
     */
    that.image.fromHit = function(hit, imageField) {
      if (!hit || !hit._source) return;
      var attachment =  hit._source[imageField];
      if (!attachment || !attachment._content_type || !attachment._content_type.startsWith("image/")) return;
      var image = {};
      // If full content: then use it directly
      if (attachment._content) {
        image.src = "data:" + attachment._content_type + ";base64," + attachment._content;
      }
      // Compute an url
      else {
        var extension = attachment._content_type.substr(6);
        var path = [hit._index, hit._type, hit._id, '_image', imageField].join('/');
        path = '/' + path + '.' + extension;
        image.src = that.getUrl(path);
      }
      if (attachment._title) {
        image.title = attachment._title;
      }
      if (attachment._name) {
        image.name = attachment._name;
      }
      return image;
    };

    function parseEndPoint(endpoint) {
      var matches = regexp.API_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "api": matches[1] || '',
        "dns": matches[2] || '',
        "ipv4": matches[3] || '',
        "ipv6": matches[4] || '',
        "port": matches[5] || 80,
        "path": matches[6] || '',
        "useSsl": matches[5] == 443
      };
    }

    function emptyHit() {
      return {
        _id: null,
        _index: null,
        _type: null,
        _version: null,
        _source: {}
      };
    }

    // Get latest release, of Cesium+ pod
    function getLatestVersion() {
      var getRequest = that.raw.getLatestRelease;
      if (!getRequest) {
        var url = csHttp.uri.parse(csSettings.data.plugins.es.latestReleaseUrl);
        var useSsl = (url.port == 443 || url.protocol === 'https:' || forceUseSsl);
        getRequest = csHttp.getWithCache(url.host, url.port, "/" + url.pathname, useSsl, csCache.constants.LONG);
        that.raw.getLatestRelease = getRequest;
      }

      return getRequest()
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
    }

    function isAuth() {
      return that.data && !!that.data.token;
    }

    function auth(options) {
      options = options || {};
      console.info('[ES] Authenticate on server...');
      var nodePubkey = options.nodePubkey;
      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      return (wallet.isAuth() ? $q.when(wallet.data) : wallet.auth({silent: true, minData: true}))
        .then(function(walletData) {
          var keypair = options.keypair || walletData && walletData.keypair;
          if (!keypair && !wallet) {
            throw new Error('Missing wallet or keypair, to sign auth challenge');
          }
          // Get challenge
          return that.get('/auth')()
            .then(function(json) {
              var challenge = json && json.challenge;
              return $q.all([
                CryptoUtils.verify(json.challenge, json.signature, nodePubkey || json.pubkey),
                CryptoUtils.sign(challenge, keypair)
              ])
                .then(function(res) {
                  var signature = res[1];
                  return that.post('/auth')({challenge: challenge, signature: signature, pubkey: wallet.data.pubkey});
                })
                .then(function(token) {
                  console.info('[ES] Authentication to pod succeed. token: ' + token);
                  that.data.token = token;
                  return token;
                });
            });
        });
    }

    function logSearch(options) {
      if (!isAuth()) {
        return auth().then(function() {
            return logSearch(options);
          });
      }
      options = options || {};
      var request = {
        from: options.from || 0,
        size: options.size || 20,
        sort: options.sort || {time: 'desc'}
      };
      return that.post('/log/request/_search')(request)
        .then(function(res) {
          return _(res && res.hits && res.hits.hits || []).reduce(function(res, hit) {
            return res.concat(hit._source);
          }, []);
        });
    }

    function addListeners() {
      // Watch some service events
      listeners = [
        csSettings.api.data.on.reset($rootScope, onSettingsReset, that)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    // Define events
    that.api.registerEvent('node', 'start');
    that.api.registerEvent('node', 'stop');


    var exports = {
      getServer: csHttp.getServer,
      node: {
        summary: that.get('/node/summary'),
        moderators: that.get('/node/moderators'),
        parseEndPoint: parseEndPoint,
        same: isSameNode,
        sameAsSettings: isSameNodeAsSettings,
        isFallback: isFallbackNode,
        auth: auth
      },
      log: {
        request: {
          search: logSearch
        }
      },
      version: {
        latest: getLatestVersion
      },
      websocket: {
        changes: that.wsChanges,
        block: that.ws('/ws/block'),
        peer: that.ws('/ws/peer')
      },
      wot: {
        member: {
          uids : that.get('/wot/members')
        }
      },
      network: {
        peering: {
          self: that.get('/network/peering')
        },
        peers: that.get('/network/peers')
      },
      blockchain: {
        current: that.get('/blockchain/current?_source=number,hash,medianTime')
      },
      record: {
        post: postRecord,
        remove: removeRecord,
        count : countRecords
      },
      image: {
        fromAttachment: imageFromAttachment,
        toAttachment: imageToAttachment
      },
      hit: {
        empty: emptyHit
      },
      util: {
        parseTags: parseTagsFromText,
        parseAsHtml: parseAsHtml,
        findObjectInTree: findObjectInTree
      },
      constants: constants
    };
    exports.constants.regexp = regexp;
    angular.merge(that, exports);
  }


  // Default instance
  var service = new EsHttp(undefined, undefined, undefined, true);

  service.instance = function(host, port, useSsl, enableCache) {
    return new EsHttp(host, port, useSsl, enableCache);
  };

  service.lightInstance = function(host, port, useSsl, timeout) {
    port = port || 80;
    useSsl = angular.isDefined(useSsl) ? useSsl : (+port === 443);

    function countHits(path, params) {
      return csHttp.get(host, port, path)(params)
        .then(function(res) {
          return res && res.hits && res.hits.total;
        });
    }

    function countRecords(index, type) {
      return countHits("/{0}/{1}/_search?size=0".format(index, type));
    }

    function countSubscriptions(params) {
      var queryString = _.keys(params||{}).reduce(function(res, key) {
        return (res && (res + " AND ") || "") + key + ":" + params[key];
      }, '');
      return countHits("/subscription/record/_search?size=0&q=" + queryString);
    }

    return {
      host: host,
      port: port,
      useSsl: useSsl,
      node: {
        summary: csHttp.getWithCache(host, port, '/node/summary', useSsl, csHttp.cache.LONG, false, timeout),
        moderators: csHttp.get(host, port, '/node/moderators', useSsl, timeout)
      },
      network: {
        peering: {
          self: csHttp.get(host, port, '/network/peering', useSsl, timeout)
        },
        peers: csHttp.get(host, port, '/network/peers', useSsl, timeout)
      },
      blockchain: {
        current: csHttp.get(host, port, '/blockchain/current?_source=number,hash,medianTime', useSsl, timeout)
      },
      record: {
        count: countRecords
      },
      subscription: {
        count: countSubscriptions
      }
    };
  };

  return service;
})
;
