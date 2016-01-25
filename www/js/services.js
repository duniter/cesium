var scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.services', ['ngResource'])

.factory('BMA', function($http, $q) {

    function BMA(server) {

      function getResource(uri) {
        return function(params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000
            }, suffix = '', pkeys = [], queryParams = {};
            if (typeof params == 'object') {
              pkeys = _.keys(params);
            }
            pkeys.forEach(function(pkey){
              var prevURI = uri;
              uri = uri.replace(new RegExp(':' + pkey), params[pkey]);
              if (prevURI == uri) {
                queryParams[pkey] = params[pkey];
              }
            });
            config.params = queryParams;
            $http.get(uri + suffix, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                reject(data);
              });
          });
        }
      }

      return {
        wot: {
          lookup: getResource('http://' + server + '/wot/lookup/:search'),
          members: getResource('http://' + server + '/wot/members')
        },
        network: {
          peering: {
            peers: getResource('http://' + server + '/network/peering/peers')
          },
          peers: getResource('http://' + server + '/network/peers')
        },
        currency: {
          parameters: getResource('http://' + server + '/blockchain/parameters')
        },
        blockchain: {
          current: getResource('http://' + server + '/blockchain/current'),
          block: getResource('http://' + server + '/blockchain/block/:block'),
          stats: {
            ud: getResource('http://' + server + '/blockchain/with/ud'),
            tx: getResource('http://' + server + '/blockchain/with/tx')
          }
        },
        websocket: {
          block: function() {
            return io('http://' + server + '/websocket/block');
          },
          peer: function() {
            return io('http://' + server + '/websocket/peer');
          }
        }
      }
    }
    var service = BMA('metab.ucoin.fr');
    service.instance = BMA;
  return service;
})

.factory('UIUtils', function($ionicLoading, $ionicPopup) {
    return {
      alert: {
        error: function(err, subtitle) {
          var message = err.message || err;
          return $ionicPopup.show({
            template: '<p>' + (message || 'Unknown error') + '</p>',
            title: 'Application error',
            subTitle: subtitle,
            buttons: [
              {
                text: '<b>OK</b>',
                type: 'button-assertive'
              }
            ]
          });
        }
      },
      loading: {
        show: function() {
          $ionicLoading.show({
            template: 'Loading...'
          });
        },
        hide: function(){
          $ionicLoading.hide();
        }
      }
    };
})

