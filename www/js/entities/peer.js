

function Peer(json) {

  var that = this;

  Object.keys(json).forEach(function (key) {
    that[key] = json[key];
  });

  that.endpoints = that.endpoints || [];
}


Peer.prototype.regexp = {
  BMA: /^BASIC_MERKLED_API[ ]?/,
  BMAS: /^BMAS[ ]?/,
  WS2P: /^WS2P[ ]?/,
  GVA: /^GVA(:? S)?[ ]?/,
  BMA_REGEXP: /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( ([a-z0-9/.&#!]+))?$/,
  BMAS_REGEXP: /^BMAS( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( ([a-z0-9/.&#!]+))?$/,
  GVA_REGEXP: /^GVA( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( ([a-z0-9/.&#!]+))?$/,
  GVAS_REGEXP: /^GVA S( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( ([a-z0-9/.&#!]+))?$/,
  WS2P_REGEXP: /^WS2P ([a-z0-9]+)( ([a-z_][a-z0-9-_.ğĞ]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))( ([a-z0-9/.&#!]+))?$/,
  LOCAL_IP_ADDRESS: /^127[.]0[.]0.|192[.]168[.]|10[.]0[.]0[.]|172[.]16[.]/
};
Peer.prototype.regex = Peer.prototype.regexp; // for backward compat

Peer.prototype.keyID = function () {
  var bma = this.bma || this.getBMA();
  if (bma.useBma) {
    return [this.pubkey || "Unknown", bma.dns, bma.ipv4, bma.ipv6, bma.port, bma.useSsl, bma.path].join('-');
  }
  if (bma.useGva) {
    return [this.pubkey || "Unknown", bma.dns, bma.ipv4, bma.ipv6, bma.port, bma.useSsl, bma.path].join('-');
  }
  return [this.pubkey || "Unknown", bma.ws2pid, bma.path].join('-');
};

Peer.prototype.copyValues = function(to) {
  var obj = this;
  ["version", "currency", "pub", "endpoints", "hash", "status", "block", "signature"].forEach(function (key) {
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
  var path = null;
  var that = this;
  this.endpoints.forEach(function(ep){
    var matches = !bma && that.regexp.BMA_REGEXP.exec(ep);
    if (matches) {
      path = matches[10];
      if (path && !path.startsWith('/')) path = '/' + path; // Fix path (add starting slash)
      bma = {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80,
        "useSsl": matches[8] == 443,
        "path": path || '',
        "useBma": true
      };
    }
    matches = !bma && that.regexp.BMAS_REGEXP.exec(ep);
    if (matches) {
      path = matches[10];
      if (path && !path.startsWith('/')) path = '/' + path; // Fix path (add starting slash)
      bma = {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80,
        "path": path || '',
        "useSsl": true,
        "useBma": true
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
  //console.debug('testing if hasEndpoint:' + endpoint);
  var regExp = this.regexp[endpoint] || new RegExp('^' + endpoint);
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
  return bma.port ? parseInt(bma.port) : null;
};

Peer.prototype.getHost = function(bma) {
  bma = bma || this.bma || this.getBMA();
  return ((bma.port == 443 || bma.useSsl) && bma.dns) ? bma.dns :
    (this.hasValid4(bma) ? bma.ipv4 :
        (bma.dns ? bma.dns :
          (bma.ipv6 ? '[' + bma.ipv6 + ']' :'')));
};

Peer.prototype.getPath = function(bma) {
  bma = bma || this.bma || this.getBMA();
  var path = bma.path || '';
  if (!path || bma.path === '') return '';

  // Add starting slash
  if (!path.startsWith('/')) path = '/' + path;

  // Remove trailing slash
  if (path.endsWith('/')) path = path.substring(0, path.length - 1);

  return path;
};

Peer.prototype.getUrl = function(bma) {
  bma = bma || this.bma || this.getBMA();
  var protocol = (bma.port == 443 || bma.useSsl) ? 'https' : 'http';
  return protocol + '://' + this.getServer(bma) + this.getPath(bma);
};

Peer.prototype.getServer = function(bma) {
  bma = bma || this.bma || this.getBMA();
  var host = this.getHost(bma);
  // Remove port if 80 or 443
  return  !host ? null : (host + (bma.port && bma.port != 80 && bma.port != 443 ? (':' + bma.port) : ''));
};

Peer.prototype.hasValid4 = function(bma) {
  return bma.ipv4 &&
    /* exclude private address - see https://fr.wikipedia.org/wiki/Adresse_IP */
    !bma.ipv4.match(this.regexp.LOCAL_IP_ADDRESS) ?
    true : false;
};

Peer.prototype.isReachable = function () {
  return !!this.getServer();
};

Peer.prototype.isSsl = function() {
  var bma = this.bma || this.getBMA();
  return bma.useSsl;
};

Peer.prototype.isTor = function() {
  var bma = this.bma || this.getBMA();
  return bma.useTor;
};

Peer.prototype.isWs2p = function() {
  var bma = this.bma || this.getBMA();
  return bma.useWs2p;
};

Peer.prototype.isBma = function() {
  var bma = this.bma || this.getBMA();
  return bma.useBma;
};

Peer.prototype.hasBma = function() {
  return this.hasEndpoint('(BASIC_MERKLED_API|BMAS|BMATOR)');
};

Peer.prototype.isGva = function() {
  var bma = this.bma || this.getBMA();
  return bma.useGva;
};

Peer.prototype.toJSON = function() {
  return {
    host: this.getHost(),
    port: this.getPort(),
    path: this.getPath(),
    useSsl: this.isSsl(),
    url: this.getUrl(),
    server: this.getServer()
  };
};
