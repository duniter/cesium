angular.module('cesium.es.http.services', ['ngResource', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, CryptoUtils, csHttp, $rootScope, $state, $sce, csConfig, csSettings, csWallet) {
  'ngInject';

  function factory() {

    var
      that,
      regex = {
        IMAGE_SRC: exact('data:([A-Za-z//]+);base64,(.+)'),
        HASH_TAG: new RegExp('#([\\wḡĞğ]+)'),
        USER_TAG: new RegExp('@(\\w+)')
      };


    function exact(regexpContent) {
      return new RegExp('^' + regexpContent + '$');
    }

    // Get time (UTC)
    function getTimeNow() {
       // TODO : use the block chain time
       return Math.floor(moment().utc().valueOf() / 1000);
    }

    function get(host, node, path) {
      return csHttp.get(host, node, path);
    }

    function post(host, node, path) {
      return csHttp.post(host, node, path);
    }

    function parseTagsFromText(value, prefix) {
      prefix = prefix || '#';
      var reg = prefix === '@' ? regex.USER_TAG : regex.HASH_TAG;
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

    function postRecord(host, node, path) {
      var that = this;
      that.raw = that.raw || {};
      that.raw.post = that.raw.post || {};
      that.raw.post[path] = csHttp.post(host, node, path);

      return function(record, params) {
        if (!csWallet.isLogin()) {
          var deferred = $q.defer();
          deferred.reject('Wallet must be login before sending record to ES node');
          return deferred.promise;
        }

        if (!record.time) {
          record.time = getTimeNow();
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
                return that.raw.post[path](obj, params)
                  .then(function (id){
                    return id;
                  });
              });
            });
      };
    }

    function removeRecord(host, node, index, type) {
      var that = this;
      that.raw = that.raw || {};
      that.raw.delete = csHttp.post(host, node, '/history/delete');

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
          time: getTimeNow()
        };
        var str = JSON.stringify(obj);
        return CryptoUtils.util.hash(str)
          .then(function(hash) {
            return CryptoUtils.sign(str, keypair)
              .then(function(signature) {
                obj.hash = hash;
                obj.signature = signature;
                return that.raw.delete(obj)
                  .then(function (id){
                    return id;
                  });
              });
          });
      };
    }

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
      var match = regex.IMAGE_SRC.exec(image.src);
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
    function imageFromHit(host, port, hit, imageField) {
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
        image.src = csHttp.getUrl(host, port, path);
      }
      if (attachment._title) {
        image.title = attachment._title;
      }
      if (attachment._name) {
        image.name = attachment._name;
      }
      return image;
    }

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

    function emptyHit() {
      return {
         _id: null,
         _index: null,
         _type: null,
         _version: null,
         _source: {}
      };
    }

    that = {
      get: get,
      post: post,
      getUrl : csHttp.getUrl,
      getServer: csHttp.getServer,
      ws: csHttp.ws,
      record: {
        post: postRecord,
        remove: removeRecord
      },
      image: {
        fromHit : imageFromHit,
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
      date: {
        now: getTimeNow
      },
      constants: {
        regexp: regex
      }
    };
    return that;
  }

  var service = factory();
  return service;
})
;
