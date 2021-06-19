angular.module('cesium.crypto.services', ['cesium.utils.services'])

  /* -----------------------------
     Crypto advanced service for Cesium
   */
  .factory('csCrypto', function($q, $rootScope, $timeout, CryptoUtils, UIUtils, Modals) {
    'ngInject';

    function test(regexpContent) {
      return new RegExp(regexpContent);
    }

    function concat_Uint8Array( buffer1, buffer2 ) {
      var tmp = new Uint8Array( buffer1.byteLength + buffer2.byteLength );
      tmp.set( new Uint8Array( buffer1 ), 0 );
      tmp.set( new Uint8Array( buffer2 ), buffer1.byteLength );
      return tmp;
    }

    var constants = {
      WIF: {
        DATA_LENGTH: 35
      },
      EWIF: {
        SALT_LENGTH: 4,
        DERIVED_HALF_LENGTH: 16,
        DATA_LENGTH: 39,
        SCRYPT_PARAMS: {
          N: 16384,
          r: 8,
          p: 8
        }
      },
      REGEXP: {
        PUBKEY: '[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}',
        SECKEY: '[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{86,88}',
        FILE: {
        TYPE_LINE: '^Type: ([a-zA-Z0-9]+)\n',
          VERSION: 'Version: ([0-9]+)\n',
          PUB: '[Pp]ub: ([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44})\n',
          SEC: '[Ss]ec: ([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{86,88})(\n|$)',
          DATA: '[Dd]ata: ([123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+)(\n|$)'
        }
      }
    },
    regexp = {
      FILE: {
        TYPE_LINE: test(constants.REGEXP.FILE.TYPE_LINE),
        VERSION: test(constants.REGEXP.FILE.VERSION),
        PUB: test(constants.REGEXP.FILE.PUB),
        SEC: test(constants.REGEXP.FILE.SEC),
        DATA: test(constants.REGEXP.FILE.DATA)
      }
    },
    errorCodes = {
      BAD_PASSWORD: 3001,
      BAD_CHECKSUM: 3002
    };

    /* -- keyfile -- */

    function readKeyFile(file, options) {

      if (file && file.content) {
        return parseKeyFileContent(file.content, options);
      }

      return $q(function(resolve, reject) {
        if (!file) {
          return reject('Argument [file] is missing');
        }

        //console.debug('[crypto] [keypair] reading file: ', file);
        var reader = new FileReader();
        reader.onload = function (event) {
          parseKeyFileContent(event.target.result, options)
            .then(resolve)
            .catch(reject);
        };
        reader.readAsText(file, 'utf8');
      });
    }

    function parseKeyFileContent(content, options) {

      if (!content) return $q.reject('Argument [content] is missing');

      options = options || {};
      options.withSecret = angular.isDefined(options.withSecret) ? options.withSecret : false;
      options.defaultType = options.defaultType || 'PubSec';

      var matches;

      var typeMatch = regexp.FILE.TYPE_LINE.exec(content);

      // If no Type field: add default type
      var type = typeMatch && typeMatch[1];
      if (!type && options.defaultType) {
        return parseKeyFileContent('Type: {0}\n{1}'.format(options.defaultType, content), options);
      }

      // Type: PubSec
      if (type == 'PubSec') {

        // Read Pub field
        matches = regexp.FILE.PUB.exec(content);
        if (!matches) return $q.reject('Missing [pub] field in file, or invalid public key value');
        var signKeypair = {
          signPk: CryptoUtils.base58.decode(matches[1])
        };
        if (!options.withSecret) return $q.resolve(signKeypair);

        // Read Sec field
        matches= regexp.FILE.SEC.exec(content);
        if (!matches) return $q.reject('Missing [sec] field in file, or invalid secret key value');
        signKeypair.signSk = CryptoUtils.base58.decode(matches[1]);
        return $q.resolve(signKeypair);
      }

      // Type: WIF or EWIF
      else if (type == 'WIF' || type == 'EWIF') {
        matches = regexp.FILE.DATA.exec(content);
        if (!matches) {
          return $q.reject('Missing [Data] field in file. This is required for WIF or EWIF format');
        }

        return parseWIF_or_EWIF(matches[1], {
          type: type,
          password: options.password
        })
          .then(function(signKeypair) {
            return signKeypair && !options.withSecret ? {signPk: signKeypair.signPk} : signKeypair;
          });
      }

      // Type: unknown
      if (options.defaultType) {
        return $q.reject('Bad file format: missing Type field');
      }
      else {
        return $q.reject('Bad file format, unknown type [' + type + ']');
      }
    }


    /**
     *
     * @param data_base58
     * @param options
     * @returns {*}
     */
    function parseWIF_or_EWIF(data_base58, options) {
      options = options || {};

      var data_int8 = data_base58 && CryptoUtils.base58.decode(data_base58);
      if (!data_int8 || data_int8.length != constants.EWIF.DATA_LENGTH && data_int8.length != constants.WIF.DATA_LENGTH) {
        return $q.reject('Invalid WIF or EWIF format (invalid bytes count).');
      }

      // Detect the type from the first byte
      options.type = options.type || (data_int8[0] == 1 && 'WIF') || (data_int8[0] == 2 && 'EWIF');

      // Type: WIF
      if (options.type == 'WIF') {
        return parseWIF_v1(data_base58);
      }

      // Type: EWIF
      if (options.type == 'EWIF') {

        // If not set, resolve password using the given callback
        if (typeof options.password == "function") {
          //console.debug("[crypto] [EWIF] Executing 'options.password()' to resolve the password...");
          options.password = options.password();
          if (!options.password) {
            return $q.reject({message: "Invalid callback result for 'options.password()': must return a promise or a string."});
          }
        }

        // If password is a promise, get the result then read data
        if (typeof options.password === "object" && options.password.then) {
          return options.password.then(function(password) {
            if (!password) throw 'CANCELLED';
            return parseEWIF_v1(data_base58, password);
          });
        }

        // If password is a valid string, read data
        if (typeof options.password == "string") {
          return parseEWIF_v1(data_base58, options.password);
        }

        return $q.reject({message: 'Invalid EWIF options.password. Waiting a callback function, a promise or a string.'});
      }

      // Unknown type
      return $q.reject({message: 'Invalid WIF or EWIF format: unknown first byte identifier.'});
    }


    function parseWIF_v1(wif_base58) {
      var wif_int8 = CryptoUtils.util.decode_base58(wif_base58);

      // Check identifier byte = 0x01
      if (wif_int8[0] != 1) {
        return $q.reject({message: 'Invalid WIF v1 format: expected [0x01] as first byte'});
      }

      // Check length
      if (wif_int8.length != constants.WIF.DATA_LENGTH) {
        return $q.reject({message: 'Invalid WIF v1 format: Data must be a '+constants.WIF.DATA_LENGTH+' bytes array, encoded in base 58.'});
      }

      var wif_int8_no_checksum = wif_int8.slice(0, -2),
        seed = wif_int8.slice(1, -2),
        checksum =  wif_int8.slice(-2);

      // Compute expected checksum
      var expectedChecksum = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(wif_int8_no_checksum)).slice(0,2);
      if (CryptoUtils.util.encode_base58(checksum) != CryptoUtils.util.encode_base58(expectedChecksum)) {
        $q.reject({message: 'Invalid WIF format: bad checksum'});
      }

      // Generate keypair from seed
      return CryptoUtils.seedKeypair(seed);
    }

    function parseEWIF_v1(ewif_base58, password) {
      var ewif_int8 = CryptoUtils.util.decode_base58(ewif_base58);

      // Check identifier byte = 0x02
      if (ewif_int8[0] != 2) {
        return $q.reject({message: 'Invalid EWIF v1 format: Expected [0x02] as first byte'});
      }

      // Check length
      if (ewif_int8.length != constants.EWIF.DATA_LENGTH) {
        return $q.reject({message: 'Invalid EWIF v1 format: Expected {0} bytes, encoded in base 58.'.format(constants.EWIF.DATA_LENGTH)});
      }

      var ewif_int8_no_checksum = ewif_int8.slice(0,-2);
      var checksum = ewif_int8.slice(-2);
      var salt = ewif_int8.slice(1,5);
      var encryptedhalf1 = ewif_int8.slice(5,21);
      var encryptedhalf2 = ewif_int8.slice(21,37);

      // Retrieve the scrypt_seed
      return CryptoUtils.util.crypto_scrypt(
        CryptoUtils.util.encode_utf8(password),
        salt,
        constants.EWIF.SCRYPT_PARAMS.N,
        constants.EWIF.SCRYPT_PARAMS.r,
        constants.EWIF.SCRYPT_PARAMS.p,
        64)

      // Compute the final seed
        .then(function(scrypt_seed) {

          var derivedhalf1 = scrypt_seed.slice(0, 32);
          var derivedhalf2 = scrypt_seed.slice(32, 64);

          //AES
          var aesEcb = new aesjs.ModeOfOperation.ecb(derivedhalf2);
          var decryptedhalf1 = aesEcb.decrypt(encryptedhalf1);
          var decryptedhalf2 = aesEcb.decrypt(encryptedhalf2);

          decryptedhalf1 = new Uint8Array(decryptedhalf1);
          decryptedhalf2 = new Uint8Array(decryptedhalf2);

          // xor
          var seed1 = CryptoUtils.util.xor(decryptedhalf1, derivedhalf1.slice(0, 16));
          var seed2 = CryptoUtils.util.xor(decryptedhalf2, derivedhalf1.slice(16, 32));
          var seed = concat_Uint8Array(seed1, seed2);

          return seed;
        })

        // Get the keypair, from the seed
        .then(CryptoUtils.seedKeypair)

        // Do some controls
        .then(function(keypair) {

          // Check salt
          var expectedSalt = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(keypair.signPk)).slice(0,4);
          if(CryptoUtils.util.encode_base58(salt) !== CryptoUtils.util.encode_base58(expectedSalt)) {
            throw {ucode: errorCodes.BAD_PASSWORD, message: 'ACCOUNT.SECURITY.KEYFILE.ERROR.BAD_PASSWORD'};
          }

          // Check checksum
          var expectedChecksum = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(ewif_int8_no_checksum)).slice(0,2);
          if (CryptoUtils.util.encode_base58(checksum) != CryptoUtils.util.encode_base58(expectedChecksum)) {
            throw {ucode: errorCodes.BAD_CHECKSUM, message: 'ACCOUNT.SECURITY.KEYFILE.ERROR.BAD_CHECKSUM'};
          }

          return keypair;
        });
    }


    function wif_v1_from_keypair(keypair) {

      var seed = CryptoUtils.seed_from_signSk(keypair.signSk);
      if (!seed || seed.byteLength !== CryptoUtils.constants.SEED_LENGTH)
        throw "Bad see format. Expected {0} bytes".format(CryptoUtils.constants.SEED_LENGTH);

      var fi = new Uint8Array(1);
      fi[0] = 0x01;
      var seed_fi = concat_Uint8Array(fi, seed);

      // checksum
      var checksum = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(seed_fi)).slice(0,2);

      var wif_int8 = concat_Uint8Array(seed_fi, checksum);
      return $q.when(CryptoUtils.util.encode_base58(wif_int8));
    }

    function ewif_v1_from_keypair(keypair, password) {

      var seed = CryptoUtils.seed_from_signSk(keypair.signSk);
      if (!seed || seed.byteLength !== CryptoUtils.constants.SEED_LENGTH)
        return $q.reject({message: "Bad see format. Expected {0} bytes".format(CryptoUtils.constants.SEED_LENGTH)});

      // salt
      var salt = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(keypair.signPk)).slice(0,4);

      // scrypt_seed
      return CryptoUtils.util.crypto_scrypt(
        CryptoUtils.util.encode_utf8(password),
        salt,
        constants.EWIF.SCRYPT_PARAMS.N,
        constants.EWIF.SCRYPT_PARAMS.r,
        constants.EWIF.SCRYPT_PARAMS.p,
        64)
        .then(function(scrypt_seed) {
          var derivedhalf1 = scrypt_seed.slice(0,32);
          var derivedhalf2 = scrypt_seed.slice(32,64);

          //XOR & AES
          var seed1_xor_derivedhalf1_1 = CryptoUtils.util.xor(seed.slice(0,16), derivedhalf1.slice(0,16));
          var seed2_xor_derivedhalf1_2 = CryptoUtils.util.xor(seed.slice(16,32), derivedhalf1.slice(16,32));

          var aesEcb = new aesjs.ModeOfOperation.ecb(derivedhalf2);
          var encryptedhalf1 = aesEcb.encrypt(seed1_xor_derivedhalf1_1);
          var encryptedhalf2 = aesEcb.encrypt(seed2_xor_derivedhalf1_2);

          encryptedhalf1 = new Uint8Array(encryptedhalf1);
          encryptedhalf2 = new Uint8Array(encryptedhalf2);

          // concatenate ewif
          var ewif_int8 = new Uint8Array(1);
          ewif_int8[0] = 0x02;
          ewif_int8 = concat_Uint8Array(ewif_int8,salt);
          ewif_int8 = concat_Uint8Array(ewif_int8,encryptedhalf1);
          ewif_int8 = concat_Uint8Array(ewif_int8,encryptedhalf2);

          var checksum = CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(ewif_int8)).slice(0,2);
          ewif_int8 = concat_Uint8Array(ewif_int8,checksum);

          return CryptoUtils.util.encode_base58(ewif_int8);
        });
    }

    function generateKeyFileContent(keypair, options) {
      options = options || {};
      options.type = options.type || "PubSec";

      switch(options.type) {

        // PubSec
        case "PubSec" :
          return $q.resolve(
            "Type: PubSec\n" +
            "Version: 1\n" +
            "pub: " + CryptoUtils.base58.encode(keypair.signPk) + "\n" +
            "sec: " + CryptoUtils.base58.encode(keypair.signSk) + "\n");

        // WIF - v1
        case "WIF" :
          return wif_v1_from_keypair(keypair)
            .then(function(data) {
              return "Type: WIF\n" +
                "Version: 1\n" +
                "Data: " + data + "\n";
            });

        // EWIF - v1
        case "EWIF" :

          if (!options.password) return $q.reject({message: 'Missing EWIF options.password.'});

          // If not set, resolve password using the given callback
          if (options.password && typeof options.password == "function") {
            console.debug("[crypto] [EWIF] Executing 'options.password()' to resolve the password...");
            options.password = options.password();
            if (!options.password) {
              return $q.reject({message: "Invalid callback result for 'options.password()': must return a promise or a string."});
            }
          }

          // If password is a promise, get the result then read data
          if (options.password && typeof options.password == "object" && options.password.then) {
            return options.password.then(function(password) {
              if (!password) throw 'CANCELLED';
              // Recursive call, with the string password in options
              return generateKeyFileContent(keypair, angular.merge({}, options, {password: password}));
            });
          }

          // If password is a valid string, read data
          if (options.password && typeof options.password == "string") {
            return ewif_v1_from_keypair(keypair, options.password)
              .then(function(data) {
                return "Type: EWIF\n" +
                  "Version: 1\n" +
                  "Data: " + data + "\n";
              });
          }

          return $q.reject({message: 'Invalid EWIF options.password. Waiting a callback function, a promise or a string.'});

        default:
          return $q.reject({message: "Unknown keyfile format: " + options.type});
      }
    }



    /* -- usefull methods -- */

    function pkChecksum(pubkey) {
      var signPk_int8 = CryptoUtils.util.decode_base58(pubkey);
      return CryptoUtils.util.encode_base58(CryptoUtils.util.crypto_hash_sha256(CryptoUtils.util.crypto_hash_sha256(signPk_int8))).substring(0,3);
    }

    /* -- box (pack/unpack a record) -- */

    function getBoxKeypair(keypair) {
      if (!keypair) {
        throw new Error('Missing keypair');
      }
      if (keypair.boxPk && keypair.boxSk) {
        return $q.when(keypair);
      }

      return $q.all([
        CryptoUtils.box.keypair.skFromSignSk(keypair.signSk),
        CryptoUtils.box.keypair.pkFromSignPk(keypair.signPk)
      ])
        .then(function(res) {
          return {
            boxSk: res[0],
            boxPk: res[1]
          };
        });
    }

    function packRecordFields(record, keypair, recipientFieldName, cypherFieldNames, nonce) {

      recipientFieldName = recipientFieldName || 'recipient';
      if (!record[recipientFieldName]) {
        return $q.reject({message:'ES_WALLET.ERROR.RECIPIENT_IS_MANDATORY'});
      }

      cypherFieldNames = cypherFieldNames || 'content';
      if (typeof cypherFieldNames == 'string') {
        cypherFieldNames = [cypherFieldNames];
      }

      // Work on a copy, to keep the original record (as it could be use again - fix #382)
      record = angular.copy(record);

      // Get recipient
      var recipientPk = CryptoUtils.util.decode_base58(record[recipientFieldName]);

      return $q.all([
        getBoxKeypair(keypair),
        CryptoUtils.box.keypair.pkFromSignPk(recipientPk),
        nonce ? $q.when(nonce) : CryptoUtils.util.random_nonce()
      ])
        .then(function(res) {
          //var senderSk = res[0];
          var boxKeypair = res[0];
          var senderSk = boxKeypair.boxSk;
          var boxRecipientPk = res[1];
          var nonce = res[2];

          return $q.all(
            cypherFieldNames.reduce(function(res, fieldName) {
              if (!record[fieldName]) return res; // skip undefined fields
              return res.concat(
                CryptoUtils.box.pack(record[fieldName], nonce, boxRecipientPk, senderSk)
              );
            }, []))

            .then(function(cypherTexts){
              // Replace field values with cypher texts
              var i = 0;
              _.forEach(cypherFieldNames, function(cypherFieldName) {
                if (!record[cypherFieldName]) {
                  // Force undefined fields to be present in object
                  // This is better for ES storage, that always works on lazy update mode
                  record[cypherFieldName] = null;
                }
                else {
                  record[cypherFieldName] = cypherTexts[i++];
                }
              });

              // Set nonce
              record.nonce = CryptoUtils.util.encode_base58(nonce);

              return record;
            });
        });
    }

    function openRecordFields(records, keypair, issuerFieldName, cypherFieldNames) {

      issuerFieldName = issuerFieldName || 'issuer';
      cypherFieldNames = cypherFieldNames || 'content';
      if (typeof cypherFieldNames == 'string') {
        cypherFieldNames = [cypherFieldNames];
      }

      var now = Date.now();
      var issuerBoxPks = {}; // a map used as cache

      var jobs = [getBoxKeypair(keypair)];
      return $q.all(records.reduce(function(jobs, message) {
        var issuer = message[issuerFieldName];
        if (!issuer) {throw 'Record has no ' + issuerFieldName;}
        if (issuerBoxPks[issuer]) return res;
        return jobs.concat(
          CryptoUtils.box.keypair.pkFromSignPk(CryptoUtils.util.decode_base58(issuer))
            .then(function(issuerBoxPk) {
              issuerBoxPks[issuer] = issuerBoxPk; // fill box pk cache
            }));
      }, jobs))
        .then(function(res){
          var boxKeypair = res[0];
          return $q.all(records.reduce(function(jobs, record) {
            var issuerBoxPk = issuerBoxPks[record[issuerFieldName]];
            var nonce = CryptoUtils.util.decode_base58(record.nonce);
            record.valid = true;

            return jobs.concat(
              cypherFieldNames.reduce(function(res, cypherFieldName) {
                if (!record[cypherFieldName]) return res;
                return res.concat(CryptoUtils.box.open(record[cypherFieldName], nonce, issuerBoxPk, boxKeypair.boxSk)
                  .then(function(text) {
                    record[cypherFieldName] = text;
                  })
                  .catch(function(err){
                    console.error(err);
                    console.warn('[ES] [crypto] a record may have invalid cypher ' + cypherFieldName);
                    record.valid = false;
                  }));
              }, []));
          }, []));
        })
        .then(function() {
          console.debug('[ES] [crypto] All record decrypted in ' + (Date.now() - now) + 'ms');
          return records;
        });

    }

    function parseKeyFileData(data, options){
      options = options || {};
      options.withSecret = angular.isDefined(options.withSecret) ? options.withSecret : true;
      options.silent = angular.isDefined(options.withSecret) ? options.silent : false;
      options.password = function() {
        return UIUtils.loading.hide(100)
          .then(function() {
            return Modals.showPassword({
              title: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.TITLE',
              subTitle: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.HELP',
              error: options.error,
              scope: options.scope
            });
          })
          .then(function(password) {
            // Timeout is need to force popup to be hide
            return $timeout(function() {
              if (password) UIUtils.loading.show();
              return password;
            }, 150);
          });
      };

      if (!options.silent) {
        UIUtils.loading.show();
      }

      return parseWIF_or_EWIF(data, options)
        .then(function(res){
          return res;
        })
        .catch(function(err) {
          if (err && err === 'CANCELLED') return;
          if (err && err.ucode == errorCodes.BAD_PASSWORD) {
            // recursive call
            return parseKeyFileData(data, {withSecret: options.withSecret, error: 'ACCOUNT.SECURITY.KEYFILE.ERROR.BAD_PASSWORD'});
          }
          console.error("[crypto] Unable to parse as WIF or EWIF format: " + (err && err.message || err));
          throw err; // rethrow
        });
    }

    // exports
    return {
      errorCodes: errorCodes,
      constants: constants,
      // copy CryptoUtils
      util: angular.extend({
          pkChecksum: pkChecksum
        }, CryptoUtils.util),
      keyfile: {
        read: readKeyFile,
        parseData: parseKeyFileData,
        generateContent: generateKeyFileContent
      },
      box: {
        getKeypair: getBoxKeypair,
        pack: packRecordFields,
        open: openRecordFields
      }
    };
  })
;
