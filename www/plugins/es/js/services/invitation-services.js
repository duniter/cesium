angular.module('cesium.es.invitation.services', ['cesium.crypto.services', 'cesium.device.services',
  'cesium.es.http.services', 'cesium.es.wallet.services', 'cesium.es.notification.services', 'cesium.wot.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esInvitation');
    }

  })

.factory('esInvitation', function($rootScope, $q, CryptoUtils, Device, Api, esHttp, csWallet, esWallet, csWot, esNotification) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 10
    },
    fields = {
      commons: ["issuer", "time", "hash", "content", "nonce", "read_signature"]
    },
    api = new Api(this, 'esInvitation'),
    listeners;

  that.raw = {
    certification: {
      get: esHttp.get('/invitation/certification/:id?_source:fields'),
      add: esHttp.record.post('/invitation/certification'),
      postSearch: esHttp.post('/invitation/certification/_search'),
      remove: esHttp.record.remove('invitation', 'certification'),
      getIds: esHttp.get('/invitation/certification/_search?q=recipient::pubkey&_source=false&size=1000')
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

  function onNewInvitationEvent(event) {
    console.debug("[ES] [invitation] detected new invitation (from notification service)");

    getInvitationById(event.reference.id, event.reference.type)
      .then(function(invitation){
        csWallet.data.invitations = csWallet.data.invitations || {};
        csWallet.data.invitations.unreadCount++;

        // Raise event
        api.data.raise.new(invitation);
      });
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

  function sendInvitation(record, keypair, type) {
    type = type || 'certification';
    return esWallet.box.record.pack(record, keypair)
      .then(function(record) {
        return that.raw[type].add(record);
      });
  }

  function getInvitationById(id, type) {
    type = type || 'certification';
    return $q.all([
        esWallet.box.getKeypair(),
        that.raw[type].get({id: id, fields: fields.commons.join(',')})
      ])
      .then(function(res) {
        var keypair = res[0];
        var hit = res[1];
        console.log(res);
        var invitation = hit._source;
        invitation.id = hit._id;
        invitation.type = hit._type;

        // Encrypt content
        return esWallet.box.record.open([invitation], keypair);
      })

      // Extend identity: add name, avatar...
      .then(function(invitations) {

        var invitation = new Invitation(invitations[0]);

        return csWot.extendAll(invitation.issuer ? [invitation, invitation.issuer] : [invitation], 'pubkey')
          .then(function() {
            return invitation;
          })
      });
  }

  function loadInvitations(options) {
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

  function deleteInvitationsByIds(ids, type) {
    if (!ids || !ids.length) return $q.when();
    type = type || 'certification';
    return $q.all(
        ids.reduce(function(res, id) {
          return res.concat(that.raw[type].remove(id));
        }, [])
      );
  }

  function deleteAllInvitations(pubkey, type) {
    pubkey = pubkey || csWallet.data.pubkey;
    type = type || 'certification';

    console.debug('[ES] [invitation] Deleting all invitations...');
    var now = new Date().getTime();
    var countBeforeDeletion = (csWallet.data.invitations && csWallet.data.invitations.count) || 0;
    var unreadCountBeforeDeletion = (csWallet.data.invitations && csWallet.data.invitations.unreadCount) || 0;

    // Get invitation ids
    return that.raw[type].getIds({pubkey: pubkey})
      .then(function(res) {
        if (!res || !res.hits || !res.hits.total) return;
        var ids = res.hits.hits.reduce(function (res, hit) {
          return res.concat(hit._id);
        }, []);

        // Do deletion by ids
        return deleteInvitationsByIds(ids, type)
          .then(function() {
            // Update wallet count
            csWallet.data.invitations = csWallet.data.invitations || {};
            // Decrement count (warning: could have received new invitations during deletion execution)
            if (csWallet.data.invitations.count >= countBeforeDeletion) {
              csWallet.data.invitations.count -= countBeforeDeletion || 0;
            }
            else {
              csWallet.data.invitations.count = 0;
            }
            // Decrement count (warning: could have received new invitations during deletion execution)
            if (csWallet.data.invitations.unreadCount >= unreadCountBeforeDeletion) {
              csWallet.data.invitations.unreadCount -= unreadCountBeforeDeletion || 0;
            }
            else {
              csWallet.data.invitations.unreadCount = 0;
            }

            console.debug('[ES] [invitation] All invitations deleted in {0}ms'.format(new Date().getTime()-now));
          });
      });
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
      csWallet.api.data.on.reset($rootScope, onWalletReset, this),
      esNotification.api.event.on.newInvitation($rootScope, onNewInvitationEvent, this)
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

  // Register extension points
  api.registerEvent('data', 'new');

  // Default action
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.api = api;
  that.load = loadInvitations;
  that.get = getInvitationById;
  that.send = sendInvitation;
  that.delete = deleteInvitation;
  that.deleteByIds = deleteInvitationsByIds;
  that.deleteAll = deleteAllInvitations;

  return that;
})
;
