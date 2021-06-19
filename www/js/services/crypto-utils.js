//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.crypto.services', ['cesium.utils.services'])

  /* -----------------------------
   * Crypto utils fucntions (NaCL, Scrypt, XOR)
   */
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

      /**
       * Apply a XOR between to Uint8 array
       * @param {Uint8Array} first array
       * @param {Uint8Array} second array
       */
      this.util.xor = function(a, b) {
        var length = Math.max(a.length, b.length);
        var buffer = new Uint8Array(length);
        for (var i = 0; i < length; ++i) {
          buffer[i] = a[i] ^ b[i];
        }
        return buffer;
      }
    }

    CryptoAbstractService.prototype.constants = {
      crypto_sign_BYTES: 64,
      crypto_secretbox_NONCEBYTES: 24,
      crypto_box_MACBYTES: 16,
      SEED_LENGTH: 32, // Length of the key
      SCRYPT_PARAMS:{
        SIMPLE: {
          N: 2048,
          r: 8,
          p: 1,
          memory: -1 // default
        },
        DEFAULT: {
          N: 4096,
          r: 16,
          p: 1,
          memory: -1 // default
        },
        // removeIf(no-device)
        SECURE: {
          N: 16384,
          r: 32,
          p: 2,
          memory: 33554432
        },
        HARDEST: {
          N: 65536,
          r: 32,
          p: 4,
          memory: 134217728
        },
        EXTREME: {
          N: 262144,
          r: 64,
          p: 8,
          memory: 536870912
        }
        // endRemoveIf(no-device)
      }
    };

    CryptoAbstractService.prototype.async_load_base58 = function(on_ready) {
      var that = this;
      if (Base58 !== null){return on_ready(Base58);}
      else {$timeout(function(){that.async_load_base58(on_ready);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_scrypt = function(on_ready, options) {
      var that = this;
      if (scrypt_module_factory !== null){scrypt_module_factory(on_ready, options);}
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
      else {$timeout(function(){that.async_load_base64(on_ready);}, 100);}
    };

    CryptoAbstractService.prototype.async_load_sha256 = function(on_ready) {
      var that = this;
      if (sha256 !== null){return on_ready(sha256);}
      else {$timeout(function(){that.async_load_sha256(on_ready);}, 100);}
    };

    CryptoAbstractService.prototype.seed_from_signSk = function(signSk) {
      var seed = new Uint8Array(this.constants.SEED_LENGTH);
      for (var i = 0; i < seed.length; i++) seed[i] = signSk[i];
      return seed;
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
        var d = that.base58.decode(a);
        var b = new Uint8Array(d.length);
        for (i = 0; i < d.length; i++) b[i] = d[i];
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
      this.util.crypto_hash_sha256 = function(msg_int8) {
        return that.nacl.crypto_hash_sha256(msg_int8);
      };
      this.util.crypto_scrypt = function(password, salt, N, r, p, seedLength) {

        return $q(function(resolve, reject) {
          try {
            var seed = that.scrypt.crypto_scrypt(
              password,
              salt,
              N,
              r,
              p,
              seedLength);
            resolve(seed);
          }
          catch(err) {
            reject(err);
          }
        });
      };

      /**
       * Compute the box key pair, from a sign key pair
       */
      this.box_keypair_from_sign = function (signKeyPair) {
        if (signKeyPair.boxSk && signKeyPair.boxPk) return $q.when(signKeyPair);
        return $q(function (resolve, reject) {
          try {
            // TODO: waiting for a new version of js-nacl, with missing functions expose
            //resolve(that.nacl.crypto_box_keypair_from_sign_sk(signKeyPair.signSk);

            resolve(crypto_box_keypair_from_sign_sk(signKeyPair.signSk));
          }
          catch(err) {
            reject(err);
          }
        });
      };

      /**
       * Compute the box public key, from a sign public key
       */
      this.box_pk_from_sign = function (signPk) {
        return $q(function(resolve, reject) {
          try {
            // TODO: waiting for a new version of js-nacl, with missing functions expose
            //resolve(that.nacl.crypto_box_pk_from_sign_pk(signPk));

            resolve(crypto_box_pk_from_sign_pk(signPk));
          }
          catch(err) {
            reject(err);
          }
        });
      };

      this.box_sk_from_sign = function (signSk) {
        return $q(function(resolve, reject) {
          try {
            // TODO: waiting for a new version of js-nacl, with missing functions expose
            //resolve(that.nacl.crypto_box_sk_from_sign_sk(signSk));
            resolve(crypto_box_sk_from_sign_sk(signSk));
          }
          catch(err) {
            reject(err);
          }
        });
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
          var messageBin = that.nacl.encode_utf8(message);
          if (typeof recipientPk === "string") {
            recipientPk = that.util.decode_base58(recipientPk);
          }

          try {
            var ciphertextBin = that.nacl.crypto_box(messageBin, nonce, recipientPk, senderSk);
            var ciphertext = that.util.encode_base64(ciphertextBin);
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
            resolve(that.nacl.decode_utf8(message));
          }
          catch (err) {
            reject(err);
          }

        });
      };

      /**
       * Create key pairs (sign and box), from salt+password (Scrypt auth)
       */
      this.scryptKeypair = function(salt, password, scryptParams) {
        return that.util.crypto_scrypt(
          that.util.encode_utf8(password),
          that.util.encode_utf8(salt),
          scryptParams && scryptParams.N || that.constants.SCRYPT_PARAMS.DEFAULT.N,
          scryptParams && scryptParams.r || that.constants.SCRYPT_PARAMS.DEFAULT.r,
          scryptParams && scryptParams.p || that.constants.SCRYPT_PARAMS.DEFAULT.p,
          that.constants.SEED_LENGTH)
          .then(function(seed){
            var signKeypair = that.nacl.crypto_sign_seed_keypair(seed);
            var boxKeypair = that.nacl.crypto_box_seed_keypair(seed);
            return {
              signPk: signKeypair.signPk,
              signSk: signKeypair.signSk,
              boxPk: boxKeypair.boxPk,
              boxSk: boxKeypair.boxSk
            };
          });
      };

      /**
       * Create key pairs from a seed
       */
      this.seedKeypair = function(seed) {
        return $q(function(resolve, reject) {
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
       * Get sign pk from salt+password (scrypt auth)
       */
      this.scryptSignPk = function(salt, password, scryptParams) {
        return $q(function(resolve, reject) {
          try {
            var seed = that.scrypt.crypto_scrypt(
              that.util.encode_utf8(password),
              that.util.encode_utf8(salt),
              scryptParams && scryptParams.N || that.constants.SCRYPT_PARAMS.DEFAULT.N,
              scryptParams && scryptParams.r || that.constants.SCRYPT_PARAMS.DEFAULT.r,
              scryptParams && scryptParams.p || that.constants.SCRYPT_PARAMS.DEFAULT.p,
              that.constants.SEED_LENGTH);
            var signKeypair = that.nacl.crypto_sign_seed_keypair(seed);
            resolve(signKeypair.signPk);
          }
          catch(err) {
            reject(err);
          }
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
          console.info('Reduce NaCl memory to 16mb,  because plateform grade is not [a] but [{0}]'.format(ionic.Platform.grade));
          naclOptions.requested_total_memory = 16 * 1048576; // 16 Mo
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
          that.scrypt.requested_total_memory = scryptOptions.requested_total_memory;
          checkAllLibLoaded();
        }, scryptOptions);
        this.async_load_base58(function(lib) {
          that.base58 = lib;
          checkAllLibLoaded();
        });
        that.async_load_base64(function(lib) {
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

      /*--
        start WORKAROUND - Publish missing functions (see PR js-nacl: https://github.com/tonyg/js-nacl/pull/54)
      -- */

      function crypto_box_keypair_from_sign_sk(sk) {
        var ska = check_injectBytes("crypto_box_keypair_from_sign_sk", "sk", sk,
          that.nacl.nacl_raw._crypto_sign_secretkeybytes());
        var skb = new Target(that.nacl.nacl_raw._crypto_box_secretkeybytes());
        check("_crypto_sign_ed25519_sk_to_curve25519",
          that.nacl.nacl_raw._crypto_sign_ed25519_sk_to_curve25519(skb.address, ska));
        FREE(ska);
        return that.nacl.crypto_box_keypair_from_raw_sk(skb.extractBytes());
      }

      function crypto_box_pk_from_sign_pk(pk) {
        var pka = check_injectBytes("crypto_box_pk_from_sign_pk", "pk", pk,
          that.nacl.nacl_raw._crypto_sign_publickeybytes());
        var pkb = new Target(that.nacl.nacl_raw._crypto_box_publickeybytes());
        check("_crypto_sign_ed25519_pk_to_curve25519",
          that.nacl.nacl_raw._crypto_sign_ed25519_pk_to_curve25519(pkb.address, pka));
        FREE(pka);
        return pkb.extractBytes();
      }

      function crypto_box_sk_from_sign_sk(sk) {
        var ska = check_injectBytes("crypto_box_sk_from_sign_sk", "sk", sk,
          that.nacl.nacl_raw._crypto_sign_secretkeybytes());
        var skb = new Target(that.nacl.nacl_raw._crypto_box_secretkeybytes());
        check("_crypto_sign_ed25519_sk_to_curve25519",
          that.nacl.nacl_raw._crypto_sign_ed25519_sk_to_curve25519(skb.address, ska));
        FREE(ska);
        return skb.extractBytes();
      }

      function check_length(function_name, what, thing, expected_length) {
        if (thing.length !== expected_length) {
          throw {message: "nacl." + function_name + " expected " +
              expected_length + "-byte " + what + " but got length " + thing.length};
        }
      }

      function check(function_name, result) {
        if (result !== 0) {
          throw {message: "nacl_raw." + function_name + " signalled an error"};
        }
      }

      function check_injectBytes(function_name, what, thing, expected_length, leftPadding) {
        check_length(function_name, what, thing, expected_length);
        return injectBytes(thing, leftPadding);
      }

      function injectBytes(bs, leftPadding) {
        var p = leftPadding || 0;
        var address = MALLOC(bs.length + p);
        that.nacl.nacl_raw.HEAPU8.set(bs, address + p);
        for (var i = address; i < address + p; i++) {
          that.nacl.nacl_raw.HEAPU8[i] = 0;
        }
        return address;
      }

      function MALLOC(nbytes) {
        var result = that.nacl.nacl_raw._malloc(nbytes);
        if (result === 0) {
          throw {message: "malloc() failed", nbytes: nbytes};
        }
        return result;
      }

      function FREE(pointer) {
        that.nacl.nacl_raw._free(pointer);
      }

      function free_all(addresses) {
        for (var i = 0; i < addresses.length; i++) {
          FREE(addresses[i]);
        }
      }

      function extractBytes(address, length) {
        var result = new Uint8Array(length);
        result.set(that.nacl.nacl_raw.HEAPU8.subarray(address, address + length));
        return result;
      }

      function Target(length) {
        this.length = length;
        this.address = MALLOC(length);
      }

      Target.prototype.extractBytes = function (offset) {
        var result = extractBytes(this.address + (offset || 0), this.length - (offset || 0));
        FREE(this.address);
        this.address = null;
        return result;
      };

      /*--
        end of WORKAROUND
      -- */

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
        var d = that.base58.decode(a);
        var b = new Uint8Array(d.length);
        for (i = 0; i < d.length; i++) b[i] = d[i];
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
      this.util.crypto_hash_sha256 = function (message) {
        return that.nacl.from_hex(that.sha256(message));
      };

      this.util.crypto_scrypt = function(password, salt, N, r, p, seedLength) {
        var deferred = $q.defer();
        that.nacl.crypto_pwhash_scryptsalsa208sha256_ll(
          password,
          salt,
          N,
          r,
          p,
          seedLength,
          function (err, seed) {
            if (err) { deferred.reject(err); return;}
            deferred.resolve(seed);
          }
        );
        return deferred.promise;
      };

      /**
       * Create key pairs (sign and box), from salt+password (Scrypt), using cordova
       */
      this.scryptKeypair = function(salt, password, scryptParams) {
        var deferred = $q.defer();

        that.nacl.crypto_pwhash_scryptsalsa208sha256_ll(
          that.nacl.from_string(password),
          that.nacl.from_string(salt),
          scryptParams && scryptParams.N || that.constants.SCRYPT_PARAMS.DEFAULT.N,
          scryptParams && scryptParams.r || that.constants.SCRYPT_PARAMS.DEFAULT.r,
          scryptParams && scryptParams.p || that.constants.SCRYPT_PARAMS.DEFAULT.p,
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
       * Create key pairs from a seed
       */
      this.seedKeypair = function(seed) {
        var deferred = $q.defer();

        that.nacl.crypto_sign_seed_keypair(seed, function (err, signKeypair) {
          if (err) { deferred.reject(err); return;}
          deferred.resolve({
            signPk: signKeypair.pk,
            signSk: signKeypair.sk
          });
        });
        return deferred.promise;
      };


      /**
       * Get sign PK from salt+password (Scrypt), using cordova
       */
      this.scryptSignPk = function(salt, password, scryptParams) {
        var deferred = $q.defer();

        that.nacl.crypto_pwhash_scryptsalsa208sha256_ll(
          that.nacl.from_string(password),
          that.nacl.from_string(salt),
          scryptParams && scryptParams.N || that.constants.SCRYPT_PARAMS.DEFAULT.N,
          scryptParams && scryptParams.r || that.constants.SCRYPT_PARAMS.DEFAULT.r,
          scryptParams && scryptParams.p || that.constants.SCRYPT_PARAMS.DEFAULT.p,
          that.constants.SEED_LENGTH,
          function (err, seed) {
            if (err) { deferred.reject(err); return;}

            that.nacl.crypto_sign_seed_keypair(seed, function (err, signKeypair) {
              if (err) { deferred.reject(err); return;}
              deferred.resolve(signKeypair.pk);
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
        if (signKeyPair.boxSk && signKeyPair.boxPk) return $q.when(signKeyPair);
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
       * Compute the box secret key, from a sign secret key
       */
      this.box_sk_from_sign = function(signSk) {
        var deferred = $q.defer();
        that.nacl.crypto_sign_ed25519_sk_to_curve25519(signSk, function(err, boxSk) {
          if (err) { deferred.reject(err); return;}
          deferred.resolve(boxSk);
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
          skFromSignSk: that.box_sk_from_sign,
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
    // removeIf(android)
    // removeIf(ios)
    isDevice = false;
    // endRemoveIf(ios)
    // endRemoveIf(android)

    //console.debug("[crypto] Created CryptotUtils service. device=" + isDevice);

    ionicReady().then(function() {
      console.debug('[crypto] Starting...');
      var now = Date.now();

      var serviceImpl;

      // Use Cordova plugin implementation, when exists
      if (isDevice && window.plugins && window.plugins.MiniSodium && crypto && crypto.getRandomValues) {
        console.debug('[crypto] Loading \'MiniSodium\' implementation...');
        serviceImpl = new CordovaServiceFactory();
      }
      else {
        console.debug('[crypto] Loading \'FullJS\' implementation...');
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
          console.debug('[crypto] Loaded \'{0}\' implementation in {1}ms'.format(service.id, Date.now() - now));
        });

    });

    return service;
  })
;
