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
}

Block.prototype.regex = {

};

Block.prototype.isEmpty = function(){
  "use strict";
  return !this.transactionsCount &&
    !this.certificationsCount &&
    !this.joinersCount &&
    !this.identitiesCount &&
    !this.leaversCount &&
    !this.excludedCount &&
    !this.revokedCount
    ;
};


Object.defineProperties(Block.prototype, {"identitiesCount": {
  get: function() {
    return this.identities ? this.identities.length : 0;
  }
}});

Object.defineProperties(Block.prototype, {"joinersCount": {
  get: function() {
    return this.joiners ? this.joiners.length : 0;
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
