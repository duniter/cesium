angular.module('cesium.es.message.services', ['ngResource', 'cesium.services', 'cesium.crypto.services', 'cesium.es.http.services', 'cesium.es.user.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esMessage');
    }

  })

.factory('esMessage', function($q, $rootScope, csSettings, esHttp, CryptoUtils, esUser, csWallet, Device) {
  'ngInject';

  function Factory() {

    var
    listeners,
    defaultLoadSize = 10,
    fields = {
      commons: ["issuer", "recipient", "title", "content", "time", "nonce", "read_signature"],
      notifications: ["issuer", "time", "hash", "read_signature"]
    },
    raw = {
      postSearch: esHttp.post('/message/inbox/_search'),
      getByTypeAndId : esHttp.get('/message/:type/:id'),
      postReadById: esHttp.post('/message/inbox/:id/_read')
    };

    function onWalletInit(data) {
      data.messages = data.messages || {};
      data.messages.unreadCount = null;
    }

    function onWalletReset(data) {
      if (data.keypair) {
        delete data.keypair.boxSk;
        delete data.keypair.boxPk;
      }
      if (data.messages) {
        delete data.messages;
      }
    }

    function onWalletLogin(data, deferred) {
      deferred = deferred || $q.defer();
      if (!data || !data.pubkey) {
        deferred.resolve();
        return deferred.promise;
      }

      console.debug('[ES] [message] Loading count...');
      var now = new Date().getTime();

      // Count unread messages
      countUnreadMessages(data.pubkey)
        .then(function(unreadCount){
          data.messages = data.messages || {};
          data.messages.unreadCount = unreadCount;
          console.debug('[ES] [message] Loaded count (' + unreadCount + ') in '+(new Date().getTime()-now)+'ms');
          deferred.resolve(data);
        })
        .catch(function(err){
          console.error('Error chile counting message: ' + (err.message ? err.message : err));
          deferred.resolve(data);
        });
      return deferred.promise;
    }

    function getBoxKeypair(keypair) {
      keypair = keypair || (csWallet.isLogin() ? csWallet.data.keypair : keypair);
      if (!keypair) {
        throw new Error('no keypair, and user not connected.');
      }
      if (keypair.boxPk && keypair.boxSk) {
        return $q.when(keypair);
      }
      return CryptoUtils.box.keypair.fromSignKeypair(keypair)
        .then(function(boxKeypair) {
          csWallet.data.keypair.boxSk = boxKeypair.boxSk;
          csWallet.data.keypair.boxPk = boxKeypair.boxPk;
          console.debug("[ES] Secret box keypair successfully computed");
          return csWallet.data.keypair;
        });
    }

    function countUnreadMessages(pubkey) {
      pubkey = pubkey || (csWallet.isLogin() ? csWallet.data.pubkey : pubkey);
      if (!pubkey) {
        throw new Error('no pubkey, and user not connected.');
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

      return esHttp.post('/message/inbox/_count')(request)
        .then(function(res) {
          return res.count;
        });
    }

    function sendMessage(message, keypair) {
      return doSendMessage(message, keypair)
        .then(function(sendResult){
          var outbox = (csSettings.data.plugins.es.message &&
            angular.isDefined(csSettings.data.plugins.es.message.outbox)) ?
            csSettings.data.plugins.es.message.outbox : true;

          if (!outbox) return sendResult;

          // Send to outbox
          return doSendMessage(message, keypair, '/message/outbox', 'issuer')
            .catch(function(err) {
              console.error("Failed to store message to outbox: " + err);
            })
            .then(function() {
              return sendResult;
            });
        });
    }

    function doSendMessage(message, keypair, boxPath, recipientFieldName) {
      boxPath = boxPath || '/message/inbox';
      recipientFieldName = recipientFieldName || 'recipient';
      if (!message[recipientFieldName]) {
        return $q.reject({message:'MESSAGE.ERROR.RECIPIENT_IS_MANDATORY'});
      }

      // Get recipient
      var recipientPk = CryptoUtils.util.decode_base58(message[recipientFieldName]);

      return $q.all([
          getBoxKeypair(keypair),
          CryptoUtils.box.keypair.pkFromSignPk(recipientPk),
          CryptoUtils.util.random_nonce()
        ])
        .then(function(res) {
          var boxKeypair = res[0];
          var boxRecipientPk = res[1];
          var nonce = res[2];
          var senderSk = boxKeypair.boxSk;
          return $q.all([
            // Encrypt title
            CryptoUtils.box.pack(message.title, nonce, boxRecipientPk, senderSk),
            // Encrypt content
            CryptoUtils.box.pack(message.content, nonce, boxRecipientPk, senderSk)
          ])
          .then(function(cypherTexts){
            // Send message
            return esHttp.record.post(boxPath)({
              issuer: message.issuer,
              recipient: message.recipient,
              title: cypherTexts[0],
              content: cypherTexts[1],
              nonce: CryptoUtils.util.encode_base58(nonce)
            });
          });
        });
    }

    function loadMessageNotifications(options) {
      if (!csWallet.isLogin()) {
        return $q.when([]);
      }
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || defaultLoadSize;
      var request = {
        sort: {
          "time" : "desc"
        },
        query: {bool: {filter: {term: {recipient: csWallet.data.pubkey}}}},
        from: options.from,
        size: options.size,
        _source: fields.notifications
      };

      return raw.postSearch(request)
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) {
            return [];
          }
          else {
            var notifications = res.hits.hits.reduce(function(result, hit) {
              var msg = hit._source;
              msg.id = hit._id;
              msg.read = !!msg.read_signature;
              delete msg.read_signature; // not need anymore
              return result.concat(msg);
            }, []);
            return esUser.profile.fillAvatars(notifications, 'issuer');
          }
        });
    }


    function searchMessages(options) {
      if (!csWallet.isLogin()) {
        return $q.when([]);
      }

      options = options || {};
      options.type = options.type || 'inbox';
      options.from = options.from || 0;
      options.size = options.size || 1000;
      options._source = options._source || fields.commons;
      var request = {
        sort: {
          "time" : "desc"
        },
        from: options.from,
        size: options.size,
        _source: options._source
      };

      if (options.type == 'inbox') {
        request.query = {bool: {filter: {term: {recipient: csWallet.data.pubkey}}}};
      }
      else {
        request.query = {bool: {filter: {term: {issuer: csWallet.data.pubkey}}}};
      }

      return esHttp.post('/message/:type/_search')(request, {type: options.type})
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) {
            return [];
          }
          var messages = res.hits.hits.reduce(function(res, hit) {
            var msg = hit._source || {};
            msg.id = hit._id;
            msg.read = (options.type == 'outbox') || !!msg.read_signature;
            delete msg.read_signature; // not need anymore
            return res.concat(msg);
          }, []);

          console.debug('[ES] [message] Loading {0} {1} messages'.format(messages.length, options.type));

          return messages;
        });
    }

    function loadMessages(keypair, options) {
      if (!csWallet.isLogin()) {
        return $q.when([]);
      }

      options = options || {};
      options.type = options.type||'inbox';
      options._source = fields.commons;

      // Get encrypted message (with common fields)
      return searchMessages(options)

        // Encrypt content
        .then(function(messages) {
          return decryptMessages(messages, keypair, options.type);
        })

        // Add avatar
        .then(function(messages){
          var senderPkField = (options.type == 'inbox') ? 'issuer' : 'recipient';
          return esUser.profile.fillAvatars(messages, senderPkField);
        })

        // Update message count
        .then(function(messages){
          csWallet.data.messages = csWallet.data.messages || {};
          csWallet.data.messages.count = messages.length;

          return messages;
        });
    }

    function getAndDecrypt(params, keypair) {
      params.type = params.type || 'inbox';
      var avatarField = (params.type == 'inbox') ? 'issuer' : 'recipient';
      return raw.getByTypeAndId(params)
        .then(function(hit) {
          if (!hit.found) {
            return;
          }
          var msg = hit._source;
          msg.id = hit._id;
          msg.read = (params.type == 'outbox') || !!msg.read_signature;
          delete msg.read_signature; // not need anymore

          // Decrypt message
          return decryptMessages([msg], keypair, params.type)
            .then(function(){
              // Fill avatar
              return esUser.profile.fillAvatars([msg], avatarField);
            })
            .then(function() {
              return msg;
            });
        });
    }

    function decryptMessages(messages, keypair) {

      var now = new Date().getTime();
      var issuerBoxPks = {}; // a map used as cache

      var jobs = [getBoxKeypair(keypair)];
      return $q.all(messages.reduce(function(jobs, message) {
          if (issuerBoxPks[message.issuer]) return res;
          return jobs.concat(
            CryptoUtils.box.keypair.pkFromSignPk(CryptoUtils.util.decode_base58(message.issuer))
              .then(function(issuerBoxPk) {
                issuerBoxPks[message.issuer] = issuerBoxPk; // fill box pk cache
              }));
        }, jobs))
        .then(function(res){
          var boxKeypair = res[0];
          return $q.all(messages.reduce(function(jobs, message) {
            var issuerBoxPk = issuerBoxPks[message.issuer];
            var nonce = CryptoUtils.util.decode_base58(message.nonce);
            message.valid = true;

            return jobs.concat(
              // title
              CryptoUtils.box.open(message.title, nonce, issuerBoxPk, boxKeypair.boxSk)
              .then(function(title) {
                message.title = title;
              })
              .catch(function(err){
                console.error(err);
                console.warn('[ES] [message] may have invalid cypher title');
                message.valid = false;
              }),

              // content
              CryptoUtils.box.open(message.content, nonce, issuerBoxPk, boxKeypair.boxSk)
                .then(function(content) {
                  message.content = content;
                })
                .catch(function(err){
                  console.error(err);
                  console.warn('[ES] [message] may have invalid cypher content');
                  message.valid = false;
                })
              );
            }, []));
        })
        .then(function() {
          console.debug('[ES] [message] All messages decrypted in ' + (new Date().getTime() - now) + 'ms');
          return messages;
        });

    }

    function removeMessage(id, type) {
      type = type || 'inbox';
      return esHttp.record.remove('message', type)(id)
        .then(function(res) {
          // update message count
          if (type == 'inbox') {
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.count = csWallet.data.messages.count > 0 ? csWallet.data.messages.count-1 : 0;
          }
          return res;
        });
    }

    function removeAllMessages(type) {
      type = type || 'inbox';

      // Get all message id
      return searchMessages({type: type, from: 0, size: 1000, _source: false})
        .then(function(res) {
          if (!res || !res.length) return;

          // Remove each messages
          return $q.all(res.reduce(function(res, msg) {
            return res.concat(esHttp.record.remove('message', type)(msg.id));
          }, []));
        })
        .then(function() {
          // update message count
          if (type == 'inbox') {
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.count = 0;
            csWallet.data.messages.unreadCount = 0;
          }
        });
    }

    // Mark a message as read
    function markMessageAsRead(message, type) {
      type = type || 'inbox';
      if (message.read) {
        var deferred = $q.defer();
        deferred.resolve();
        return deferred.promise;
      }
      message.read = true;

      return CryptoUtils.sign(message.hash, csWallet.data.keypair)

        // Send read request
        .then(function(signature){
          return raw.postReadById(signature, {id:message.id});
        })

        // Update message count
        .then(function() {
          if (type == 'inbox') {
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.unreadCount = csWallet.data.messages.unreadCount ? csWallet.data.messages.unreadCount - 1 : 0;
          }
        }) ;
    }

    // Mark all messages as read
    function markAllMessageAsRead() {
      // Get all messages hash
      return searchMessages({type: 'inbox', from: 0, size: 1000, _source: ['hash', 'read_signature']})

        .then(function(messages) {
          if (!messages || !messages.length) return;

          // Keep only unread message
          messages = _.filter(messages, {read:false});

          // Remove  messages
          return $q.all(messages.reduce(function(res, message) {
            return res.concat(
              // Sign hash
              CryptoUtils.sign(message.hash, csWallet.data.keypair)
              // then send read request
              .then(function(signature){
                return raw.postReadById(signature, {id:message.id});
              }));
          }, []));
        })
        .then(function() {
          // update message count
          csWallet.data.messages = csWallet.data.messages || {};
          csWallet.data.messages.unreadCount = 0;
        });
    }

    function removeListeners() {
      console.debug("[ES] [message] Disable");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      // Extend csWallet.loadData()
      listeners = [
        csWallet.api.data.on.login($rootScope, onWalletLogin, this),
        csWallet.api.data.on.init($rootScope, onWalletInit, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this)
      ];
    }

    function refreshState() {
      var enable = esHttp.alive;
      if (!enable && listeners && listeners.length > 0) {
        console.debug("[ES] [message] Disable");
        removeListeners();
        if (csWallet.isLogin()) {
          onWalletReset(csWallet.data);
        }
      }
      else if (enable && (!listeners || listeners.length === 0)) {
        console.debug("[ES] [message] Enable");
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

    return {
      search: raw.postSearch,
      notifications: {
        load: loadMessageNotifications
      },
      load: loadMessages,
      get: getAndDecrypt,
      send: sendMessage,
      remove: removeMessage,
      removeAll: removeAllMessages,
      markAsRead: markMessageAsRead,
      markAllAsRead: markAllMessageAsRead,
      fields: {
        commons: fields.commons
      }
    };
  }

  return Factory();
})
;
