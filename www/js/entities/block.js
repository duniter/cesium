/**
 * Created by blavenie on 01/02/17.
 */
function Block(json, attributes) {
  "use strict";

  var that = this;

  // Copy default fields
  if (!attributes || !attributes.length) {
    ["currency", "issuer", "medianTime", "number", "version", "powMin", "dividend", "membersCount", "hash", "identities", "joiners", "actives", "leavers", "revoked", "excluded", "certifications", "transactions"]
      .forEach(function (key) {
      that[key] = json[key];
    });
  }
  // or just given
  else {
    _.forEach(attributes, function (key) {
      that[key] = json[key];
    });

  }

  that.identitiesCount = that.identities ? that.identities.length : 0;
  that.joinersCount = that.joiners ? that.joiners.length : 0;
  that.activesCount = that.actives ? that.actives.length : 0;
  that.leaversCount = that.leavers ? that.leavers.length : 0;
  that.revokedCount = that.revoked ? that.revoked.length : 0;
  that.excludedCount = that.excluded ? that.excluded.length : 0;
  that.certificationsCount = that.certifications ? that.certifications.length : 0;
  that.transactionsCount = that.transactions ? that.transactions.length : 0;

  that.empty = that.isEmpty();
}

Block.prototype.isEmpty = function(){
  "use strict";
  return !this.transactionsCount &&
    !this.certificationsCount &&
    !this.joinersCount &&
    !this.dividend &&
    !this.activesCount &&
    !this.identitiesCount &&
    !this.leaversCount &&
    !this.excludedCount &&
    !this.revokedCount;
};

Block.prototype.parseData = function() {
  this.identities = this.parseArrayValues(this.identities, ['pubkey', 'signature', 'buid', 'uid']);
  this.joiners = this.parseArrayValues(this.joiners, ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.actives = this.parseArrayValues(this.actives, ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.leavers = this.parseArrayValues(this.leavers, ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.revoked = this.parseArrayValues(this.revoked, ['pubkey', 'signature']);
  this.excluded = this.parseArrayValues(this.excluded, ['pubkey']);

  // certifications
  this.certifications = this.parseArrayValues(this.certifications, ['from', 'to', 'block', 'signature']);
  //this.certifications = _.groupBy(this.certifications, 'to');

  // TX
  this.transactions = this.parseTransactions(this.transactions);

  delete this.raw; // not need
};

Block.prototype.cleanData = function() {
  delete this.identities;
  delete this.joiners;
  delete this.actives;
  delete this.leavers;
  delete this.revoked;
  delete this.excluded;
  delete this.certifications;
  delete this.transactions;

  delete this.raw; // not need
};

Block.prototype.parseArrayValues = function(array, itemObjProperties){
  if (!array || !array.length) return [];
  return array.reduce(function(res, raw) {
    var parts = raw.split(':');
    if (parts.length != itemObjProperties.length) {
      console.debug('[block] Bad format for \'{0}\': [{1}]. Expected {1} parts. Skipping'.format(arrayProperty, raw, itemObjProperties.length));
      return res;
    }
    var obj = {};
    for (var i=0; i<itemObjProperties.length; i++) {
      obj[itemObjProperties[i]] = parts[i];
    }
    return res.concat(obj);
  }, []);
};

function exact(regexpContent) {
  return new RegExp("^" + regexpContent + "$");
}

Block.prototype.regexp = {
  TX_OUTPUT_SIG: exact("SIG\\(([0-9a-zA-Z]{43,44})\\)")
};

Block.prototype.parseTransactions = function(transactions) {
  if (!transactions || !transactions.length) return [];
  return transactions.reduce(function (res, tx) {
    var obj = {
      issuers: tx.issuers,
      time: tx.time
    };

    obj.outputs = tx.outputs.reduce(function(res, output) {
      var parts = output.split(':');
      if (parts.length != 3) {
        console.debug('[block] Bad format a \'transactions\': [{0}]. Expected 3 parts. Skipping'.format(output));
        return res;
      }

      var amount = parts[0];
      var unitbase = parts[1];
      var unlockCondition = parts[2];

      var matches =  Block.prototype.regexp.TX_OUTPUT_SIG.exec(parts[2]);

      // Simple expression SIG(x)
      if (matches) {
        var pubkey = matches[1];
        if (!tx.issuers || tx.issuers.indexOf(pubkey) != -1) return res;
        return res.concat({
          amount: unitbase <= 0 ? amount : amount * Math.pow(10, unitbase),
          unitbase: unitbase,
          pubkey: pubkey
        });
      }

      // Parse complex unlock condition
      else {
        //console.debug('[block] [TX] Detecting unlock condition: {0}.'.format(output));
        return res.concat({
          amount: unitbase <= 0 ? amount : amount * Math.pow(10, unitbase),
          unitbase: unitbase,
          unlockCondition: unlockCondition
        });
      }
    }, []);

    // Special cas for TX to himself
    if (!obj.error && !obj.outputs.length) {
      obj.toHimself = true;
    }

    return res.concat(obj);
  }, []);
};
