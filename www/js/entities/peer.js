

function Peer(json) {

  var that = this;

  Object.keys(json).forEach(function (key) {
    that[key] = json[key];
  });

  that.endpoints = that.endpoints || [];
  that.statusTS = that.statusTS || 0;
}


Peer.prototype.regex = {
  BMA_REGEXP: /^BASIC_MERKLED_API([ ]+([a-z_][a-z0-9-_.]*))?([ ]+([0-9.]+))?([ ]+([0-9a-f:]+))?([ ]+([0-9]+))$/,
  LOCAL_IP_ADDRESS: /^127[.]0[.]0.|192[.]168[.]|10[.]0[.]0[.]|172[.]16[.]/
};

Peer.prototype.keyID = function () {
  return this.pubkey && this.pubkey.length > 10 ? this.pubkey.substring(0, 10) : "Unknown";
};

Peer.prototype.copyValues = function(to) {
  var obj = this;
  ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach(function (key) {
    to[key] = obj[key];
  });
};

Peer.prototype.copyValuesFrom = function(from) {
  var obj = this;
  ["version", "currency", "pub", "endpoints", "block", "signature"].forEach(function (key) {
    obj[key] = from[key];
  });
};

Peer.prototype.json = function() {
  var obj = this;
  var json = {};
  ["version", "currency", "endpoints", "status", "block", "signature"].forEach(function (key) {
    json[key] = obj[key];
  });
  json.raw = this.raw && this.getRaw();
  json.pubkey = this.pubkey;
  return json;
};

Peer.prototype.getBMA = function() {
  if (this.bma) return this.bma;
  var bma = null;
  var bmaRegex = this.regex.BMA_REGEXP;
  this.endpoints.forEach(function(ep){
    var matches = !bma && bmaRegex.exec(ep);
    if (matches) {
      bma = {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80
      };
    }
  });
  return bma || {};
};

Peer.prototype.getEndpoints = function(regex) {
  if (!regex) return this.endpoints;
    return this.endpoints.reduce(function(res, ep){
      return ep.match(regex) ?  res.concat(ep) : res;
    }, []);
};

Peer.prototype.hasEndpoint = function(endpoint){
  endpoint = '^' + endpoint;
  var regExp = new RegExp(endpoint);
  var endpoints = this.getEndpoints(regExp);
  if (!endpoints.length) return false;
  else return true;

};

Peer.prototype.getDns = function() {
  var bma = this.bma || this.getBMA();
  return bma.dns ? bma.dns : null;
};

Peer.prototype.getIPv4 = function() {
  var bma = this.bma || this.getBMA();
  return bma.ipv4 ? bma.ipv4 : null;
};

Peer.prototype.getIPv6 = function() {
  var bma = this.bma || this.getBMA();
  return bma.ipv6 ? bma.ipv6 : null;
};

Peer.prototype.getPort = function() {
  var bma = this.bma || this.getBMA();
  return bma.port ? bma.port : null;
};

Peer.prototype.getHost = function() {
  var bma = this.bma || this.getBMA();
  return (this.hasValid4(bma) ? bma.ipv4 :
        (bma.dns ? bma.dns :
          (bma.ipv6 ? '[' + bma.ipv6 + ']' :'')));
};

Peer.prototype.getURL = function() {
  var bma = this.bma || this.getBMA();
  var host = this.getHost();
  var protocol = (bma.port === 443) ? 'https' : 'http';
  return protocol + '://' + host + (bma.port ? (':' + bma.port) : '');
};

Peer.prototype.getServer = function() {
  var bma = this.bma || this.getBMA();
  var host = this.getHost();
  return host + (host && bma.port ? (':' + bma.port) : '');
};

Peer.prototype.hasValid4 = function(bma) {
  return bma.ipv4 &&
    /* exclude private address - see https://fr.wikipedia.org/wiki/Adresse_IP */
    !bma.ipv4.match(this.regex.LOCAL_IP_ADDRESS) ?
    true : false;
};

Peer.prototype.isReachable = function () {
  return !!this.getServer();
};
