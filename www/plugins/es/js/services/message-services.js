angular.module('cesium.es.message.services', ['ngResource', 'cesium.services', 'cesium.crypto.services', 'cesium.es.http.services', 'cesium.es.user.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esMessage');
    }

  })

.factory('esMessage', function($q, $rootScope, csSettings, esHttp, CryptoUtils, esUser, csWallet) {
  'ngInject';

  function factory(host, port) {

    var
    listeners,
    fields = {
      commons: ["issuer", "recipient", "title", "content", "time", "nonce", "read_signature"],
      notifications: ["issuer", "time", "hash", "read_signature"]
    };

    function copy(otherNode) {
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }

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

      // Count unread messages
      countUnreadMessages(data.pubkey)
        .then(function(unreadCount){
          data.messages = data.messages || {};
          data.messages.unreadCount = unreadCount;
          console.debug('[ES] [message] Detecting ' + unreadCount + ' unread messages');
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
        return keypair;
      }
      var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(keypair);
      csWallet.data.keypair.boxSk = boxKeypair.boxSk;
      csWallet.data.keypair.boxPk = boxKeypair.boxPk;
      console.debug("[ES] Secret box keypair successfully computed");
      return csWallet.data.keypair;
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

      return esHttp.post(host, port, '/message/inbox/_count')(request)
        .then(function(res) {
          return res.count;
        });
    }

    function sendMessage(message, keypair) {
      return $q(function(resolve, reject) {
        doSendMessage(message, keypair)
          .catch(function(err) {
            reject(err);
          })
          .then(function(res){
            resolve(res);

            var useOutbox = csSettings.data.plugins.es.message && csSettings.data.plugins.es.message.useOutbox;
            // TODO
            useOutbox = true;
            // Send to outbox (in a async way)
            if (useOutbox) {
              return doSendMessage(message, keypair, '/message/outbox', 'issuer')
                .catch(function(err) {
                  console.error("Failed to store message to outbox: " + err);
                });
            }
          });
        });
    }

    function doSendMessage(message, keypair, boxPath, recipientFieldName) {
      boxPath = boxPath || '/message/inbox';
      recipientFieldName = recipientFieldName || 'recipient';

      var boxKeypair = getBoxKeypair(keypair);

      // Get recipient
      var recipientPk = CryptoUtils.util.decode_base58(message[recipientFieldName]);
      var boxRecipientPk = CryptoUtils.box.keypair.pkFromSignPk(recipientPk);

      var cypherTitle;
      var cypherContent;
      var nonce = CryptoUtils.util.random_nonce();

      var senderSk = boxKeypair.boxSk;

      return $q.all([
        // Encrypt title
        CryptoUtils.box.pack(message.title, nonce, boxRecipientPk, senderSk)
          .then(function(cypherText) {
            cypherTitle = cypherText;
          }),
        // Encrypt content
        CryptoUtils.box.pack(message.content, nonce, boxRecipientPk, senderSk)
          .then(function(cypherText) {
            cypherContent = cypherText;
          })
      ])
        .then(function(){
          // Send message
          return esHttp.record.post(host, port, boxPath)({
            issuer: message.issuer,
            recipient: message.recipient,
            title: cypherTitle,
            content: cypherContent,
            nonce: CryptoUtils.util.encode_base58(nonce)
          });
        });
    }

    function loadMessageNotifications(options) {
      if (!csWallet.isLogin()) {
        return $q.when([]);
      }
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || 10;
      var request = {
        sort: {
          "time" : "desc"
        },
        query: {bool: {filter: {term: {recipient: csWallet.data.pubkey}}}},
        from: options.from,
        size: options.size,
        _source: fields.notifications
      };

      return esHttp.post(host, port, '/message/inbox/_search')(request)
        .then(function(res) {
          if (res.hits.total === 0) {
            return [];
          }
          else {
            var walletPubkey = csWallet.isLogin() ? csWallet.data.pubkey : null;
            var notifications = res.hits.hits.reduce(function(result, hit) {
              var msg = hit._source;
              msg.id = hit._id;
              msg.issuer = msg.issuer !== walletPubkey ? msg.issuer : msg.recipient;
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

      return esHttp.post(host, port, '/message/:type/_search')(request, {type: options.type})
        .then(function(res) {
          if (res.hits.total === 0) {
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
      return esHttp.get(host, port, '/message/:type/:id')(params)
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
      var jobs = [];
      var now = new Date().getTime();
      var boxKeypair = getBoxKeypair(keypair);
      var issuerBoxPks = {}; // a map used as cache

      messages = messages.reduce(function(result, message) {
        var issuerBoxPk = issuerBoxPks[message.issuer];
        if (!issuerBoxPk) {
          issuerBoxPk = CryptoUtils.box.keypair.pkFromSignPk(CryptoUtils.util.decode_base58(message.issuer));
          issuerBoxPks[message.issuer] = issuerBoxPk; // fill box pk cache
        }

        var nonce = CryptoUtils.util.decode_base58(message.nonce);

        message.valid = true;

        // title
        jobs.push(CryptoUtils.box.open(message.title, nonce, issuerBoxPk, boxKeypair.boxSk)
          .then(function(title) {
            message.title = title;
          })
          .catch(function(err){
            console.warn('[ES] [message] invalid cypher title');
            message.valid = false;
          }));

        // content
        jobs.push(CryptoUtils.box.open(message.content, nonce, issuerBoxPk, boxKeypair.boxSk)
          .then(function(content) {
            message.content = content;
          })
          .catch(function(err){
            console.warn('[ES] [message] invalid cypher content');
            message.valid = false;
          }));
        return result.concat(message);
      }, []);

      return $q.all(jobs)
        .then(function() {
          console.debug('[ES] [message] All messages decrypted in ' + (new Date().getTime() - now) + 'ms');
          return messages;
        });
    }

    function removeMessage(id, type) {
      type = type || 'inbox';
      return esHttp.record.remove(host, port, 'message', type)(id)
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
            return res.concat(esHttp.record.remove(host, port, 'message', type)(msg.id));
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
          return esHttp.post(host, port, '/message/inbox/:id/_read')(signature, {id:message.id});
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
                return esHttp.post(host, port, '/message/inbox/:id/_read')(signature, {id:message.id});
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
      console.debug("[ES] Disable message extension");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] Enable message extension");

      // Extend csWallet.loadData()
      listeners = [
        csWallet.api.data.on.login($rootScope, onWalletLogin, this),
        csWallet.api.data.on.init($rootScope, onWalletInit, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this),
      ];
    }

    function isEnable() {
      return csSettings.data.plugins &&
        csSettings.data.plugins.es &&
        host && csSettings.data.plugins.es.enable;
    }

    function refreshListeners() {
      var enable = isEnable();
      if (!enable && listeners && listeners.length > 0) {
        removeListeners();
      }
      else if (enable && (!listeners || listeners.length === 0)) {
        addListeners();
      }
    }

    // Listen for settings changed
    csSettings.api.data.on.changed($rootScope, function(){
      refreshListeners();
      if (isEnable() && !csWallet.data.messages) {
        onWalletLogin(csWallet.data);
      }
    });

    // Default action
    refreshListeners();

    return {
      copy: copy,
      node: {
        server: esHttp.getServer(host, port)
      },
      search: esHttp.post(host, port, '/message/inbox/_search'),
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

  var host = csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null;
  var port = host ? csSettings.data.plugins.es.port : null;

  var service = factory(host, port);

  service.instance = factory;
  return service;
})
;
