
function Notification(json, markAsReadCallback) {

  var messagePrefixes = {
    'market': 'EVENT.MARKET.',
    'registry': 'EVENT.REGISTRY.'
  };

  var that = this;

  // Avoid undefined errors
  json = json || {};

  that.type = json.type && json.type.toLowerCase();
  that.time = json.time;
  that.hash = json.hash;
  that.read = json.read_signature ? true : false;

  that.message = json.reference && messagePrefixes[json.reference.index] ?
  messagePrefixes[json.reference.index] + json.code :
  'EVENT.' + json.code;
  that.params = json.params;

  if (markAsReadCallback && (typeof markAsReadCallback === "function") ) {
    that.markAsReadCallback = markAsReadCallback;
  }

  function _formatHash(input) {
    return input ? input.substr(0,4) + input.substr(input.length-4) : '';
  }

  that.markAsRead = function() {
    if (that.markAsReadCallback) {
      that.markAsReadCallback(that);
    }
  };

  var pubkeys;

  json.code = json.code || '';

  // Membership
  if (json.code.startsWith('MEMBER_')) {
    that.avatarIcon = 'ion-person';
    that.icon = 'ion-information-circled positive';
  }

  // TX
  else if (json.code.startsWith('TX_')) {
    that.avatarIcon = 'ion-card';
    that.icon = (json.code == 'TX_SENT') ? 'ion-paper-airplane dark' : 'ion-archive balanced';
    pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') == -1) {
      that.pubkey = pubkeys;
    }
    that.state = 'app.view_wallet_tx';
    that.stateParams = {refresh: true};
  }

  // Certifications
  else if (json.code.startsWith('CERT_')) {
    that.avatarIcon = (json.code == 'CERT_RECEIVED') ? 'ion-ribbon-b' : 'ion-ribbon-a';
    that.icon = (json.code == 'CERT_RECEIVED') ? 'ion-ribbon-b balanced' : 'ion-ribbon-a gray';
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    that.state = (json.code == 'CERT_RECEIVED') ? 'app.wallet_cert.tab_received' : 'app.wallet_cert.tab_given';
  }

  // Message
  else if (json.code.startsWith('MESSAGE_')) {
    that.avatarIcon = 'ion-email';
    that.icon = 'ion-email dark';
    pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') == -1) {
      that.pubkey = pubkeys;
    }
    that.id = json.reference.id; // Do not care about notification ID, because notification screen use message _id
  }

  // market record
  else if (json.reference && json.reference.index == 'market') {
    that.avatarIcon = 'ion-speakerphone';
    that.pubkey = json.params.length > 0 ? json.params[0] : null;
    if (json.reference.anchor) {
      that.icon = 'ion-ios-chatbubble-outline dark';
      that.state = 'app.market_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[2],
        anchor: _formatHash(json.reference.anchor)
      };
    }
    else {
      that.icon = 'ion-speakerphone dark';
      that.state = 'app.market_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[2]};
    }
  }

  // registry record
  else if (json.reference && json.reference.index == 'registry') {
    that.avatarIcon = 'ion-ios-book';
    if (json.reference.anchor) {
      that.icon = 'ion-ios-chatbubble-outline dark';
      that.state = 'app.registry_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1],
        anchor: _formatHash(json.reference.anchor)
      };
    }
    else {
      that.icon = 'ion-ios-book dark';
      that.state = 'app.registry_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1]};
    }
  }

  // info message
  else if (json.type == 'INFO') {
    that.avatarIcon = 'ion-information';
    that.icon = 'ion-information-circled positive';
  }
  // warn message
  else if (json.type == 'WARN') {
    that.avatarIcon = 'ion-alert-circled';
    that.icon = 'ion-alert-circled energized';
  }
  // error message
  else if (json.type == 'ERROR') {
    that.avatarIcon = 'ion-close';
    that.icon = 'ion-close-circled assertive';
  }
}