.factory('CryptoUtils', function($q, $timeout) {

    var async_load_scrypt = function() {
        if (typeof module !== 'undefined' && module.exports) {
            // add node.js implementations
            require('scrypt-em');
            return scrypt_module_factory();
        }
        else if (scrypt_module_factory !== null){
            return scrypt_module_factory();
        }
        else {
            return $timeout(async_load_scrypt, 100);
        }
    },

    async_load_nacl = function() {
        if (typeof module !== 'undefined' && module.exports) {
            // add node.js implementations
            require('nacl_factory');
            return nacl_factory.instantiate();
        }
        else if (nacl_factory !== null){
            return nacl_factory.instantiate();
        }
        else {
            return $timeout(async_load_nacl, 100);
        }
    },

    async_load_base58 = function() {
        if (typeof module !== 'undefined' && module.exports) {
            // add node.js implementations
            require('base58');
            return Base58;
        }
        else if (Base58 !== null){
            return Base58;
        }
        else {
            return $timeout(async_load_base58, 100);
        }
    },

    async_load_base64 = function() {
        if (typeof module !== 'undefined' && module.exports) {
            // add node.js implementations
            require('base58');
            return Base64;
        }
        else if (Base64 !== null){
            return Base64;
        }
        else {
            return setTimetout(async_load_base64, 100);
        }
    };

    function CryptoUtils() {
      var
       // Const
       crypto_sign_BYTES= 64,
       SEED_LENGTH= 32, // Length of the key
       SCRYPT_PARAMS= {
                "N":4096,
                "r":16,
                "p":1
              }

        // load libraries
        scrypt = async_load_scrypt(),
        nacl = async_load_nacl(),
        base58 = async_load_base58(),
        base64 = async_load_base64(),
        decode_utf8 = function(s) {
            var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
            for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
            return b;
        },

       /**
        * Create a key pair, from salt+password, and  return a wallet object
        */
        connect = function(salt, password) {
              return $q(function(resolve, reject) {
                  var seed = scrypt.crypto_scrypt(
                                              nacl.encode_utf8(password),
                                              nacl.encode_utf8(salt),
                                              4096, 16, 1, 32 // TODO: put in var SCRYPT_PARAMS
                                           );
                   var keypair = nacl.crypto_sign_keypair_from_seed(seed);
                   var pubkey = base58.encode(keypair.signPk);
                   var wallet = { keypair: keypair, pubkey: pubkey};
                   console.log('connect result pubkey: ' + pubkey);
                   resolve(wallet);
                })
          },

        /**
        * Verify a signature of a message, for a pubkey
        */
        verify = function (message, signature, pubkey) {
            return $q(function(resolve, reject) {
                var msg = decode_utf8(message);
                var sig = base64.decode(signature);
                var pub = base58.decode(pubkey);
                var m = new Uint8Array(crypto_sign_BYTES + msg.length);
                var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
                var i;
                for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
                for (i = 0; i < msg.length; i++) sm[i+crypto_sign_BYTES] = msg[i];

                // Call to verification lib...
                var verified = nacl.crypto_sign_open(sm, pub) !== null;
                resolve(verified);
            });
        },

        /**
        * Sign a message, from a wallet
        */
        sign = function(message, wallet) {
          return $q(function(resolve, reject) {
              var m = decode_utf8(message);
              var sk = wallet.keypair.signSk;
              var signedMsg = nacl.crypto_sign(m, sk);
              var sig = new Uint8Array(crypto_sign_BYTES);
              for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
              var signature = base64.encode(sig);
              resolve(signature);
            })
        },

        /**
        * Serialize to JSON string
        */
        toJson = function(wallet) {
          return $q(function(resolve, reject) {
              var json = JSON.stringify(wallet);
              resolve(json);
            })
        },

        /**
        * Serialize to JSON string
        */
        fromJson = function(json) {
          return $q(function(resolve, reject) {
              var wallet = JSON.parse(json || '{}');
              if (wallet.keypair != "undefined"
                  && wallet.keypair != null) {
                  var keypair = wallet.keypair;

                  // Convert to Uint8Array type
                  var signPk = new Uint8Array(32);
                  for (var i = 0; i < 32; i++) signPk[i] = keypair.signPk[i];
                  keypair.signPk = signPk;

                  var signSk = new Uint8Array(64);
                  for (var i = 0; i < 64; i++) signSk[i] = keypair.signSk[i];
                  keypair.signSk = signSk;

                  resolve(wallet);
              }
              else {
                resolve(wallet);
              }
            })
        };

      // Service's exposed methods
      return {
          /*
          TODO: uncomment if need to expose
          nacl: nacl,
          scrypt: scrypt,
          base58: base58,
          base64: base64,
          util: {
            encode_utf8: nacl.encode_utf8,
            decode_utf8: decode_utf8
          },
          */

          connect: connect,
          sign: sign,
          verify: verify,
          fromJson: fromJson
          //,isCompatible: isCompatible
       }
    }
    var service = CryptoUtils();
    service.instance = CryptoUtils;
  return service;
})

.factory('$localstorage', ['$window', 'CryptoUtils', '$q', function($window, CryptoUtils, $q) {
  return {
    set: function(key, value) {
      $window.localStorage[key] = value;
    },
    get: function(key, defaultValue) {
      return $window.localStorage[key] || defaultValue;
    },
    setObject: function(key, value) {
      $window.localStorage[key] = JSON.stringify(value);
    },
    getObject: function(key) {
      return JSON.parse($window.localStorage[key] || '{}');
    },
    loadWallet: function() {
        return $q(function(resolve, reject) {
            var json = $window.localStorage['wallet'];
            if (json == "undefined" || json == null) {
                resolve(null);
            }
            else {
                CryptoUtils.fromJson(json).then(
                    function(wallet) {
                        resolve(wallet);
                    },
                    function() {
                        reject('Could not load wallet from local storage');
                    }
                );
            }
        });
    }
  }
}])

.factory('Wallet', ['$localstorage', 'CryptoUtils', '$q', function($localstorage, CryptoUtils, $q) {
  Wallet = function(id) {

    var
    data = {
        pubkey: null,
        keypair: {
            signSk: null,
            signPk: null
        }
    },

    connect = function(username, password) {
        return $q(function(resolve, reject) {
            CryptoUtils.connect(username, password).then(
                function(newWallet) {
                    // Copy result to properties
                    data.pubkey = newWallet.pubkey;
                    data.keypair.signSk = newWallet.keypair.signSk;
                    data.keypair.signPk = newWallet.keypair.signPk;
                    newWallet = {};

                    resolve();
                }
            );
        });
    },

    close = function(username, password) {
        return $q(function(resolve, reject) {
            data.pubkey = null;
            data.keypair.signSk = null;
            data.keypair.signPk = null;
            resolve();
        });
    },

    isConnected = function() {
        return data.pubkey != "undefined"
            && data.pubkey != null;
    };

    return {
        id: id,
        data: data,

        connect: connect,
        close: close,
        isConnected: isConnected
    }
  }
  var service = Wallet('default');
  service.instance = service;
  return service;
}])
;
