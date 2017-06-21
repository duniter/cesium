angular.module('cesium.es.crypto.services', ['ngResource', 'cesium.services'])

.factory('esCrypto', function($q, $rootScope, CryptoUtils) {
  'ngInject';


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

    var now = new Date().getTime();
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
        console.debug('[ES] [crypto] All record decrypted in ' + (new Date().getTime() - now) + 'ms');
        return records;
      });

  }

  // exports
  return {
    box: {
      getKeypair: getBoxKeypair,
      pack: packRecordFields,
      open: openRecordFields
    }
  };
})
;
