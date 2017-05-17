//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.crypto.services', ['ngResource', 'cesium.device.services'])

  .factory('CryptoUtils', function($q, $timeout, ionicReady) {
    'ngInject';

    /**
     * CryptoAbstract, abstract class with useful methods
     * @type {number}
     */
    function CryptoAbstractService() {
      this.loaded = false;
      var that = this;

      this.copy = function(source) {
        _.forEach(_.keys(source), function(key) {
          that[key] = source[key];
        });
      };

      this.isLoaded = function() {
        return this.loaded;
      };

      this.util = this.util || {};

      /**
       * Converts an array buffer to a string
       *
       * @private
       * @param {ArrayBuffer} buf The buffer to convert
       * @param {Function} callback The function to call when conversion is complete
       */
      this.util.array_to_string = function(buf, callback) {
        var bb = new Blob([new Uint8Array(buf)]);
        var f = new FileReader();
        f.onload = function(e) {
          callback(e.target.result);
        };
        f.readAsText(bb);
      };
    }

    CryptoAbstractService.prototype.constants = {
      crypto_sign_BYTES: 64,
      crypto_secretbox_NONCEBYTES: 24,
      crypto_box_MACBYTES: 16,
      SEED_LENGTH: 32, // Length of the key
      SCRYPT_PARAMS:{
        N: 4096,
        r: 16,
        p: 1
      }
    };

    CryptoAbstractService.prototype.async_load_base58 = function(on_ready) {
      var that = this;
      if (Base58 !== null){return on_ready(Base58);}
      else {$timeout(function(){that.async_load_base58(on_ready);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_scrypt = function(on_ready, options) {
      var that = this;
      if (scrypt_module_factory !== null){on_ready(scrypt_module_factory(options.requested_total_memory));}
      else {$timeout(function(){that.async_load_scrypt(on_ready, options);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_nacl_js = function(on_ready, options) {
      var that = this;
      if (nacl_factory !== null) {nacl_factory.instantiate(on_ready, options);}
      else {$timeout(function(){that.async_load_nacl_js(on_ready, options);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_base64 = function(on_ready) {
      var that = this;
      if (Base64 !== null) {on_ready(Base64);}
      else {$timetout(function(){that.async_load_base64(on_ready);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_sha256 = function(on_ready) {
      var that = this;
      if (sha256 !== null){return on_ready(sha256);}
      else {$timeout(function(){that.async_load_sha256(on_ready);}, 100);}
    };

    // Web crypto API - see https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API
    var crypto =  window.crypto || window.msCrypto || window.Crypto;
    if (crypto && crypto.getRandomValues) {
      CryptoAbstractService.prototype.crypto = crypto;
      CryptoAbstractService.prototype.util = {};
      CryptoAbstractService.prototype.util.random_nonce = function() {
        var nonce = new Uint8Array(crypto_secretbox_NONCEBYTES);
        this.crypto.getRandomValues(nonce);
        return $q.when(nonce);
      };
    }
    else {
      // TODO: add a default function ?
      //CryptoAbstractService.prototype.random_nonce = function() {
      // var nonce = new Uint8Array(crypto_secretbox_NONCEBYTES);
      // var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      // for(var i = 0; i < length; i++) {
      //   text += possible.charAt(Math.floor(Math.random() * possible.length));
      // }
      //}
    }

    function FullJSServiceFactory() {
      this.id = 'FullJS';

      // libraries handlers
      this.scrypt = null;
      this.nacl = null;
      this.base58 = null;
      this.base64 = null;
      var that = this;

      this.util = this.util || {};
      this.util.decode_utf8 = function (s) {
        var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
        for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
        return b;
      };
      this.util.encode_utf8 = function (s) {
        return that.nacl.encode_utf8(s);
      };
      this.util.encode_base58 = function (a) { // TODO : move to abstract factory
        return that.base58.encode(a);
      };
      this.util.decode_base58 = function (a) { // TODO : move to abstract factory
        var i;
        a = that.base58.decode(a);
        var b = new Uint8Array(a.length);
        for (i = 0; i < a.length; i++) b[i] = a[i];
        return b;
      };
      this.util.decode_base64 = function (a) {
        return that.base64.decode(a);
      };
      this.util.encode_base64 = function (b) {
        return that.base64.encode(b);
      };

      this.util.hash_sha256 = function (message) {
        return $q(function (resolve) {
          var msg = that.util.decode_utf8(message);
          var hash = that.nacl.to_hex(that.nacl.crypto_hash_sha256(msg));
          resolve(hash.toUpperCase());
        });
      };
      this.util.random_nonce = function () {
        if (that.crypto && that.crypto.getRandomValues) {
          var nonce = new Uint8Array(that.constants.crypto_secretbox_NONCEBYTES);
          that.crypto.getRandomValues(nonce);
          return $q.when(nonce);
        }
        else {
          return $q.when(that.nacl.crypto_box_random_nonce());
        }
      };

      /**
       * Compute the box key pair, from a sign key pair
       */
      this.box_keypair_from_sign = function (signKeyPair) {
        if (signKeyPair.bokSk && signKeyPair.boxPk) return $q.when(signKeyPair);
        return $q.when(that.nacl.crypto_box_keypair_from_sign_sk(signKeyPair.signSk));
      };

      /**
       * Compute the box public key, from a sign public key
       */
      this.box_pk_from_sign = function (signPk) {
        return $q.when(that.nacl.crypto_box_pk_from_sign_pk(signPk));
      };

      this.box_sk_from_sign = function (signSk) {
        return $q.when(that.nacl.crypto_box_sk_from_sign_sk(signSk));
      };

      /**
       * Encrypt a message, from a key pair
       */
      this.box = function(message, nonce, recipientPk, senderSk) {
        return $q(function (resolve, reject) {
          if (!message) {
            resolve(message);
            return;
          }
          var messageBin = that.util.decode_utf8(message);
          if (typeof recipientPk === "string") {
            recipientPk = that.util.decode_base58(recipientPk);
          }

          //console.debug('Original message: ' + message);
          try {
            var ciphertextBin = that.nacl.crypto_box(messageBin, nonce, recipientPk, senderSk);
            var ciphertext = that.util.encode_base64(ciphertextBin);

            //console.debug('Encrypted message: ' + ciphertext);
            resolve(ciphertext);
          }
          catch (err) {
            reject(err);
          }
        });
      };

      /**
       * Decrypt a message, from a key pair
       */
      this.box_open = function (cypherText, nonce, senderPk, recipientSk) {
        return $q(function (resolve, reject) {
          if (!cypherText) {
            resolve(cypherText);
            return;
          }
          var ciphertextBin = that.util.decode_base64(cypherText);
          if (typeof senderPk === "string") {
            senderPk = that.util.decode_base58(senderPk);
          }

          try {
            var message = that.nacl.crypto_box_open(ciphertextBin, nonce, senderPk, recipientSk);
            that.util.array_to_string(message, function (result) {
              //console.debug('Decrypted text: ' + result);
              resolve(result);
            });
          }
          catch (err) {
            reject(err);
          }

        });
      };

      /**
       * Create key pairs (sign and box), from salt+password
       */
      this.connect = function(salt, password) {
        return $q(function(resolve, reject) {
          var seed = that.scrypt.crypto_scrypt(
            that.util.encode_utf8(password),
            that.util.encode_utf8(salt),
            that.constants.SCRYPT_PARAMS.N,
            that.constants.SCRYPT_PARAMS.r,
            that.constants.SCRYPT_PARAMS.p,
            that.constants.SEED_LENGTH);
          var signKeypair = that.nacl.crypto_sign_seed_keypair(seed);
          var boxKeypair = that.nacl.crypto_box_seed_keypair(seed);
          resolve({
            signPk: signKeypair.signPk,
            signSk: signKeypair.signSk,
            boxPk: boxKeypair.boxPk,
            boxSk: boxKeypair.boxSk
          });
        });
      };

      /**
       * Verify a signature of a message, for a pubkey
       */
      this.verify = function (message, signature, pubkey) {
        return $q(function(resolve, reject) {
          var msg = that.util.decode_utf8(message);
          var sig = that.util.decode_base64(signature);
          var pub = that.util.decode_base58(pubkey);
          var sm = new Uint8Array(that.constants.crypto_sign_BYTES + msg.length);
          var i;
          for (i = 0; i < that.constants.crypto_sign_BYTES; i++) sm[i] = sig[i];
          for (i = 0; i < msg.length; i++) sm[i+that.constants.crypto_sign_BYTES] = msg[i];

          // Call to verification lib...
          var verified = that.nacl.crypto_sign_open(sm, pub) !== null;
          resolve(verified);
        });
      };

      /**
       * Sign a message, from a key pair
       */
      this.sign = function(message, keypair) {
        return $q(function(resolve, reject) {
          var m = that.util.decode_utf8(message);
          var sk = keypair.signSk;
          var signedMsg = that.nacl.crypto_sign(m, sk);
          var sig = new Uint8Array(that.constants.crypto_sign_BYTES);
          for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
          var signature = that.base64.encode(sig);
          resolve(signature);
        });
      };

      this.load = function() {
        var deferred = $q.defer();
        var naclOptions = {};
        var scryptOptions = {};
        if (ionic.Platform.grade.toLowerCase()!='a') {
          console.log('Reduce NaCl memory because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
          naclOptions.requested_total_memory = 16 * 1048576; // 16 Mo
          console.log('Reduce Scrypt memory because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
          scryptOptions.requested_total_memory = 16 * 1048576; // 16 Mo
        }
        var loadedLib = 0;
        var checkAllLibLoaded = function() {
          loadedLib++;
          if (loadedLib === 4) {
            that.loaded = true;
            deferred.resolve();
          }
        };
        this.async_load_nacl_js(function(lib) {
          that.nacl = lib;
          checkAllLibLoaded();
        }, naclOptions);
        this.async_load_scrypt(function(lib) {
          that.scrypt = lib;
          checkAllLibLoaded();
        }, scryptOptions);
        this.async_load_base58(function(lib) {
          that.base58 = lib;
          checkAllLibLoaded();
        });
        this.async_load_base64(function(lib) {
          that.base64 = lib;
          checkAllLibLoaded();
        });
        return deferred.promise;
      };

      // Shortcuts
      this.util.hash = that.util.hash_sha256;
      this.box = {
        keypair: {
          fromSignKeypair: that.box_keypair_from_sign,
          skFromSignSk: that.box_sk_from_sign,
          pkFromSignPk: that.box_pk_from_sign
        },
        pack: that.box,
        open: that.box_open
      };
    }
    FullJSServiceFactory.prototype = new CryptoAbstractService();


    /* -----------------------------------------------------------------------------------------------------------------
     * Service that use Cordova MiniSodium plugin
     * ----------------------------------------------------------------------------------------------------------------*/

    /***
     * Factory for crypto, using Cordova plugin
     */
    function CordovaServiceFactory() {

      this.id = 'MiniSodium';

      // libraries handlers
      this.nacl = null; // the cordova plugin
      this.base58= null;
      this.sha256= null;
      var that = this;

      // functions
      this.util = this.util || {};
      this.util.decode_utf8 = function(s) {
        return that.nacl.to_string(s);
      };
      this.util.encode_utf8 = function(s) {
        return that.nacl.from_string(s);
      };
      this.util.encode_base58 = function(a) {
        return that.base58.encode(a);
      };
      this.util.decode_base58 = function(a) {
        var i;
        a = that.base58.decode(a);
        var b = new Uint8Array(a.length);
        for (i = 0; i < a.length; i++) b[i] = a[i];
        return b;
      };
      this.util.decode_base64 = function (a) {
        return that.nacl.from_base64(a);
      };
      this.util.encode_base64 = function (b) {
        return that.nacl.to_base64(b);
      };
      this.util.hash_sha256 = function(message) {
        return $q.when(that.sha256(message).toUpperCase());
      };
      this.util.random_nonce = function() {
        var nonce = new Uint8Array(that.constants.crypto_secretbox_NONCEBYTES);
        that.crypto.getRandomValues(nonce);
        return $q.when(nonce);
      };

      /**
       * Create key pairs (sign and box), from salt+password, using cordova
       */
      this.connect = function(salt, password) {
        var deferred = $q.defer();

        that.nacl.crypto_pwhash_scryptsalsa208sha256_ll(
          that.nacl.from_string(password),
          that.nacl.from_string(salt),
          that.constants.SCRYPT_PARAMS.N,
          that.constants.SCRYPT_PARAMS.r,
          that.constants.SCRYPT_PARAMS.p,
          that.constants.SEED_LENGTH,
          function (err, seed) {
            if (err) { deferred.reject(err); return;}

            that.nacl.crypto_sign_seed_keypair(seed, function (err, signKeypair) {
              if (err) { deferred.reject(err); return;}
              var result = {
                signPk: signKeypair.pk,
                signSk: signKeypair.sk
              };
              that.box_keypair_from_sign(result)
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
      };

      /**
       * Verify a signature of a message, for a pubkey
       */
      this.verify = function (message, signature, pubkey) {
        var deferred = $q.defer();
        that.nacl.crypto_sign_verify_detached(
          that.nacl.from_base64(signature),
          that.nacl.from_string(message),
          that.nacl.from_base64(pubkey),
          function(err, verified) {
            if (err) { deferred.reject(err); return;}
            deferred.resolve(verified);
          });
        return deferred.promise;
      };

      /**
       * Sign a message, from a key pair
       */
      this.sign = function(message, keypair) {
        var deferred = $q.defer();

        that.nacl.crypto_sign(
          that.nacl.from_string(message), // message
          keypair.signSk, // sk
          function(err, signedMsg) {
            if (err) { deferred.reject(err); return;}
            var sig;
            if (signedMsg.length > that.constants.crypto_sign_BYTES) {
              sig = new Uint8Array(that.constants.crypto_sign_BYTES);
              for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
              console.debug("//******** HAS REDUCE signedMsg ********* /// ");
            }
            else {
              sig = signedMsg;
            }
            var signature = that.nacl.to_base64(sig);
            deferred.resolve(signature);
          });

        return deferred.promise;
      };

      /**
       * Compute the box key pair, from a sign key pair
       */
      this.box_keypair_from_sign = function(signKeyPair) {
        if (signKeyPair.bokSk && signKeyPair.boxPk) return $q.when(signKeyPair);
        var deferred = $q.defer();
        var result = {};
        that.nacl.crypto_sign_ed25519_pk_to_curve25519(signKeyPair.signPk, function(err, boxPk) {
          if (err) { deferred.reject(err); return;}
          result.boxPk = boxPk;
          if (result.boxSk) deferred.resolve(result);
        });
        that.nacl.crypto_sign_ed25519_sk_to_curve25519(signKeyPair.signSk, function(err, boxSk) {
          if (err) { deferred.reject(err); return;}
          result.boxSk = boxSk;
          if (result.boxPk) deferred.resolve(result);
        });

        return deferred.promise;
      };

      /**
       * Compute the box public key, from a sign public key
       */
      this.box_pk_from_sign = function(signPk) {
        var deferred = $q.defer();
        that.nacl.crypto_sign_ed25519_pk_to_curve25519(signPk, function(err, boxPk) {
          if (err) { deferred.reject(err); return;}
          deferred.resolve(boxPk);
        });
        return deferred.promise;
      };

      /**
       * Encrypt a message, from a key pair
       */
      this.box = function(message, nonce, recipientPk, senderSk) {
        if (!message) {
          return $q.reject('No message');
        }
        var deferred = $q.defer();

        var messageBin = that.nacl.from_string(message);
        if (typeof recipientPk === "string") {
          recipientPk = that.util.decode_base58(recipientPk);
        }

        that.nacl.crypto_box_easy(messageBin, nonce, recipientPk, senderSk, function(err, ciphertextBin) {
          if (err) { deferred.reject(err); return;}
          var ciphertext = that.util.encode_base64(ciphertextBin);
          //console.debug('Encrypted message: ' + ciphertext);
          deferred.resolve(ciphertext);
        });
        return deferred.promise;
      };

      /**
       * Decrypt a message, from a key pair
       */
      this.box_open = function(cypherText, nonce, senderPk, recipientSk) {
        if (!cypherText) {
          return $q.reject('No cypherText');
        }
        var deferred = $q.defer();

        var ciphertextBin = that.nacl.from_base64(cypherText);
        if (typeof senderPk === "string") {
          senderPk = that.util.decode_base58(senderPk);
        }

        // Avoid crash if content has not the minimal length - Fix #346
        if (ciphertextBin.length < that.constants.crypto_box_MACBYTES) {
          deferred.reject('Invalid cypher content length');
          return;
        }

        that.nacl.crypto_box_open_easy(ciphertextBin, nonce, senderPk, recipientSk, function(err, message) {
          if (err) { deferred.reject(err); return;}
          that.util.array_to_string(message, function(result) {
            //console.debug('Decrypted text: ' + result);
            deferred.resolve(result);
          });
        });

        return deferred.promise;
      };

      this.load = function() {
        var deferred = $q.defer();
        if (!window.plugins || !window.plugins.MiniSodium) {
          deferred.reject("Cordova plugin 'MiniSodium' not found. Please load Full JS implementation instead.");
        }
        else {
          that.nacl = window.plugins.MiniSodium;
          var loadedLib = 0;
          var checkAllLibLoaded = function() {
            loadedLib++;
            if (loadedLib == 2) {
              that.loaded = true;
              deferred.resolve();
            }
          };
          that.async_load_base58(function(lib) {
            that.base58 = lib;
            checkAllLibLoaded();
          });
          that.async_load_sha256(function(lib) {
            that.sha256 = lib;
            checkAllLibLoaded();
          });
        }

        return deferred.promise;
      };

      // Shortcuts
      this.util.hash = that.util.hash_sha256;
      this.box = {
        keypair: {
          fromSignKeypair: that.box_keypair_from_sign,
          pkFromSignPk: that.box_pk_from_sign
        },
        pack: that.box,
        open: that.box_open
      };
    }
    CordovaServiceFactory.prototype = new CryptoAbstractService();

    /* -----------------------------------------------------------------------------------------------------------------
     * Create service instance
     * ----------------------------------------------------------------------------------------------------------------*/


    var service = new CryptoAbstractService();

    var isDevice = true;
    // removeIf(device)
    isDevice = false;
    // endRemoveIf(device)

    ionicReady().then(function() {
      var now = new Date().getTime();

      var serviceImpl;

      // Use Cordova plugin implementation, when exists
      if (isDevice && window.plugins && window.plugins.MiniSodium && crypto && crypto.getRandomValues) {
        console.debug('[crypto] Loading Cordova MiniSodium implementation...');
        serviceImpl = new CordovaServiceFactory();
      }
      else {
        console.debug('[crypto] Loading FullJS implementation...');
        serviceImpl = new FullJSServiceFactory();
      }

      // Load (async lib)
      serviceImpl.load()
        .catch(function(err) {
          console.error(err);
          throw err;
        })
        .then(function() {
          service.copy(serviceImpl);
          console.debug('[crypto] Loaded \'{0}\' implementation in {1}ms'.format(service.id, new Date().getTime() - now));
        });

    });


    return service;
  })
;
