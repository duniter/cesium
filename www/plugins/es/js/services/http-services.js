angular.module('cesium.es.http.services', ['ngResource', 'cesium.services', 'cesium.config'])

/**
 * Elastic Search Http
 */
.factory('esHttp', function($q, CryptoUtils, HttpUtils, $rootScope, csConfig, Wallet) {
  'ngInject';

  function esHttp(server) {

    var enable = !!server;
    if (enable && Wallet.data && Wallet.data.settings && Wallet.data.settings.plugins && Wallet.data.settings.plugins.es) {
      enable = Wallet.data.settings.plugins.es.enable;
    }

    function copy(otherNode) {
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }

    // Get time (UTC)
    function getTimeNow() {
       // TODO : use the block chain time
       return Math.floor(moment().utc().valueOf() / 1000);
    }

    function get(path) {
      return HttpUtils.get('http://' + server + path);
    }

    function post(path) {
      return HttpUtils.post('http://' + server + path);
    }

    function postRecord(uri) {
      var postRequest = HttpUtils.post('http://' + server + uri);

      return function(record, params) {
        return $q(function(resolve, reject) {
          if (!Wallet.isLogin()) {
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
          if (!Wallet.isLogin()) {
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

    function isEnable() {
      return enable;
    }

    function setEnable(value) {
      enable = value;
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
      isEnable: isEnable,
      setEnable: setEnable,
      copy: copy,
      get: get,
      post: post,
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

  var service = esHttp(csConfig.DUNITER_NODE_ES);
  service.instance = esHttp;
  return service;
})
;
