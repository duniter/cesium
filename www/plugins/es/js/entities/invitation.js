
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
    if (!json.content || json.content.indexOf('-') == -1) {
      console.error('[invitation] Empty content for invitation [{0}]'.format(that.id));
      that.message = 'INVITATION.ERROR.BAD_INVITATION_FORMAT';
      that.pubkey = json.issuer;
      return;
    }

    var separatorIndex = json.content.lastIndexOf('-');
    if (separatorIndex == -1) {
      console.error('[invitation] Bad content format for invitation [{0}]: {1}'.format(that.id, json.content));
      that.message = 'INVITATION.ERROR.BAD_INVITATION_FORMAT';
      that.pubkey = json.issuer;
      return;
    }

    var identity = {
      uid: json.content.substr(0, separatorIndex),
      pubkey: json.content.substr(separatorIndex+1)
    };

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
