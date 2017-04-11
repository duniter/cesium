angular.module('cesium.es.wallet.services', ['ngResource', 'cesium.wallet.services', 'cesium.device.services', 'cesium.crypto.services',
  'cesium.es.http.services'])

.factory('esWallet', function($q, $rootScope, CryptoUtils, Device, csWallet, esHttp) {
  'ngInject';

  var
    listeners,
    that = this;

  function onWalletReset(data) {
    if (data.keypair) {
      delete data.keypair.boxSk;
      delete data.keypair.boxPk;
    }
  }

  function getBoxKeypair(keypair) {
    keypair = keypair || (csWallet.isLogin() ? csWallet.data.keypair : undefined);
    if (!keypair) {
      throw new Error('User not connected, or no keypair found in wallet');
    }
    if (keypair.boxPk && keypair.boxSk) {
      return $q.when(keypair);
    }

    return $q.all([
        CryptoUtils.box.keypair.skFromSignSk(keypair.signSk),
        CryptoUtils.box.keypair.pkFromSignPk(keypair.signPk)
      ])
      .then(function(res) {
        csWallet.data.keypair.boxSk = res[0];
        csWallet.data.keypair.boxPk = res[1];
        console.debug("[ES] [wallet] Secret box keypair successfully computed");
        return csWallet.data.keypair;
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
                  console.warn('[ES] [wallet] a record may have invalid cypher ' + cypherFieldName);
                  record.valid = false;
                }));
            }, []));
        }, []));
      })
      .then(function() {
        console.debug('[ES] [wallet] All record decrypted in ' + (new Date().getTime() - now) + 'ms');
        return records;
      });

  }

  function addListeners() {
    // Extend csWallet events
    listeners = [
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [wallet] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [wallet] Enable");
      addListeners();
    }
  }

  // Default action
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // exports
  that.box = {
    getKeypair: getBoxKeypair,
    record: {
      pack: packRecordFields,
      open: openRecordFields
    }
  };

  return that;
})
;
