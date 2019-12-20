angular.module('cesium.es.invitation.services', ['cesium.platform',
  'cesium.es.http.services', 'cesium.es.wallet.services', 'cesium.es.notification.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esInvitation');
    }

  })

.factory('esInvitation', function($rootScope, $q, CryptoUtils, csPlatform, Api, esHttp, csWallet, esWallet, csWot, esNotification) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 20
    },
    fields = {
      commons: ["issuer", "time", "hash", "content", "nonce", "comment"]
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
    data.invitations.time = null;
  }

  function onWalletReset(data) {
    if (data.invitations) {
      delete data.invitations;
    }
  }

  function onWalletLoad(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    var now = Date.now();
    var time = Math.trunc(now / 1000);

    // Skip if loaded less than 1 min ago
    // (This is need to avoid reload on login AND load phases)
    if (data.invitations && data.invitations.time && (time - data.invitations.time < 30 /*=30s*/)) {
      console.debug('[ES] [invitation] Skipping load (loaded '+(time - data.invitations.time)+'s ago)');
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [invitation] Loading count...');

    // Count unread invitations
    countUnreadInvitations(data.pubkey)
      .then(function(unreadCount){
        data.invitations = data.invitations || {};
        data.invitations.unreadCount = unreadCount;
        data.invitations.time = time;
        console.debug('[ES] [invitation] Loaded count (' + unreadCount + ') in '+(Date.now()-now)+'ms');
        deferred.resolve(data);
      })
      .catch(function(err){
        console.error('Error while counting invitation: ' + (err.message ? err.message : err));
        deferred.resolve(data);
      });
    return deferred.promise;
  }

  function onWalletCertify(cert) {
    if (!csWallet.data.invitations || !csWallet.data.invitations.list) return;

    // Search on invitations
    var invitationstoRemove = _.where(csWallet.data.invitations.list, {
      type: 'certification',
      pubkey: cert.pubkey
    });
    if (!invitationstoRemove || !invitationstoRemove.length) return;

    // Remove all invitations related to this pubkey
    return $q.all(
      invitationstoRemove.reduce(function(res, invitation) {
        return res.concat(
          deleteInvitation(invitation)
        );
      }, []));
  }

  function onNewInvitationEvent(event) {
    console.debug("[ES] [invitation] detected new invitation (from notification service)");

    // If user not auth: simply increment counter
    if (!csWallet.isAuth()) {
      $rootScope.$applyAsync(function() {
        csWallet.data.invitations = csWallet.data.invitations || {};
        csWallet.data.invitations.unreadCount++;
      });
      return;
    }

    getInvitationById(event.reference.id, event.reference.type)
      .then(function(invitation){
        csWallet.data.invitations = csWallet.data.invitations || {};
        csWallet.data.invitations.unreadCount++;

        // Insert into the result list (if exists = already loaded)
        if (csWallet.data.invitations.list) {
          csWallet.data.invitations.list.splice(0,0,invitation);
        }

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
            {term: {recipient: pubkey}}
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

  function sendInvitation(record, options) {
    options = options || {};
    options.type = options.type || 'certification';
    var keypair = options.keypair || (options.wallet && options.wallet.data.keypair);
    return esWallet.box.record.pack(record, keypair, 'recipient', ['content', 'comment'])
      .then(function(record) {
        return that.raw[options.type].add(record, options);
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
        var json = hit._source;
        json.id = hit._id;
        json.type = hit._type;

        // Encrypt content
        return esWallet.box.record.open([json], keypair, 'issuer', ['content', 'comment']);
      })

      // Extend identity: add name, avatar...
      .then(function(jsons) {
        var json = jsons[0];
        if (!json || !json.valid) return; // skip invalid cypher content
        var invitation = new Invitation(json);

        return csWot.extendAll(invitation.issuer ? [invitation, invitation.issuer] : [invitation], 'pubkey')
          .then(function() {
            return invitation;
          });
      });
  }

  function loadInvitations(options, keypair) {
    if (!csWallet.isLogin()) return $q.when([]); // Should never happen
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;

    var issuer = options.issuer || csWallet.data.pubkey;
    var request = {
      sort: {
        "time" : "desc"
      },
      query: {bool: {filter: {term: {recipient: issuer}}}},
      from: options.from,
      size: options.size,
      _source: fields.commons
    };

    // Filter on time
    if (options.readTime) {
      query.bool.must = [{range: {time: {gt: options.readTime}}}];
    }

    return that.raw.certification.postSearch(request)
      .then(function(res) {
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
        return esWallet.box.record.open(invitations, keypair, 'issuer', ['content', 'comment']);
      })

      // Extension identities entity
      .then(function(invitations) {

        var identitiesToExtend = [];
        invitations = invitations.reduce(function (res, json) {
          if (!json || !json.valid) return res; // skipping invalid cypher
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

            // Update invitation list
            if (!csWallet.data.invitations.list) {
              csWallet.data.invitations.list = invitations;
            }
            else {
              // Reset previous existing invitation
              if (csWallet.data.invitations.list.length) {
                csWallet.data.invitations.list.splice(options.from, csWallet.data.invitations.list.length-options.from);
              }
              // Then insert new invitations
              _.forEach(invitations, function (invitation) {
                csWallet.data.invitations.list.push(invitation);
              });
            }

            return csWallet.data.invitations.list; // final result
          });
      });
  }

  function deleteInvitation(invitation, options) {
    if (!invitation || !invitation.id) throw 'Invalid invitation (empty or without id). Could not delete.';
    var type = invitation.type || 'certification';
    var wallet = options && options.walletId && csWallet.children.get(options.walletId) || csWallet;
    return that.raw[type].remove(invitation.id, {wallet: wallet})
      .then(function() {
        // Always reset unread count
        wallet.data.invitations.unreadCount = 0;

        if (!wallet.data.invitations || !wallet.data.invitations.list) return;

        // Remove form list
        wallet.data.invitations.list.splice(wallet.data.invitations.list.indexOf(invitation), 1);
      });
  }

  function deleteInvitationsByIds(ids, type, options) {
    if (!ids || !ids.length) return $q.when();
    type = type || 'certification';
    return $q.all(
        ids.reduce(function(res, id) {
          return res.concat(that.raw[type].remove(id, options));
        }, [])
      );
  }

  function deleteAllInvitationsByPubkey(type, options) {

    type = type || 'certification';

    var now = Date.now();
    console.debug('[ES] [invitation] Deleting all {0} invitations...'.format(type));

    var wallet = (options && options.pubkey && csWallet.children.getByPubkey(options.pubkey)) ||
      (options && options.walletId && csWallet.children.getByPubkey(options.walletId)) ||
      csWallet;
    var countBeforeDeletion = (wallet.data.invitations && wallet.data.invitations.count) || 0;
    var unreadCountBeforeDeletion = (wallet.data.invitations && wallet.data.invitations.unreadCount) || 0;

    // Get invitation ids
    return that.raw[type].getIds({pubkey: wallet.data.pubkey})
      .then(function(res) {
        if (!res || !res.hits || !res.hits.total) return;
        var ids = res.hits.hits.reduce(function (res, hit) {
          return res.concat(hit._id);
        }, []);

        // Do deletion by ids
        return deleteInvitationsByIds(ids, type, {walletId: wallet.id})
          .then(function() {
            // Update wallet count
            wallet.data.invitations = wallet.data.invitations || {};
            // Decrement count (warning: could have received new invitations during deletion execution)
            if (wallet.data.invitations.count >= countBeforeDeletion) {
              wallet.data.invitations.count -= countBeforeDeletion || 0;
            }
            else {
              wallet.data.invitations.count = 0;
            }
            // Decrement count (warning: could have received new invitations during deletion execution)
            if (wallet.data.invitations.unreadCount >= unreadCountBeforeDeletion) {
              wallet.data.invitations.unreadCount -= unreadCountBeforeDeletion || 0;
            }
            else {
              wallet.data.invitations.unreadCount = 0;
            }

            console.debug('[ES] [invitation] All {0} invitations deleted in {1}ms'.format(type, Date.now()-now));
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
      csWallet.api.data.on.init($rootScope, onWalletInit, this),
      csWallet.api.data.on.login($rootScope, onWalletLoad, this),
      csWallet.api.data.on.load($rootScope, onWalletLoad, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this),
      csWallet.api.action.on.certify($rootScope, onWalletCertify, this),
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
        onWalletLoad(csWallet.data);
      }
    }
  }

  // Register extension points
  api.registerEvent('data', 'new');

  // Default action
  csPlatform.ready().then(function() {
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
  that.deleteAll = deleteAllInvitationsByPubkey;

  that.constants = constants;

  return that;
})
;
