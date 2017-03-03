angular.module('cesium.es.invitation.services', ['cesium.crypto.services', 'cesium.device.services',
  'cesium.es.http.services', 'cesium.es.wallet.services', 'cesium.wot.services'])

.factory('esInvitation', function($rootScope, $q, CryptoUtils, Device, esHttp, csWallet, esWallet, csWot) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 10
    },
    fields = {
      commons: ["issuer", "time", "hash", "content", "nonce", "read_signature"]
    },
    listeners;

  that.raw = {
    certification: {
      add: esHttp.record.post('/invitation/certification'),
      postSearch: esHttp.post('/invitation/certification/_search'),
      remove: esHttp.record.remove('invitation', 'certification')
    }
  };

  function onWalletInit(data) {
    data.invitations = data.invitations || {};
    data.invitations.unreadCount = null;
  }

  function onWalletReset(data) {
    if (data.invitations) {
      delete data.invitations;
    }
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [invitations] Loading count...');
    var now = new Date().getTime();

    // Count unread messages
    countUnreadInvitations(data.pubkey)
      .then(function(unreadCount){
        data.invitations = data.invitations || {};
        data.invitations.unreadCount = unreadCount;
        console.debug('[ES] [invitation] Loaded count (' + unreadCount + ') in '+(new Date().getTime()-now)+'ms');
        deferred.resolve(data);
      })
      .catch(function(err){
        console.error('Error while counting invitation: ' + (err.message ? err.message : err));
        deferred.resolve(data);
      });
    return deferred.promise;
  }

  function countUnreadInvitations(pubkey) {
    pubkey = pubkey || (csWallet.isLogin() ? csWallet.data.pubkey : pubkey);
    if (!pubkey) {
      throw new Error('User not connected or no pubkey');
    }

    var request = {
      query: {
        bool: {
          must: [
            {term: {recipient: pubkey}},
            {missing: { field : "read_signature" }}
          ]
        }
      }
    };

    // TODO : count using size=0
    // and with 'group by' on type
    return esHttp.post('/invitation/certification/_count')(request)
      .then(function(res) {
        return res.count;
      });
  }

  function sendInvitationCertification(record, keypair) {
    return esWallet.box.record.pack(record, keypair)
      .then(function(record) {
        return that.raw.certification.add(record);
      });
  }

  function loadInvitationNotifications(options) {
    if (!csWallet.isLogin()) {
      return $q.when([]); // Should never happen
    }
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;
    var request = {
      sort: {
        "time" : "desc"
      },
      query: {bool: {filter: {term: {recipient: csWallet.data.pubkey}}}},
      from: options.from,
      size: options.size,
      _source: fields.commons
    };

    // Filter on time
    if (options.readTime) {
      query.bool.must = [{range: {time: {gt: options.readTime}}}];
    }

    return $q.all([
      esWallet.box.getKeypair(),
      that.raw.certification.postSearch(request)
    ])
      .then(function(res) {
        var keypair = res[0];
        res = res[1];
        if (!res || !res.hits || !res.hits.total) return [];

        var invitations = res.hits.hits.reduce(function (result, hit) {
          var msg = hit._source;
          msg.id = hit._id;
          msg.type = hit._type;
          msg.read = !!msg.read_signature;
          delete msg.read_signature; // not need anymore
          return result.concat(msg);
        }, []);

        // Encrypt content
        return esWallet.box.record.open(invitations, keypair);
      })

      // Extension identities entity
      .then(function(invitations) {

        var identitiesToExtend = [];
        invitations = invitations.reduce(function (res, json) {
          var invitation = new Invitation(json);
          identitiesToExtend.push(invitation);
          if (invitation.issuer) {
            identitiesToExtend.push(invitation.issuer);
          }
          return res.concat(invitation);
        }, []);

        // Extend all identities (issuer and invitation): add name, avatar...
        return csWot.extendAll(identitiesToExtend, 'pubkey')

          // Update invitations count
          .then(function(){
            csWallet.data.invitations = csWallet.data.invitations || {};
            csWallet.data.invitations.count = invitations.length;

            return invitations; // final result
          });
      });
  }

  function deleteInvitation(invitation) {
    if (!invitation || !invitation.id) throw 'Invalid invitation (empty or without id). Could not delete.';
    var type = invitation.type || 'certification';
    return that.raw[type].remove(invitation.id);
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet events
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.init($rootScope, onWalletInit, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [invitations] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [invitations] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        onWalletLogin(csWallet.data);
      }
    }
  }

  // Default action
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.certification = {
    send: sendInvitationCertification
  };
  that.notification = {
    load: loadInvitationNotifications
  };
  that.delete = deleteInvitation;

  return that;
})
;
