
function Notification(json) {

  var messagePrefixes = {
    'market': 'EVENT.MARKET.'
  };

  var that = this;

  that.type = json.type.toLowerCase();
  that.time = json.time;


  that.message = json.link && messagePrefixes[json.link.index] ?
  messagePrefixes[json.link.index] + json.code :
    'EVENT.' + json.code;

  that.messageParams = {};
  _.each(json.params, function(param, index) {
    that.messageParams['p' + index] = param;
  });

  // market record
  if (json.reference && json.reference.index == 'market') {
    if (json.reference.anchor) {
      that.state = 'app.market_view_record_anchor';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1],
        anchor: json.reference.anchor};
    }
    else {
      that.state = 'app.market_view_record';
      that.stateParams = {
        id: json.reference.id,
        title: json.params[1]};
    }
  }
  // registry record
  if (json.reference && json.reference.index == 'registry') {
    that.state = 'app.registry_view_record';
    that.stateParams = {
      id: json.reference.id,
      title: json.params[1]
    };
  }
}
