angular.module('cesium.es.http.services', ['ngResource', 'ngApi', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, $timeout, $rootScope, $state, $sce, CryptoUtils, csHttp, csConfig, csSettings, BMA, csWallet, csPlatform, Api) {
  'ngInject';

  function Factory(host, port, wsPort, useSsl) {

    var
      that = this,
      constants = {
        ES_USER_API_ENDPOINT: 'ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))'
      },
      regexp = {
        IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
        HASH_TAG: match('#([\\wḡĞğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+)'),
        USER_TAG: match('@('+BMA.constants.regexp.USER_ID+')'),
        ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT)
      };

    that.cache = _emptyCache();
    that.api = new Api(this, "esHttp");
    that.init = init;

    init(host, port, wsPort, useSsl);

    function init(host, port, wsPort, useSsl) {
      // Use settings as default
      if (csSettings.data) {
        host = host || (csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null);
        port = port || (host ? csSettings.data.plugins.es.port : null);
        wsPort = wsPort || (host ? csSettings.data.plugins.es.wsPort : null);
      }

      that.alive = false;
      that.host = host;
      that.port = port || 80;
      that.wsPort = wsPort || port || 80;
      that.useSsl = angular.isDefined(useSsl) ? useSsl : false;
      that.server = csHttp.getServer(host, port);
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

    that.cleanCache = function() {
      console.debug('[ES] [http] Cleaning requests cache...');
      _.keys(that.cache.wsByPath).forEach(function(key) {
        var sock = that.cache.wsByPath[key];
        sock.close();
      });
      that.cache = _emptyCache();
    };

    that.copy = function(otherNode) {
      that.init(otherNode.host, otherNode.port, otherNode.wsPort, otherNode.useSsl);
      return that.restart();
    };

    // Get time (UTC)
    that.date = { now : csHttp.date.now };

    that.getUrl  = function(path) {
      return csHttp.getUrl(that.host, that.port, path, that.useSsl);
    };

    that.get = function (path) {
      return function(params) {
        var request = that.cache.getByPath[path];
        if (!request) {
          request =  csHttp.get(that.host, that.port, path, that.useSsl);
          that.cache.getByPath[path] = request;
        }
        return request(params);
      };
    };

    that.post = function(path) {
      return function(obj, params) {
        var request = that.cache.postByPath[path];
        if (!request) {
          request =  csHttp.post(that.host, that.port, path, that.useSsl);
        that.cache.postByPath[path] = request;
        }
        return request(obj, params);
      };
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
      return that.node.summary()
        .then(function(json) {
          return json && json.duniter && json.duniter.software == 'duniter4j-elasticsearch';
        })
        .catch(function() {
          return false;
        });
    };

    that.start = function() {

      return csPlatform.ready()
        .then(that.init)
        .then(function() {
          console.debug('[ES] [http] Starting on [{0}]...'.format(that.server));
          var now = new Date().getTime();
          return that.isAlive()
            .then(function(alive) {
              that.alive = alive;
              if (!alive) {
                console.error('[ES] [http] Could not start [{0}]: node unreachable'.format(that.server));
                return false;
              }
              console.debug('[ES] [http] Started in '+(new Date().getTime()-now)+'ms');
              that.api.node.raise.start();
              return true;
            });
        });
    };

    that.stop = function() {
      console.debug('[ES] [http] Stopping...');
      that.alive = false;
      that.cleanCache();
      that.api.node.raise.stop();
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
        matches = value && reg.exec(value);
      }
      return tags;
    }

    function escape(text) {
      if (!text) return text;
      return text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function trustAsHtml(text) {
      var content = text ? escape(text.trim()).replace(/\n/g,'<br>') : undefined;
      if (content) {

        // Replace hashtags in description
        var hashTags = parseTagsFromText(content);
        _.forEach(hashTags, function(tag){
          var href = $state.href('app.wot_lookup', {hash: tag});
          var link = '<a href=\"{0}">{1}</a>'.format(href, '#'+tag);
          content = content.replace('#'+tag, link);
        });

        // Replace user tags in description
        var userTags = parseTagsFromText(content, '@');
        _.forEach(userTags, function(tag){
          var href = $state.href('app.wot_identity_uid', {uid: tag});
          var link = '<a href=\"{0}">{1}</a>'.format(href, '@'+tag);
          content = content.replace('@'+tag, link);
        });

        $sce.trustAsHtml(content);
      }
      return content;
    }

    function fillRecordTags(record, fieldNames) {
      fieldNames = fieldNames || ['title', 'description'];

      _.forEach(fieldNames, function(fieldName) {
        var value = record[fieldName];
        record.tags = parseTagsFromText(value);
      });
    }

    function postRecord(path) {
      var postRequest = that.post(path);
      return function(record, params) {
        if (!csWallet.isLogin()) {
          var deferred = $q.defer();
          deferred.reject('Wallet must be login before sending record to ES node');
          return deferred.promise;
        }

        if (!record.time) {
          record.time = that.date.now();
        }
        var keypair = $rootScope.walletData.keypair;
        var obj = {};
        angular.copy(record, obj);
        delete obj.signature;
        delete obj.hash;
        obj.issuer = $rootScope.walletData.pubkey;

        // Fill tags
        fillRecordTags(obj);

        var str = JSON.stringify(obj);

        return CryptoUtils.util.hash(str)
          .then(function(hash) {
            return CryptoUtils.sign(str, keypair)
              .then(function(signature) {
                obj.hash = hash;
                obj.signature = signature;
                return postRequest(obj, params)
                  .then(function (id){
                    return id;
                  });
              });
            });
      };
    }

    function removeRecord(index, type) {
      return function(id) {
        if (!csWallet.isLogin()) {
          var deferred = $q.defer();
          deferred.reject('Wallet must be login before sending record to ES node');
          return deferred.promise;
        }

        var keypair = $rootScope.walletData.keypair;
        var obj = {
          index: index,
          type: type,
          id: id,
          issuer: $rootScope.walletData.pubkey,
          time: that.date.now()
        };
        var str = JSON.stringify(obj);
        return CryptoUtils.util.hash(str)
          .then(function(hash) {
            return CryptoUtils.sign(str, keypair)
              .then(function(signature) {
                obj.hash = hash;
                obj.signature = signature;
                return that.post('/history/delete')(obj)
                  .then(function (id){
                    return id;
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

    function login(host, node, keypair) {
      return $q(function(resolve, reject) {
        var errorFct = function(err) {
          reject(err);
        };
        var getChallenge = getResource(host, node, '/auth');
        var postAuth = postResource(host, node, '/auth');

        getChallenge() // get the challenge phrase to sign
        .then(function(challenge) {
          CryptoUtils.sign(challenge, keypair) // sign the challenge
          .then(function(signature) {
            var pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            postAuth({
              pubkey: pubkey,
              challenge: challenge,
              signature: signature
            }) // get token
            .then(function(token) {
              /*var authdata = CryptoUtils.util.encode_base64(pubkey + ':' + token);
              $rootScope.globals = {
                  currentUser: {
                      username: pubkey,
                      authdata: token
                  }
              };
              $http.defaults.headers.common['Authorization'] = 'Basic ' + token; // jshint ignore:line
              $cookies.put('globals', $rootScope.globals);
              resolve(token);*/
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        })
        .catch(errorFct);
      });
    }

    function logout(host, node) {
        /*$rootScope.globals = {};
        $cookie.remove('globals');
        $http.defaults.headers.common.Authorization = 'Basic ';*/
    }

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

    that.api.registerEvent('node', 'start');
    that.api.registerEvent('node', 'stop');

    var exports = {
      getServer: csHttp.getServer,
      node: {
        summary: that.get('/node/summary'),
        parseEndPoint: parseEndPoint
      },
      record: {
        post: postRecord,
        remove: removeRecord
      },
      image: {
        fromAttachment: imageFromAttachment,
        toAttachment: imageToAttachment
      },
      auth: {
        login: login,
        logout: logout
      },
      hit: {
        empty: emptyHit
      },
      util: {
        parseTags: parseTagsFromText,
        trustAsHtml: trustAsHtml
      },
      constants: constants
    };
    exports.constants.regexp = regexp;
    angular.merge(that, exports);
  }


  var service = new Factory();

  service.instance = function(host, port, wsPort) {
    return new Factory(host, port, wsPort);
  };

  return service;
})
;
