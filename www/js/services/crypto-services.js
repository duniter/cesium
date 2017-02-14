//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.crypto.services', ['ngResource', 'cesium.device.services'])

  .factory('CryptoUtils', function($q, $timeout, Device) {
    'ngInject';

    // Const
    var
      crypto_sign_BYTES = 64,
      crypto_secretbox_NONCEBYTES = 24,
      SEED_LENGTH = 32, // Length of the key
      SCRYPT_PARAMS = {
        N: 4096,
        r: 16,
        p: 1
      },
      // Web crypto API - see https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
      crypto = window.crypto || window.msCrypto || window.Crypto,

    async_load_base58 = function(on_ready) {
      if (Base58 !== null){return on_ready(Base58);}
      else {$timeout(function(){async_load_base58(on_ready);}, 100);}
    },

    async_load_scrypt = function(on_ready, options) {
      if (scrypt_module_factory !== null){on_ready(scrypt_module_factory(options.requested_total_memory));}
      else {$timeout(function(){async_load_scrypt(on_ready, options);}, 100);}
    },

    async_load_nacl_js = function(on_ready, options) {
      if (nacl_factory !== null) {nacl_factory.instantiate(on_ready, options);}
      else {$timeout(function(){async_load_nacl_js(on_ready, options);}, 100);}
    },

    async_load_base64 = function(on_ready) {
      if (Base64 !== null) {on_ready(Base64);}
      else {$timetout(function(){async_load_base64(on_ready);}, 100);}
    },

    async_load_sha256 = function(on_ready) {
      if (sha256 !== null){return on_ready(sha256);}
      else {$timeout(function(){async_load_sha256(on_ready);}, 100);}
    };

    if (crypto) {
      console.debug('Web Crypto API (window.crypto) exists: getRandomValues=[{0}]'.format(!!crypto.getRandomValues));
    }

    function FullJSServiceFactory() {

      var
        // libraries handlers
        scrypt,
        nacl,
        base58,
        base64,
        loadedLib = 0,

        // functions
        decode_utf8 = function(s) {
            var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
            for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
            return b;
        },
        encode_utf8 = function(s) {
          return nacl.encode_utf8(s);
        },
        encode_base58 = function(a) {
          return base58.encode(a);
        },
        decode_base58 = function(a) {
          var i;
          a = base58.decode(a);
          var b = new Uint8Array(a.length);
          for (i = 0; i < a.length; i++) b[i] = a[i];
          return b;
        },
        hash_sha256 = function(message) {
          return $q(function(resolve) {
            var msg = decode_utf8(message);
            var hash = nacl.to_hex(nacl.crypto_hash_sha256(msg));
            resolve(hash.toUpperCase());
          });
        },
        random_nonce = function() {
          if (crypto && crypto.getRandomValues) {
            var nonce = new Uint8Array(crypto_secretbox_NONCEBYTES);
            crypto.getRandomValues(nonce);
            return $q.when(nonce);
          }
          else {
            // TODO
            // var nonce = new Uint8Array(crypto_secretbox_NONCEBYTES);
            // var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            // for(var i = 0; i < length; i++) {
            //   text += possible.charAt(Math.floor(Math.random() * possible.length));
            // }
            return $q.when(nacl.crypto_box_random_nonce());
          }
        },

        /**
         * Converts an array buffer to a string
         *
         * @private
         * @param {ArrayBuffer} buf The buffer to convert
         * @param {Function} callback The function to call when conversion is complete
         */
        array_to_string = function(buf, callback) {
          var bb = new Blob([new Uint8Array(buf)]);
          var f = new FileReader();
          f.onload = function(e) {
            callback(e.target.result);
          };
          f.readAsText(bb);
        },

        /**
         * Create key pairs (sign and box), from salt+password
         */
        connect = function(salt, password) {
          return $q(function(resolve, reject) {
            var seed = scrypt.crypto_scrypt(
              nacl.encode_utf8(password),
              nacl.encode_utf8(salt),
              SCRYPT_PARAMS.N,
              SCRYPT_PARAMS.r,
              SCRYPT_PARAMS.p,
              SEED_LENGTH);
            var signKeypair = nacl.crypto_sign_seed_keypair(seed);
            var boxKeypair = nacl.crypto_box_seed_keypair(seed);
            resolve({
              signPk: signKeypair.signPk,
              signSk: signKeypair.signSk,
              boxPk: boxKeypair.boxPk,
              boxSk: boxKeypair.boxSk
            });
          });
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
         * Sign a message, from a key pair
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
          });
        },

        /**
         * Compute the box key pair, from a sign key pair
         */
        box_keypair_from_sign = function(signKeyPair) {
          if (signKeyPair.bokSk && signKeyPair.boxPk) return $q.when(signKeyPair);
          return $q.when(nacl.crypto_box_keypair_from_sign_sk(signKeyPair.signSk));
        },

        /**
         * Compute the box public key, from a sign public key
         */
        box_pk_from_sign = function(signPk) {
          return $q.when(nacl.crypto_box_pk_from_sign_pk(signPk));
        },

        /**
         * Encrypt a message, from a key pair
         */
        box = function(message, nonce, recipientPk, senderSk) {
          return $q(function(resolve, reject) {
            if (!message) {
              resolve(message);
              return;
            }
            var messageBin = decode_utf8(message);
            if (typeof recipientPk === "string") {
              recipientPk = decode_base58(recipientPk);
            }

            //console.debug('Original message: ' + message);
            try {
              var ciphertextBin = nacl.crypto_box(messageBin, nonce, recipientPk, senderSk);
              var ciphertext = base64.encode(ciphertextBin);
              //console.debug('Encrypted message: ' + ciphertext);
              resolve(ciphertext);
            }
            catch(err) {
              reject(err);
            }
          });
        },

      /**
       * Decrypt a message, from a key pair
       */
      box_open = function(cypherText, nonce, senderPk, recipientSk) {
        return $q(function(resolve, reject) {
          if (!cypherText) {
            resolve(cypherText);
            return;
          }
          var ciphertextBin = base64.decode(cypherText);
          if (typeof senderPk === "string") {
            senderPk = CryptoUtils.util.decode_base58(senderPk);
          }

          try {
            var message = nacl.crypto_box_open(ciphertextBin, nonce, senderPk, recipientSk);
            array_to_string(message, function(result) {
              //console.debug('Decrypted text: ' + result);
              resolve(result);
            });
          }
          catch(err) {
            reject(err);
          }

        });
      },

      isLoaded = function() {
        return loadedLib === 4;
      },

      load = function() {
        var deferred = $q.defer();
        var naclOptions = {};
        var scryptOptions = {};
        if (ionic.Platform.grade.toLowerCase()!='a') {
          console.log('Reduce NaCl memory because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
          naclOptions.requested_total_memory = 16 * 1048576; // 16 Mo
          console.log('Reduce Scrypt memory because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
          scryptOptions.requested_total_memory = 16 * 1048576; // 16 Mo
        }
        var checkAllLibLoaded = function() {
          loadedLib++;
          if (isLoaded()) {
            deferred.resolve();
          }
        };
        async_load_nacl_js(function(lib) {
          nacl = lib;
          checkAllLibLoaded();
        }, naclOptions);
        async_load_scrypt(function(lib) {
          scrypt = lib;
          checkAllLibLoaded();
        }, scryptOptions);
        async_load_base58(function(lib) {
          base58 = lib;
          checkAllLibLoaded();
        });
        async_load_base64(function(lib) {
          base64 = lib;
          checkAllLibLoaded();
        });
        return deferred.promise;
      };

      // Service's exposed methods
      return {
        isLoaded: isLoaded,
        load: load,
        util: {
          encode_utf8: encode_utf8,
          decode_utf8: decode_utf8,
          encode_base58: encode_base58,
          decode_base58: decode_base58,
          hash: hash_sha256,
          encode_base64: function() {return base64.encode(arguments);},
          random_nonce: random_nonce
        },
        connect: connect,
        sign: sign,
        verify: verify,
        box: {
          keypair: {
            fromSignKeypair: box_keypair_from_sign,
            pkFromSignPk: box_pk_from_sign
          },
          pack: box,
          open: box_open
        }
      };
    }

    /***
     * Factory for crypto, using Cordova plugin
     */
    function CordovaServiceFactory() {
      var
        // libraries handlers
        nacl, // the cordova plugin
        nacl_js, // the full JS lib (need for random values)
        base58,
        sha256,
        loadedLib = 0,

        // functions
        decode_utf8 = function(s) {
          return nacl.to_string(s);
        },
        encode_utf8 = function(s) {
          return nacl.from_string(s);
        },
        encode_base58 = function(a) {
          return base58.encode(a);
        },
        decode_base58 = function(a) {
          var i;
          a = base58.decode(a);
          var b = new Uint8Array(a.length);
          for (i = 0; i < a.length; i++) b[i] = a[i];
          return b;
        },
        hash_sha256 = function(message) {
          return $q.when(sha256(message).toUpperCase());
        },
        random_nonce = function() {
          if (crypto && crypto.getRandomValues) {
            var nonce = new Uint8Array(crypto_secretbox_NONCEBYTES);
            crypto.getRandomValues(nonce);
            return $q.when(nonce);
          }
          else {
            return $q.when(nacl_js.crypto_box_random_nonce());
          }
        },
        /**
         * Converts an array buffer to a string
         *
         * @private
         * @param {ArrayBuffer} buf The buffer to convert
         * @param {Function} callback The function to call when conversion is complete
         */
        array_to_string = function(buf, callback) {
          var bb = new Blob([new Uint8Array(buf)]);
          var f = new FileReader();
          f.onload = function(e) {
            callback(e.target.result);
          };
          f.readAsText(bb);
        },

        /**
         * Create key pairs (sign and box), from salt+password, using cordova
         */
        connect = function(salt, password) {
          var deferred = $q.defer();

          nacl.crypto_pwhash_scryptsalsa208sha256_ll(
            nacl.from_string(password),
            nacl.from_string(salt),
            SCRYPT_PARAMS.N,
            SCRYPT_PARAMS.r,
            SCRYPT_PARAMS.p,
            SEED_LENGTH,
            function (err, seed) {
              if (err) { deferred.reject(err); return;}
              nacl.crypto_sign_seed_keypair(seed, function (err, signKeypair) {
                if (err) { deferred.reject(err); return;}
                var result = {
                  signPk: signKeypair.pk,
                  signSk: signKeypair.sk
                };
                box_keypair_from_sign(result)
                  .then(function(boxKeypair) {
                    result.boxPk = boxKeypair.pk;
                    result.boxSk = boxKeypair.sk;
                    deferred.resolve(result);
                  })
                  .catch(function(err) {
                    deferred.reject(err);
                  });
              });

            }
          );

          return deferred.promise;
        },

        /**
         * Verify a signature of a message, for a pubkey
         */
        verify = function (message, signature, pubkey) {
          var deferred = $q.defer();
          nacl.crypto_sign_verify_detached(
            nacl.from_base64(signature),
            nacl.from_string(message),
            nacl.from_base64(pubkey),
            function(err, verified) {
              if (err) { deferred.reject(err); return;}
              deferred.resolve(verified);
            });
          return deferred.promise;
        },

        /**
         * Sign a message, from a key pair
         */
        sign = function(message, keypair) {
          var deferred = $q.defer();
          var nacl = window.plugins.MiniSodium;

          nacl.crypto_sign(
            nacl.from_string(message), // message
            keypair.signSk, // sk
            function(err, signedMsg) {
              if (err) { deferred.reject(err); return;}
              var sig;
              if (signedMsg.length > crypto_sign_BYTES) {
                sig = new Uint8Array(crypto_sign_BYTES);
                for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
                console.debug("//******** HAS REDUCE signedMsg ********* /// ");
              }
              else {
                sig = signedMsg;
              }
              var signature = nacl.to_base64(sig);
              deferred.resolve(signature);
            });

          return deferred.promise;
        },

        /**
         * Compute the box key pair, from a sign key pair
         */
        box_keypair_from_sign = function(signKeyPair) {
          console.log("box_keypair_from_sign");
          if (signKeyPair.bokSk && signKeyPair.boxPk) return $q.when(signKeyPair);
          var deferred = $q.defer();
          var result = {};
          nacl.crypto_sign_ed25519_pk_to_curve25519(signKeyPair.signPk, function(err, boxPk) {
            if (err) { deferred.reject(err); return;}
            result.boxPk = boxPk;
            if (result.boxSk) deferred.resolve(result);
          });
          nacl.crypto_sign_ed25519_sk_to_curve25519(signKeyPair.signSk, function(err, boxSk) {
            if (err) { deferred.reject(err); return;}
            result.boxSk = boxSk;
            if (result.boxPk) deferred.resolve(result);
          });

          return deferred.promise;
        },

        /**
         * Compute the box public key, from a sign public key
         */
        box_pk_from_sign = function(signPk) {
          var deferred = $q.defer();
          nacl.crypto_sign_ed25519_pk_to_curve25519(signPk, function(err, boxPk) {
            if (err) { deferred.reject(err); return;}
            deferred.resolve(boxPk);
          });
          return deferred.promise;
        },

        /**
         * Encrypt a message, from a key pair
         */
        box = function(message, nonce, recipientPk, senderSk) {
          if (!message) {
            return $q.reject('No message');
          }
          var deferred = $q.defer();
          var messageBin = encode_utf8(message);
          if (typeof recipientPk === "string") {
            recipientPk = decode_base58(recipientPk);
          }

          //console.debug('Original message: ' + message);

          nacl.crypto_box_easy(messageBin, nonce, recipientPk, senderSk, function(err, ciphertextBin) {
            if (err) { deferred.reject(err); return;}
            var ciphertext = nacl.to_base64(ciphertextBin);
            //console.debug('Encrypted message: ' + ciphertext);
            deferred.resolve(ciphertext);
          });
          return deferred.promise;
        };

      /**
       * Decrypt a message, from a key pair
       */
      box_open = function(cypherText, nonce, senderPk, recipientSk) {
        console.log("box_open");
        if (!cypherText) {
          return $q.reject('No cypherText');
        }
        var deferred = $q.defer();

        var ciphertextBin = nacl.from_base64(cypherText);
        if (typeof senderPk === "string") {
          senderPk = decode_base58(senderPk);
        }

        nacl.crypto_box_open_easy(ciphertextBin, nonce, senderPk, recipientSk, function(err, message) {
          if (err) { deferred.reject(err); return;}
          array_to_string(message, function(result) {
            //console.debug('Decrypted text: ' + result);
            deferred.resolve(result);
          });
        });

        return deferred.promise;
      };

      isLoaded = function(){
        return loadedLib === 3;
      };

      load = function() {
        var deferred = $q.defer();
        if (!window.plugins || !window.plugins.MiniSodium) {
          deferred.reject("Cordova plugin 'MiniSodium' not found");
        }
        else {
          nacl = window.plugins.MiniSodium;
          var checkAllLibLoaded = function() {
            loadedLib++;
            if (isLoaded()) {
              deferred.resolve();
            }
          };
          async_load_base58(function(lib) {
            base58 = lib;
            checkAllLibLoaded();
          });
          async_load_sha256(function(lib) {
            sha256 = lib;
            checkAllLibLoaded();
          });
          async_load_nacl_js(function(lib) {
            nacl_js = lib;
            checkAllLibLoaded();
          });

        }

        return deferred.promise;
      };

      // Service's exposed methods
      return {
        isLoaded: isLoaded,
        load: load,
        util: {
          encode_utf8: encode_utf8,
          decode_utf8: decode_utf8,
          encode_base58: encode_base58,
          decode_base58: decode_base58,
          hash: hash_sha256,
          encode_base64: function() {return nacl.to_base64(arguments);},
          random_nonce: random_nonce
        },
        connect: connect,
        sign: sign,
        verify: verify,
        box: {
          keypair: {
            fromSignKeypair: box_keypair_from_sign,
            pkFromSignPk: box_pk_from_sign
          },
          pack: box,
          open: box_open
        }
      };
    }

    var service = {
      isLoaded: function(){return false;}
    };

    // We use 'Device.ready()' instead of '$ionicPlatform.ready()', because it could be call many times
    Device.ready()
      .then(function() {
        var now = new Date().getTime();
        var serviceImpl;
        var serviceImplName;

        // Use cordova implementaion, when possible
        if (window.plugins && window.plugins.MiniSodium) {
          serviceImplName = 'MiniSodium';
          serviceImpl = CordovaServiceFactory();
        }
        else {
          serviceImplName = 'full JS';
          serviceImpl = FullJSServiceFactory();
        }

        return serviceImpl.load()
          .catch(function(err) {
            console.error(err);
            throw err;
          })
          .then(function() {
            angular.copy(serviceImpl, service);
            console.debug('[crypto] Loaded  \'{0}\' implementation in {1}ms'.format(serviceImplName, new Date().getTime() - now));
          });
      });

    return service;
  })
;
