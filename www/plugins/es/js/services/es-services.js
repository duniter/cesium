angular.module('cesium.es.services', ['ngResource', 'cesium.services', 'cesium.config'])

.factory('ESUtils', function($q, CryptoUtils, HttpUtils, $rootScope, APP_CONFIG) {
  'ngInject';

  function ESUtils(server) {

    // Get time (UTC)
    function getTimeNow() {
       // TODO : use the block chain time
       return Math.floor(moment().utc().valueOf() / 1000);
    }

    function postRecord(uri) {
      var postRequest = HttpUtils.post(uri);

      return function(record, params) {
        return $q(function(resolve, reject) {
          if (!$rootScope.isLogged()) {
            reject('Wallet must be login before sending record to ES node'); return;
          }
          var errorFct = function(err) {
            reject(err);
          };
          if (!record.time) {
            record.time = getTimeNow();
          }
          var keypair = $rootScope.walletData.keypair;
          var obj = {};
          angular.copy(record, obj);
          delete obj.signature;
          delete obj.hash;
          obj.issuer = $rootScope.walletData.pubkey;
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
      };
    }

    function removeRecord(index, type) {
      var postHistoryDelete = HttpUtils.post('http://' + server + '/history/delete');
      return function(id) {
        return $q(function(resolve, reject) {
          if (!$rootScope.isLogged()) {
            reject('Wallet must be login before sending record to ES node'); return;
          }
          var errorFct = function(err) {
            reject(err);
          };
          var keypair = $rootScope.walletData.keypair;
          var obj = {
            index: index,
            type: type,
            id: id,
            issuer: $rootScope.walletData.pubkey,
            time: getTimeNow()
          };
          var str = JSON.stringify(obj);
          CryptoUtils.util.hash(str)
          .then(function(hash) {
            CryptoUtils.sign(str, keypair)
            .then(function(signature) {
              obj.hash = hash;
              obj.signature = signature;
              postHistoryDelete(obj)
              .then(function (id){
                resolve(id);
              })
              .catch(errorFct);
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        });
      };
    }


    function login(keypair) {
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
              $cookies.put('globals', $rootScope.globals);*/
              resolve(token);
            })
            .catch(errorFct);
          })
          .catch(errorFct);
        })
        .catch(errorFct);
      });
    }

    function logout() {
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

    return {
      get: HttpUtils.get,
      post: HttpUtils.post,
      record: {
        post: postRecord,
        remove: removeRecord
      },
      auth: {
          login: login,
          logout: logout
      },
      hit: {
         empty: emptyHit
      },
      date: {
        now: getTimeNow
      }
    };
  }

  var enable = !!APP_CONFIG.DUNITER_NODE_ES;
  if (!enable) {
    return null;
  }
  var service = ESUtils(APP_CONFIG.DUNITER_NODE_ES);
  service.instance = ESUtils;
  return service;
})
;
