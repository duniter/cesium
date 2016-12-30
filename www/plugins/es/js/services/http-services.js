angular.module('cesium.es.http.services', ['ngResource', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, CryptoUtils, csHttp, $rootScope, csConfig, csSettings, csWallet) {
  'ngInject';

  function factory() {

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

    function postRecord(host, node, path) {
      var postRequest = csHttp.post(host, node, path);

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

    function removeRecord(host, node, index, type) {
      var postHistoryDelete = csHttp.post(host, node, '/history/delete');
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
                return postHistoryDelete(obj)
                  .then(function (id){
                    return id;
                  });
              });
          });
      };
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

    return {
      copy: copy,
      get: get,
      post: post,
      getUrl : csHttp.getUrl,
      getServer: csHttp.getServer,
      ws: csHttp.ws,
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

  var service = factory();
  return service;
})
;
