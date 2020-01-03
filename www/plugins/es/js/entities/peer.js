

function EsPeer(json) {

  var that = this;

  Object.keys(json).forEach(function (key) {
    that[key] = json[key];
  });

  that.endpoints = that.endpoints || [];
}


EsPeer.prototype.regexp = {
  API_REGEXP: /^([A-Z_]+)(?:[ ]+([a-z_][a-z0-9-_.ğĞ]*))?(?:[ ]+([0-9.]+))?(?:[ ]+([0-9a-f:]+))?(?:[ ]+([0-9]+))(?:\/[^\/]+)?$/,
  LOCAL_IP_ADDRESS: /^127[.]0[.]0.|192[.]168[.]|10[.]0[.]0[.]|172[.]16[.]/
};

EsPeer.prototype.keyID = function () {
  var ep = this.ep || this.getEP();
  if (ep.useBma) {
    return [this.pubkey || "Unknown", ep.dns, ep.ipv4, ep.ipv6, ep.port, ep.useSsl, ep.path].join('-');
  }
  return [this.pubkey || "Unknown", ep.ws2pid, ep.path].join('-');
};

EsPeer.prototype.copyValues = function(to) {
  var obj = this;
  ["version", "currency", "pub", "endpoints", "hash", "status", "block", "signature"].forEach(function (key) {
    to[key] = obj[key];
  });
};

EsPeer.prototype.copyValuesFrom = function(from) {
  var obj = this;
  ["version", "currency", "pub", "endpoints", "block", "signature"].forEach(function (key) {
    obj[key] = from[key];
  });
};

EsPeer.prototype.json = function() {
  var obj = this;
  var json = {};
  ["version", "currency", "endpoints", "status", "block", "signature"].forEach(function (key) {
    json[key] = obj[key];
  });
  json.raw = this.raw && this.getRaw();
  json.pubkey = this.pubkey;
  return json;
};

EsPeer.prototype.getEP = function() {
  if (this.ep) return this.ep;
  var ep = null;
  var epRegex = this.regexp.API_REGEXP;
  this.endpoints.forEach(function(epStr){
    var matches = !ep && epRegex.exec(epStr);
    if (matches) {
      ep = {
        "api": matches[1] || '',
        "dns": matches[2] || '',
        "ipv4": matches[3] || '',
        "ipv6": matches[4] || '',
        "port": matches[5] || 80,
        "path": matches[6] || '',
        "useSsl": matches[5] == 443
      };
    }
  });
  return ep || {};
};

EsPeer.prototype.getEndpoints = function(regexp) {
  if (!regexp) return this.endpoints;
  if (typeof regexp === 'string') regexp = new RegExp('^' + regexp);
    return this.endpoints.reduce(function(res, ep){
      return ep.match(regexp) ?  res.concat(ep) : res;
    }, []);
};

EsPeer.prototype.hasEndpoint = function(endpoint){
  var regExp = this.regexp[endpoint] || new RegExp('^' + endpoint);
  var endpoints = this.getEndpoints(regExp);
  return endpoints && endpoints.length > 0;
};

EsPeer.prototype.hasEsEndpoint = function() {
  var endpoints = this.getEsEndpoints();
  return endpoints && endpoints.length > 0;
};

EsPeer.prototype.getEsEndpoints = function() {
  return this.getEndpoints(/^(ES_CORE_API|ES_USER_API|ES_SUBSCRIPTION_API|GCHANGE_API)/);
};

EsPeer.prototype.getDns = function() {
  var ep = this.ep || this.getEP();
  return ep.dns ? ep.dns : null;
};

EsPeer.prototype.getIPv4 = function() {
  var ep = this.ep || this.getEP();
  return ep.ipv4 ? ep.ipv4 : null;
};

EsPeer.prototype.getIPv6 = function() {
  var ep = this.ep || this.getEP();
  return ep.ipv6 ? ep.ipv6 : null;
};

EsPeer.prototype.getPort = function() {
  var ep = this.ep || this.getEP();
  return ep.port ? ep.port : null;
};

EsPeer.prototype.getHost = function() {
  var ep = this.ep || this.getEP();
  return ((ep.port == 443 || ep.useSsl) && ep.dns) ? ep.dns :
    (this.hasValid4(ep) ? ep.ipv4 :
        (ep.dns ? ep.dns :
          (ep.ipv6 ? '[' + ep.ipv6 + ']' :'')));
};

EsPeer.prototype.getURL = function() {
  var ep = this.ep || this.getEP();
  var host = this.getHost();
  var protocol = (ep.port == 443 || ep.useSsl) ? 'https' : 'http';
  return protocol + '://' + host + (ep.port ? (':' + ep.port) : '');
};

EsPeer.prototype.getServer = function() {
  var ep = this.ep || this.getEP();
  var host = this.getHost();
  return host + (host && ep.port ? (':' + ep.port) : '');
};

EsPeer.prototype.hasValid4 = function(ep) {
  return ep.ipv4 &&
    /* exclude private address - see https://fr.wikipedia.org/wiki/Adresse_IP */
    !ep.ipv4.match(this.regexp.LOCAL_IP_ADDRESS) ?
    true : false;
};

EsPeer.prototype.isReachable = function () {
  return !!this.getServer();
};

EsPeer.prototype.isSsl = function() {
  var ep = this.ep || this.getEP();
  return ep.useSsl;
};

EsPeer.prototype.isTor = function() {
  var ep = this.ep || this.getEP();
  return ep.useTor;
};

EsPeer.prototype.isHttp = function() {
  var ep = this.ep || this.getEP();
  return !bma.useTor;
};

