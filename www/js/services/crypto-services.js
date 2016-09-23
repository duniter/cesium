//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.crypto.services', ['ngResource', 'cesium.device.services'])

.factory('CryptoUtils', function($q, $timeout, Device) {
  'ngInject';

  var async_load_scrypt = function(on_ready) {
      if (typeof module !== 'undefined' && module.exports) {
          // add node.js implementations
          require('scrypt-em');
          return on_ready(scrypt_module_factory());
      }
      else if (scrypt_module_factory !== null){
          return on_ready(scrypt_module_factory());
      }
      else {
          return $timeout(function(){async_load_scrypt(on_ready);}, 100);
      }
  },

  async_load_nacl = function(on_ready, options) {
    if (typeof module !== 'undefined' && module.exports) {
      // add node.js implementations
      require('nacl_factory');
      nacl_factory.instantiate(on_ready, options);
    }
    else if (nacl_factory !== null){
      nacl_factory.instantiate(on_ready, options);
    }
    else {
      $timeout(function(){async_load_nacl(on_ready, options);}, 100);
    }
  },

  async_load_base58 = function(on_ready) {
      if (typeof module !== 'undefined' && module.exports) {
          // add node.js implementations
          require('base58');
          return on_ready(Base58);
      }
      else if (Base58 !== null){
          return on_ready(Base58);
      }
      else {
          $timeout(function(){async_load_base58(on_ready);}, 100);
      }
  },

  async_load_base64 = function(on_ready) {
      if (typeof module !== 'undefined' && module.exports) {
          // add node.js implementations
          require('base58');
        on_ready(Base64);
      }
      else if (Base64 !== null){
        on_ready(Base64);
      }
      else {
         $timetout(function(){async_load_base64(on_ready);}, 100);
      }
  };

  function CryptoUtils() {
    var
      // Const
      crypto_sign_BYTES= 64,
      crypto_secretbox_KEYBYTES= 32,
      SEED_LENGTH= 32, // Length of the key
      SCRYPT_PARAMS= {
              "N":4096,
              "r":16,
              "p":1
            },

      // libraries handlers
      scrypt,
      nacl,
      base58,
      base64,

      // functions
      decode_utf8 = function(s) {
          var i, d = unescape(encodeURIComponent(s)), b = new Uint8Array(d.length);
          for (i = 0; i < d.length; i++) b[i] = d.charCodeAt(i);
          return b;
      },
      encode_utf8 = function(arguments) {
        return nacl.encode_utf8(arguments);
      },
      encode_base58 = function(a) {
        return base58.encode(a);
      },
      decode_base58 = function(a) {
        var i, a = base58.decode(a);
        var b = new Uint8Array(a.length);
        for (i = 0; i < a.length; i++) b[i] = a[i];
        return b;
      },
      hash_sha256 = function(message) {
        return $q(function(resolve, reject) {
          var msg = decode_utf8(message);
          var hash = nacl.to_hex(nacl.crypto_hash_sha256(msg));
          resolve(hash.toUpperCase());
        });
      },
      random_nonce = function() {
        return nacl.crypto_box_random_nonce();
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
      * Create a key pair, from salt+password, and  return a wallet object
      */
      connect = function(salt, password) {
            return $q(function(resolve, reject) {
                var seed = scrypt.crypto_scrypt(
                                            nacl.encode_utf8(password),
                                            nacl.encode_utf8(salt),
                                            4096, 16, 1, SEED_LENGTH // TODO: put in var SCRYPT_PARAMS
                                         );
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
      return nacl.crypto_box_keypair_from_sign_sk(signKeyPair.signSk);
    },

    /**
     * Compute the box public key, from a sign public key
     */
    box_pk_from_sign = function(signPk) {
      return nacl.crypto_box_pk_from_sign_pk(signPk);
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
          recipientPk = CryptoUtils.util.decode_base58(recipientPk);
        }

        //console.debug('Original message: ' + message);
        message = nacl.encode_utf8(message);

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
    };

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
    };

    // We use 'Device.ready()' instead of '$ionicPlatform.ready()', because it could be call many times
    Device.ready()
      .then(function() {
        console.debug('Loading NaCl...');
        var now = new Date().getTime();
        var naclOptions;
        if (ionic.Platform.grade.toLowerCase()!='a') {
          console.log('Reduce NaCl memory because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
          naclOptions = {
            requested_total_memory: 16777216
          };
        }
        async_load_nacl(function(lib) {
          nacl = lib;
          console.debug('Loaded NaCl in ' + (new Date().getTime() - now) + 'ms');
        }, naclOptions);
      });


    async_load_scrypt(function(lib) {
      scrypt = lib;
    });
    async_load_base58(function(lib) {
      base58 = lib;
    });
    async_load_base64(function(lib) {
      base64 = lib;
    });
    // Service's exposed methods
    return {
        /*
        TODO: uncomment if need to expose
        nacl: nacl,
        scrypt: scrypt,
        base58: base58,
        base64: base64,*/
        util: {
          encode_utf8: encode_utf8,
          decode_utf8: decode_utf8,
          encode_base58: encode_base58,
          decode_base58: decode_base58,
          hash: hash_sha256,
          encode_base64: base64.encode,
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
        //,isCompatible: isCompatible
     };
  }

  var service = CryptoUtils();
  service.instance = CryptoUtils;
  return service;
})
;
