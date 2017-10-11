

function Ws2pMessage(message) {

  var that = this;

  var parts = message.split(':');
  if (parts.length < 3 || parts[0] != 'WS2P') {
    throw Error('Invalid format found in WS2P message: ' + message);
  }

  // Head message
  if (parts[1] == 'HEAD') {
    if (parts.length < 4) {
      throw Error('Invalid format found in a WS2P message: ' + message);
    }
    // Duniter version < 1.6.9
    if (parts.length == 4) {
      that.pubkey = parts[2];
      that.buid = parts[3];
    }
    else {
      var version = parts[2];
      if (version >= 1) {
        //that.pubkey=
        that.pubkey=parts[3];
        that.buid=parts[4];
        that.ws2pid=parts[5];
        that.sotfware=parts[6];
        that.version=parts[7];
        that.powPrefix=parts[8];
      }
    }
  }

}

