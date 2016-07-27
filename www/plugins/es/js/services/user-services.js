angular.module('cesium.user.services', ['ngResource', 'cesium.services'])

.factory('UserService', function($http, $q, CryptoUtils, APP_CONFIG) {
  'ngInject';

    function UserService(server) {

      var
      regex = {
        HTTP_URI: "https?://([a-zA-Z0-9-.]+.[a-zA-Z0-9-_:.]+)/[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
        socials: {
          facebook: "(fb.me)|((www.)?facebook.com)",
          twitter: "(www.)?twitter.com",
          googleplus: "plus.google.com(/u)?",
          youtube: "(www.)?youtube.com",
          github: "(www.)?github.com"
        }
      }
      ;

      function exact(regexpContent) {
        return new RegExp("^" + regexpContent + "$");
      }
      regex.HTTP_URI = exact(regex.HTTP_URI);
      _.keys(regex.socials).forEach(function(key){
        regex.socials[key] = exact(regex.socials[key]);
      })

      function processError(reject, data) {
        if (data && data.message) {
          reject(data);
        }
        else if (data && !data.found) {
          reject({ucode: 404, message: 'Not found'});
        }
        else {
          reject('Unknown error from Duniter node');
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
              timeout: 4000
            };

            prepare(uri, params, config, function(uri, config) {
                $http.get(uri, config)
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

      function postResource(uri) {
        return function(data, params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000,
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
        var sock = new WebSocket(uri);
        return {
          on: function(type, callback) {
            sock.onmessage = function(e) {
              callback(JSON.parse(e.data));
            };
          }
        };
      }

      function getToken(keypair) {
        return $q(function(resolve, reject) {
          var errorFct = function(err) {
            reject(err);
          };
          var getChallenge = getResource('http://' + server + '/auth');
          var postAuth = postResource('http://' + server + '/auth');

          getChallenge() // get the challenge phrase to sign
          .then(function(challenge) {
            CryptoUtils.sign(challenge, keypair) // sign the challenge
            .then(function(signature) {
              postAuth({
                pubkey: CryptoUtils.util.encode_base58(keypair.signPk),
                challenge: challenge,
                signature: signature
              }) // get token
              .then(function(token) {
                resolve(token);
              })
              .catch(errorFct);
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        });
      }

      var addProfileRequest = postResource('http://' + server + '/user/profile');
      var updateProfileRequest = postResource('http://' + server + '/user/profile/:pubkey');

      function sendProfile(profile, keypair, postRequest, params) {
        return $q(function(resolve, reject) {
          var errorFct = function(err) {
            reject(err);
          };
          var obj = {};
          angular.copy(profile, obj);
          delete obj.signature;
          delete obj.hash;
          obj.issuer = CryptoUtils.util.encode_base58(keypair.signPk);
          var str = JSON.stringify(obj);

          CryptoUtils.util.hash(str)
          .then(function(hash) {
            CryptoUtils.sign(str, keypair)
            .then(function(signature) {
              obj.hash = hash;
              obj.signature = signature;
              postRequest(obj, params)
              .then(function (id){
                resolve(id);
              })
              .catch(errorFct);
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        });
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

      function addProfile(record, keypair) {
        return sendProfile(record, keypair, addProfileRequest);
      }

      function updateProfile(record, params, keypair) {
        return sendProfile(record, keypair, updateProfileRequest, params);
      }

      function getSocialTypeFromUrl(url){
        var type = 'rss'; // default type
        if (regex.HTTP_URI.test(url)) {
          var server = regex.HTTP_URI.exec(url)[1];
          console.log("match http URL, with server :" + server);
          _.keys(regex.socials).forEach(function(key){
            if (regex.socials[key].test(server)) {
              type = key;
              console.log("match type: " + key);
              return false; // stop
            }
          });
        }
        return type;
      }

      return {
        auth: {
            get: getResource('http://' + server + '/auth'),
            post: postResource('http://' + server + '/auth'),
            token: getToken
        },
        hit: {
           empty: emptyHit
        },
        profile: {
          get: getResource('http://' + server + '/user/profile/:pubkey'),
          add: addProfile,
          update: updateProfile,
          avatar: getResource('http://' + server + '/user/profile/:pubkey?_source=avatar')
        },
        util: {
          social: {
            getType: getSocialTypeFromUrl
          }
        }
      };
    }

    var ESNodeConfigured = !!APP_CONFIG.DUNITER_NODE_ES;
    if (!ESNodeConfigured) {
      return null;
    }

    var service = UserService(APP_CONFIG.DUNITER_NODE_ES);
    service.instance = UserService;

  return service;
})
;
