
function Invitation(json) {

  var that = this;

  // Avoid undefined errors
  json = json || {};

  that.type = json.type && json.type.toLowerCase();
  that.time = json.time;
  that.id = json.id;

  // Invitation to certify
  if (that.type == 'certification') {

    that.comment = json.comment;
    that.icon = 'ion-ribbon-a';
    that.okText= 'WOT.BTN_CERTIFY';

    // read the identity to certify
    var parts = json.content.split('-');
    if (parts.length != 2) {
      throw 'Invalid invitation content. format should be [uid-pubkey]';
    }
    var identity = { uid: parts[0], pubkey: parts[1] };

    // Prepare the state action
    that.state = 'app.wot_identity';
    that.stateParams = {
      pubkey: identity.pubkey,
      uid: identity.uid,
      action: 'certify'
    };

    // Ask certification to himself
    if (identity.pubkey == json.issuer) {
      that.pubkey = json.issuer;
      that.uid = identity.uid;
      that.message = 'INVITATION.ASK_CERTIFICATION';
    }

    // Ask certification to someone else
    else {
      that.issuer = {
        pubkey: json.issuer
      };
      that.message = 'INVITATION.SUGGESTION_CERTIFICATION';
      that.pubkey = identity.pubkey;
      that.uid = identity.uid;
    }


  }

}
