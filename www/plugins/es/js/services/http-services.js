angular.module('cesium.es.http.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, $timeout, $rootScope, $state, $sce, $translate, $window, $filter,
                            CryptoUtils, UIUtils, csHttp, csConfig, csSettings, BMA, csWallet, csPlatform, Api) {
  'ngInject';

  // Allow to force SSL connection with port different from 443
  var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
  ($window.location && $window.location.protocol === 'https:') ? true : false;
  if (forceUseSsl) {
    console.debug('[ES] [https] Enable SSL (forced by config or detected in URL)');
  }

  function Factory(host, port, wsPort, useSsl) {

    var
      that = this,
      constants = {
        ES_USER_API_ENDPOINT: 'ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))'
      },
      regexp = {
        IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
        URL: match('(www\\.|https?:\/\/(www\\.)?)[-a-zA-Z0-9@:%._\\+~#=]{2,256}\\.[a-z]{2,6}\\b([-a-zA-Z0-9@:%_\\+.~#?&//=]*)'),
        HASH_TAG: match('(?:^|[\t\n\r\s ])#([\\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)'),
        USER_TAG: match('(?:^|[\t\n\r\s ])@('+BMA.constants.regexp.USER_ID+')'),
        ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT)
      },
      fallbackNodeIndex = 0,
      listeners,
      defaultSettingsNode,
      truncUrlFilter = $filter('truncUrl');

    that.data = {
      isFallback: false
    };
    that.cache = _emptyCache();
    that.api = new Api(this, "esHttp");
    that.started = false;
    that.init = init;

    init(host, port, wsPort, useSsl);

    function init(host, port, wsPort, useSsl) {
      // Use settings as default
      if (!host && csSettings.data) {
        host = host || (csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null);
        port = port || (host ? csSettings.data.plugins.es.port : null);
        wsPort = wsPort || (host ? csSettings.data.plugins.es.wsPort : null);
        useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443 || csSettings.data.plugins.es.useSsl || forceUseSsl);
      }

      that.alive = false;
      that.host = host;
      that.port = port || ((useSsl || forceUseSsl) ? 443 : 80);
      that.wsPort = wsPort || that.port;
      that.useSsl = angular.isDefined(useSsl) ? useSsl : (that.port == 443 || forceUseSsl);
      that.server = csHttp.getServer(host, port);
    }

    function isSameNodeAsSettings(data) {
      data = data || csSettings.data;
      if (!data.plugins || !data.plugins.es) return false;

      var host = data.plugins.es.host;
      var useSsl = data.plugins.es.port == 443 || data.plugins.es.useSsl || forceUseSsl;
      var port = data.plugins.es.port || (useSsl ? 443 : 80);
      var wsPort = data.plugins.es.wsPort || port;

      return isSameNode(host, port, wsPort, useSsl);
    }

    function isSameNode(host, port, wsPort, useSsl) {
      return (that.host == host) &&
        (that.port == port) &&
        (!wsPort || that.wsPort == wsPort) &&
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

    function _emptyCache() {
      return {
        getByPath: {},
        postByPath: {},
        wsByPath: {}
      };
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

    that.cleanCache = function() {
      console.debug('[ES] [http] Cleaning requests cache...');
      _.keys(that.cache.wsByPath).forEach(function(key) {
        var sock = that.cache.wsByPath[key];
        sock.close();
      });
      that.cache = _emptyCache();
    };

    that.copy = function(otherNode) {
      if (that.started) that.stop();
      that.init(otherNode.host, otherNode.port, otherNode.wsPort, otherNode.useSsl || otherNode.port == 443);
      that.data.isTemporary = false; // reset temporary flag
      return that.start(true /*skipInit*/);
    };



    // Get time (UTC)
    that.date = { now : csHttp.date.now };

    that.getUrl  = function(path) {
      return csHttp.getUrl(that.host, that.port, path, that.useSsl);
    };

    that.get = function (path) {

      var getRequest = function(params) {
        if (!that.started) {
          if (!that._startPromise) {
            console.error('[ES] [http] Trying to get [{0}] before start()...'.format(path));
          }
          return that.ready().then(function(start) {
            if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
            return getRequest(params); // loop
          });
        }

        var request = that.cache.getByPath[path];
        if (!request) {
          request =  csHttp.get(that.host, that.port, path, that.useSsl);
          that.cache.getByPath[path] = request;
        }
        return request(params);
      };

      return getRequest;
    };

    that.post = function(path) {
      var postRequest = function(obj, params) {
        if (!that.started) {
          if (!that._startPromise) {
            console.error('[ES] [http] Trying to post [{0}] before start()...'.format(path));
          }
          return that.ready().then(function(start) {
            if (!start) return $q.reject('ERROR.ES_CONNECTION_ERROR');
            return postRequest(obj, params); // loop
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

    that.ws = function(path) {
      return function() {
        var sock = that.cache.wsByPath[path];
        if (!sock) {
          sock =  csHttp.ws(that.host, that.wsPort, path, that.useSsl);
          that.cache.wsByPath[path] = sock;
        }
        return sock;
      };
    };

    that.isAlive = function() {
      return csHttp.get(that.host, that.port, '/node/summary', that.useSsl)()
        .then(function(json) {
          var software = json && json.duniter && json.duniter.software || 'unknown';
          if (software == 'duniter4j-elasticsearch') return true;
          console.error("[ES] [http] Not a Duniter4j ES node, but a {0} node".format(software));
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
        port: settings.port,
        wsPort: settings.wsPort
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

          that.init(fallbackNode.host, fallbackNode.port, fallbackNode.wsPort, fallbackNode.useSsl || fallbackNode.port == 443);

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
          var now = new Date().getTime();

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

              console.debug('[ES] [http] Started in '+(new Date().getTime()-now)+'ms');
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
      console.debug('[ES] [http] Stopping...');

      removeListeners();

      setIsFallbackNode(false); // will be re-computed during start phase
      delete that._startPromise;
      if (that.alive) {
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
      var tags;
      while(matches) {
        var tag = matches[1];
        tags = tags || [];
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
      var urls;
      while(matches) {
        var url = matches[0];
        urls = urls || [];
        if (!_.contains(urls, url)) {
          urls.push(url);
        }
        value = value.substr(matches.index + matches[0].length + 1);
        matches = value && regexp.URL.exec(value);
      }
      return urls;
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
          // Redirect URL to the function 'openLink', to open a new window if need (e.g. desktop app)
          var link = '<a on-tap=\"openLink($event, \'{0}\')\" href=\"{1}\" target="_blank">{2}</a>'.format(url, url, truncUrlFilter(url));
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
        _.forEach(userTags, function(uid){
          var link = '<a ui-sref=\"{0}({uid: \'{1}\'})\">@{2}</a>'.format(options.uidState, uid, uid);
          content = content.replace('@'+uid, link);
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

        var wallet = (params && params.wallet || csWallet);
        params = params || {};
        params.pubkey = params.pubkey || wallet.data.pubkey;
        var keypair = params.keypair || wallet.data.keypair;
        // make sure to hide some params
        if (params) {
          delete params.wallet;
          delete params.keypair;
        }
        return (wallet.isAuth() ? $q.when(wallet.data) : wallet.auth({silent: true, minData: true}))
          .then(function() {
            if (options.creationTime && !record.creationTime) {
              record.creationTime = that.date.now();
            }
            // Always update the time - fix #572
            // Make sure time is always > previous (required by ES node)
            var now = that.date.now();
            record.time = (!record.time || record.time < now) ? now : (record.time+1);

            var obj = angular.copy(record);
            delete obj.signature;
            delete obj.hash;
            obj.issuer = params.pubkey; // force keypair pubkey
            if (!obj.version) {
              obj.version = 2;
            }

            // Fill tags
            if (options.tagFields) {
              fillRecordTags(obj, options.tagFields);
            }

            //console.debug("Will send obj: ", obj);
            var str = JSON.stringify(obj);

            return CryptoUtils.util.hash(str)
              .then(function(hash) {
                return CryptoUtils.sign(hash, keypair)
                  .then(function(signature) {
                    // Prepend hash+signature
                    str = '{"hash":"{0}","signature":"{1}",'.format(hash, signature) + str.substring(1);
                    // Send data
                    return postRequest(str, params)
                      .then(function (id){
                        return id;
                      });
                  });
              });
          });
      };
    }

    function removeRecord(index, type) {
      return function(id, options) {
        options = options || {};
        var wallet = (options && options.wallet || csWallet);
        delete options.wallet;
        return (wallet.isAuth() ? $q.when(wallet.data) : wallet.auth({silent: true, minData: true}))
          .then(function(walletData) {

            var obj = {
              version: 2,
              index: index,
              type: type,
              id: id,
              issuer: walletData.pubkey,
              time: that.date.now()
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
      var matches = regexp.ES_USER_API_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80
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
        parseEndPoint: parseEndPoint,
        same: isSameNode,
        sameAsSettings: isSameNodeAsSettings,
        isFallback: isFallbackNode
      },
      record: {
        post: postRecord,
        remove: removeRecord
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


  var service = new Factory();

  service.instance = function(host, port, wsPort, useSsl) {
    return new Factory(host, port, wsPort, useSsl);
  };

  return service;
})
;
