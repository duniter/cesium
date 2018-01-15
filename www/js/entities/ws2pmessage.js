

function Ws2pMessage(message) {

  var that = this;

  var parts = message.split(':');
  if (parts.length < 3 || !parts[0].startsWith('WS2P')) {
    throw Error('Invalid format: ' + message);
  }
  // Head message
  if (parts[1] == 'HEAD') {
    if (parts.length < 4) {
      throw Error('Invalid format: ' + message);
    }
    // Duniter version < 1.6.9
    if (parts.length == 4) {
      that.pubkey = parts[2];
      that.buid = parts[3];
    }
    else {
      var version = parts[2];
      if (version >= 1) {
        var prefix = parts[0];

        // Private/public options
        if (prefix.length > 4) {
          var matches = this.regexp.WS2P_PREFIX.exec(prefix);
          if (!matches) {
            throw Error('Invalid format: ' + message);
          }

          // Private options
          var options = matches[1];
          if (options) {
            that.private = {
              useTor: options.startsWith('T')
            };
            var mode = options.substring(1);
            if (mode == 'A') {
              that.private.mode = 'all';
            }
            else if (mode == 'M') {
              that.private.mode = 'mixed';
            }
            else if (mode == 'S') {
              that.private.mode = 'strict';
            }
          }

          // Public options
          options = matches[2];
          if (options) {
            that.public = {
              mode: 'all',
              useTor: options.startsWith('T')
            };
          }

          /*console.debug('[http] private {0}, public {1}'.format(
            (that.private.useTor ? 'TOR ' : '' ) + (that.private.mode || 'false'),
            (that.public.useTor ? 'TOR ' : '' ) + (that.public.mode || 'false')
          ), prefix);*/
        }

        // default options
        else {
          /*that.private = {
            mode: 'all'
          };
          that.public = {
            mode: 'all'
          };*/
        }

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


Ws2pMessage.prototype.regexp = {
  WS2P_PREFIX: /^WS2P(?:O([CT][SAM]))?(?:I([CT]))?$/,
};


