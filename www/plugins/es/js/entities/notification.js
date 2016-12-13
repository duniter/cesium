
function Notification(json, onReadCallback) {

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

  that.messageParams = {};
  _.each(json.params, function(param, index) {
    that.messageParams['p' + index] = param;
  });

  that.onRead = function() {
    that.read = true;
    if (onReadCallback) {
      onReadCallback(that);
    }
  };

  // TX
  if (json.code.startsWith('TX_')) {
    that.icon = 'ion-card';
  }

  // member
  else if (json.code.startsWith('MEMBER_')) {
    that.icon = 'ion-person';
  }

  // market record
  else if (json.reference && json.reference.index == 'market') {
    that.icon = 'ion-speakerphone';
    if (json.reference.anchor) {
      that.state = 'app.market_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1],
        anchor: json.reference.anchor.substr(0,8)
      };
    }
    else {
      that.state = 'app.market_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1]};
    }
  }

  // registry record
  else if (json.reference && json.reference.index == 'registry') {
    that.icon = 'ion-ios-book';
    if (json.reference.anchor) {
      that.state = 'app.registry_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1],
        anchor: json.reference.anchor.substr(0,8)
      };
    }
    else {
      that.state = 'app.registry_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1]};
    }
  }

  // info message
  else if (json.type == 'INFO') {
    that.icon = 'ion-information';
  }
  // warn message
  else if (json.type == 'WARN') {
    that.icon = 'ion-alert-circled';
  }
  // error message
  else if (json.type == 'ERROR') {
    that.icon = 'ion-alert';
  }
}
