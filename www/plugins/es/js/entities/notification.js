
function Notification(json, markAsReadCallback) {

  var messagePrefixes = {
    'market': 'EVENT.MARKET.',
    'registry': 'EVENT.REGISTRY.'
  };

  var that = this;

  that.type = json.type.toLowerCase();
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

  that.markAsRead = function() {
    if (that.markAsReadCallback) {
      that.markAsReadCallback(that);
    }
  };

  // TX
  if (json.code.startsWith('TX_')) {
    that.avatarIcon = 'ion-card';
    that.icon = (json.code == 'TX_SENT') ? 'ion-paper-airplane dark' : 'ion-archive balanced';
    var pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') == -1) {
      that.pubkey = pubkeys;
    }
    that.state = 'app.view_wallet';
  }

  // Membership
  else if (json.code.startsWith('MEMBER_')) {
    that.avatarIcon = 'ion-person';
    that.icon = 'ion-information-circled positive';
  }

  // Message
  else if (json.code.startsWith('MESSAGE_RECEIVED')) {
    that.avatarIcon = 'ion-email';
    that.icon = 'ion-email dark';
    var pubkeys = json.params.length > 0 ? json.params[0] : null;
    if (pubkeys && pubkeys.indexOf(',') == -1) {
      that.pubkey = pubkeys;
    }
    that.state = 'app.user_view_message';
    that.stateParams = {
      id: json.reference.id
    };
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
        anchor: json.reference.anchor.substr(0,8)
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
        anchor: json.reference.anchor.substr(0,8)
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
