/**
 * Created by blavenie on 01/02/17.
 */
function Block(json) {
  "use strict";

  var that = this;

  Object.keys(json).forEach(function (key) {
    that[key] = json[key];
  });

  that.empty = that.isEmpty();

  this.transformArrayValue('identities', ['pubkey', 'signature', 'buid', 'uid']);
  this.transformArrayValue('joiners', ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.transformArrayValue('actives', ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.transformArrayValue('leavers', ['pubkey', 'signature', 'mBuid', 'iBuid', 'uid']);
  this.transformArrayValue('revoked', ['pubkey', 'signature']);
  this.transformArrayValue('excluded', ['pubkey']);
  this.transformArrayValue('certifications', ['from', 'toPubkey', 'block', 'signature']);

  if (this.transactions && this.transactions.length) {
    this.transactions = this.transactions.reduce(function(res, tx) {
      var result = {
        issuers: tx.issuers,
        time: tx.time
      };
      // TODO compute amount
      // TODO compute dest

      return res.concat(result);
    }, []);
  }
}

Block.prototype.regex = {

};

Block.prototype.isEmpty = function(){
  "use strict";
  return !this.transactionsCount &&
    !this.certificationsCount &&
    !this.joinersCount &&
    !this.activesCount &&
    !this.identitiesCount &&
    !this.leaversCount &&
    !this.excludedCount &&
    !this.revokedCount
    ;
};

Block.prototype.transformArrayValue = function(arrayProperty, itemObjProperties){
  if (!this[arrayProperty] || !this[arrayProperty].length) return;
  var result = this[arrayProperty].reduce(function(res, raw) {
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

  // TODO apply a sort ?

  // Replace current array
  this[arrayProperty] = result;
};

// Identities
Object.defineProperties(Block.prototype, {"identitiesCount": {
  get: function() {
    return this.identities ? this.identities.length : 0;
  }
}});

// Joiners
Object.defineProperties(Block.prototype, {"joinersCount": {
  get: function() {
    return this.joiners ? this.joiners.length : 0;
  }
}});

// Actives
Object.defineProperties(Block.prototype, {"activesCount": {
  get: function() {
    return this.actives ? this.actives.length : 0;
  }
}});


Object.defineProperties(Block.prototype, {"leaversCount": {
  get: function() {
    return this.leavers ? this.leavers.length : 0;
  }
}});

Object.defineProperties(Block.prototype, {"certificationsCount": {
  get: function() {
    return this.certifications ? this.certifications.length : 0;
  }
}});

Object.defineProperties(Block.prototype, {"excludedCount": {
  get: function() {
    return this.excluded ? this.excluded.length : 0;
  }
}});

Object.defineProperties(Block.prototype, {"revokedCount": {
  get: function() {
    return this.revoked ? this.revoked.length : 0;
  }
}});

Object.defineProperties(Block.prototype, {"transactionsCount": {
  get: function() {
    return this.transactions ? this.transactions.length : 0;
  }
}});
