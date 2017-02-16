
function Comment(id, json) {

  var that = this;

  that.id = id;
  that.message = null; // set in copyFromJson()
  that.issuer = null; // set in copyFromJson()
  that.time = null; // set in copyFromJson()
  that.reply_to = null; // set in copyFromJson()

  that.replyCount = 0;
  that.parent = null;
  that.replies = [];
  that.onRemoveListeners = [];

  that.copy = function(otherComment) {
    // Mandatory fields
    that.message = otherComment.message;
    that.issuer = otherComment.issuer;
    that.time = otherComment.time;

    // Optional fields
    that.id = otherComment.id || that.id;
    that.reply_to = otherComment.reply_to || that.reply_to;
    that.uid = otherComment.uid || that.uid;
    that.name = otherComment.name || that.name;
    that.avatarStyle = otherComment.avatarStyle || that.avatarStyle;
    if (otherComment.parent) {
      that.parent = otherComment.parent;
    }
    if (otherComment.replies) that.setReplies(otherComment.replies);
  };

  that.copyFromJson = function(json) {
    that.message = json.message;
    that.issuer = json.issuer;
    that.time = json.time;
    that.reply_to = json.reply_to;
  };

  that.addOnRemoveListener = function(listener) {
    if (listener && (typeof listener === "function") ) {
      that.onRemoveListeners.push(listener);
    }
  };

  that.cleanAllListeners = function() {
    that.onRemoveListeners = [];
  };

  that.setReplies = function(replies) {
    that.removeAllReplies();
    that.addReplies(replies);
  };

  that.addReplies = function(replies) {
    if (!replies || !replies.length) return;
    replies = replies.sort(function(cm1, cm2) {
      return (cm1.time - cm2.time);
    });
    _.forEach(replies, function(reply) {
      reply.parent = that;
      that.replies.push(reply);
    });
    that.replyCount += replies.length;
  };

  that.containsReply = function(reply) {
    return that.replies.indexOf(reply) != -1;
  };

  that.addReply = function(reply) {
    that.replyCount += 1;
    that.replies.push(reply);
    that.replies = that.replies.sort(function(cm1, cm2) {
      return (cm1.time - cm2.time);
    });
    reply.parent = that;
  };

  that.removeAllReplies = function() {
    if (that.replyCount) {
      var replies = that.replies.splice(0, that.replies.length);
      that.replyCount = 0;
      _.forEach(replies, function (reply) {
        reply.remove();
      });
    }
  };

  that.removeReply = function(replyId) {
    var index = _.findIndex(that.replies, {id: replyId});
    if (index != -1) {
      that.replyCount--;
      var reply = that.replies.splice(index, 1)[0];
      delete reply.parent;
    }
  };

  that.remove = function() {
    if (that.parent) {
      that.parent.removeReply(that.id);
      delete that.parent;
    }
    //that.removeAllReplies();
    if (that.onRemoveListeners.length) {
      _.forEach(that.onRemoveListeners, function(listener) {
        listener(that);
      });
      that.issuer = null;
      that.message = null;
      that.cleanAllListeners();
    }
  };

  // Init from json
  if (json && typeof json === "object") {
    that.copyFromJson(json);
  }
}
