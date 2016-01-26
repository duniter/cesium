//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.services', ['ngResource'])

.factory('BMA', function($http, $q) {

    function BMA(server) {

      function prepare(uri, params, config, callback) {
        var pkeys = [], queryParams = {}, newUri = uri;
        if (typeof params == 'object') {
          pkeys = _.keys(params);
        }

        pkeys.forEach(function(pkey){
          var prevURI = newUri;
          newUri = newUri.replace(new RegExp(':' + pkey), params[pkey]);
          if (prevURI == newUri) {
            queryParams[pkey] = params[pkey];
          }
        });
        config.params = queryParams;
        callback(newUri, config);
      };

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
                  reject(data);
                });
            });
          });
        }
      };

      function postResource(uri) {
        return function(data, params) {
          return $q(function(resolve, reject) {
            var config = {
              timeout: 4000
            };

            prepare(uri, params, config, function(uri, config) {
                $http.post(uri, data, config)
                .success(function(data, status, headers, config) {
                  resolve(data);
                })
                .error(function(data, status, headers, config) {
                  reject(data);
                });
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

        tx: {
          sources: getResource('http://' + server + '/tx/sources/:pubkey'),
          process: postResource('http://' + server + '/tx/process')
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
        encode_base58 = function(a) {
            return base58.encode(a);
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
                   resolve(keypair);
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
        sign = function(message, keypair) {
          return $q(function(resolve, reject) {
              var m = decode_utf8(message);
              var sk = keypair.signSk;
              var signedMsg = nacl.crypto_sign(m, sk);
              var sig = new Uint8Array(crypto_sign_BYTES);
              for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
              var signature = base64.encode(sig);
              resolve(signature);
            })
        }

        ;

      // Service's exposed methods
      return {
          /*
          TODO: uncomment if need to expose
          nacl: nacl,
          scrypt: scrypt,
          base58: base58,
          base64: base64,*/
          util: {
            encode_utf8: nacl.encode_utf8,
            decode_utf8: decode_utf8,
            encode_base58: encode_base58
          },
          

          connect: connect,
          sign: sign,
          verify: verify
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
    }
  }
}])

.factory('Wallet', ['CryptoUtils', 'BMA', '$q', function(CryptoUtils, BMA, $q) {
  Wallet = function(id) {

    var

    USE_RELATIVE_DEFAULT = true,

    createData = function() {
      return {
        pubkey: null,
        keypair: {
            signSk: null,
            signPk: null
        },
        balance: 0,
        sources: null,
        useRelative: USE_RELATIVE_DEFAULT,
        currency: null,
        currentUD: null,
        loaded: false
      };
    },

    data = createData(),

    login = function(salt, password) {
        return $q(function(resolve, reject) {
            CryptoUtils.connect(salt, password).then(
                function(keypair) {
                    // Copy result to properties
                    data.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
                    data.keypair = keypair;
                    resolve();
                }
            );
        });
    },

    logout = function(username, password) {
        return $q(function(resolve, reject) {
            data = createData();
            resolve();
        });
    },

    isLogin = function() {
        return data.pubkey != "undefined"
            && data.pubkey != null;
    },

    loadData = function() {
        return $q(function(resolve, reject){
          data.loaded = false;

          $q.all([

            // Get currency parameters
            BMA.currency.parameters()
              .then(function(json){
                data.currency = json.currency;
              }),

            // Get the UD informations
            BMA.blockchain.stats.ud()
              .then(function(res){
                if (res.result.blocks.length) {
                  var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
                  return BMA.blockchain.block({ block: lastBlockWithUD })
                    .then(function(block){
                      data.currentUD = block.dividend;
                    });
                  }
              }),

            // Get sources
            BMA.tx.sources({pubkey: data.pubkey})
              .then(function(result){
                data.sources = result.sources;

                var balance = 0;
                if (result.sources != "undefined" && result.sources != null) {
                  for (var i=0; i<result.sources.length; i++) balance += result.sources[i].amount;
                }
                data.balance = balance;
              })
          ])
          .then(function() {
            data.loaded = true;
            resolve();
          })
          .catch(function(err) {
            data.loaded = false;
            reject(err);
          });
        });
    },

    /**
    * Send a new transaction
    */
    transfer = function(destPub, amount, comments) {
        return $q(function(resolve, reject) {

            if (!isLogin()){
              reject('Wallet required to be login first.');
              return;
            }
            if (amount == null) {
              reject('amount must not be null or < 0');
              return;
            }

            if (amount > data.balance) {
              reject('Not enought credit');
              return;
            }

            var tx = "Version: 1\n"
              + "Type: Transaction\n"
              + "Currency: " + data.currency + "\n"
              + "Issuers:\n"
              + data.pubkey + "\n"
              + "Inputs:\n";
            var sourceAmount = 0; 
            for (var i = 0; i<data.sources.length; i++) {
              var input = data.sources[i];
              if (input.consumed == "undefined" || !input.consumed){
                // INDEX:SOURCE:NUMBER:FINGERPRINT:AMOUNT
                tx += "0:"+input.type+":"+ input.number+":"
                   + input.fingerprint+":"
                   + input.amount+"\n";
                sourceAmount += input.amount;
                data.sources[i].consumed=true;
                if (sourceAmount >= amount) {
                  break;
                }
              }
            }

            if (sourceAmount < amount) {
              reject('Not enought credit');
              return;
            }

            // Output
            tx += "Outputs:\n"
               // ISSUERS:AMOUNT
               + destPub +":" + amount + "\n"; 
            if (sourceAmount > amount) {
              tx += data.pubkey+":"+(sourceAmount-amount)+"\n";
            }

            // Comment
            tx += "Comment: "+ (comments!=null?comments:"") + "\n";

            CryptoUtils.sign(tx, data.keypair)
              .then(function(signature) {
                var signedTx = tx + signature + "\n";
                BMA.tx.process({transaction: signedTx})
                  .then(function(result) {
                    data.balance -= amount;
                    resolve(result);
                  })
                  .catch(function(err){
                    reject(err);
                  });
              })
              .catch(function(err){
                reject(err);
              });
        });
    }

    /**
    * Serialize to JSON string
    */
    toJson = function() {
      return $q(function(resolve, reject) {
          var json = JSON.stringify(data);
          resolve(json);
        })
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json) {
      return $q(function(resolve, reject) {
          var obj = JSON.parse(json || '{}');
          if (obj.keypair != "undefined"
              && obj.keypair != null) {
              var keypair = obj.keypair;

              // Convert to Uint8Array type
              var signPk = new Uint8Array(32);
              for (var i = 0; i < 32; i++) signPk[i] = keypair.signPk[i];
              keypair.signPk = signPk;

              var signSk = new Uint8Array(64);
              for (var i = 0; i < 64; i++) signSk[i] = keypair.signSk[i];
              keypair.signSk = signSk;

              data.pubkey = obj.pubkey;
              data.keypair = keypair;

              resolve();
          }
          else {
            reject('Not a valid Wallet.data object');
          }
        })
    };

    return {
        id: id,
        data: data,

        login: login,
        logout: logout,
        isLogin: isLogin,
        toJson: toJson,
        fromJson: fromJson,
        loadData: loadData,
        transfer: transfer
    }
  }
  var service = Wallet('default');
  service.instance = service;
  return service;
}])
;
