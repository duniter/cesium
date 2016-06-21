//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.crypto.services', ['ngResource'])

.factory('CryptoUtils', function($q, $timeout) {
  'ngInject';

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
              },

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
        hash_sha256 = function(message) {
          return $q(function(resolve, reject) {
            var msg = decode_utf8(message);
            var hash = nacl.to_hex(nacl.crypto_hash_sha256(msg));
            resolve(hash.toUpperCase());
          });
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
            });
        };

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
            encode_base58: encode_base58,
            hash: hash_sha256
          },
          connect: connect,
          sign: sign,
          verify: verify
          //,isCompatible: isCompatible
       };
    }

    var service = CryptoUtils();
    service.instance = CryptoUtils;
  return service;
})
;
