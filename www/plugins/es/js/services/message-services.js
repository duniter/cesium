angular.module('cesium.es.message.services', ['ngResource', 'cesium.services', 'cesium.crypto.services', 'cesium.es.http.services', 'cesium.es.user.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esMessage');
    }

  })

.factory('esMessage', function($q, $rootScope, csSettings, esHttp, CryptoUtils, esUser, csWallet, BMA) {
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

      return esHttp.post(host, port, '/message/record/_count')(request)
        .then(function(res) {
          return res.count;
        });
    }

    function sendMessage(message, keypair) {
      var boxKeypair = getBoxKeypair(keypair);

      // Get recipient
      var recipientPk = CryptoUtils.util.decode_base58(message.recipient);
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
        return esHttp.record.post(host, port, '/message/record')({
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
        return $timeout(function(){return []});
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

      return esHttp.post(host, port, '/message/record/_search')(request)
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

    function loadMessages(keypair, options) {
      if (!csWallet.isLogin()) {
        return $timeout(function(){return []});
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
        _source: fields.commons
      };

      return searchAndDecrypt(request, keypair);
    }

    function searchAndDecrypt(request, keypair) {
      return esHttp.post(host, port, '/message/record/_search')(request)
        .then(function(res) {
          if (res.hits.total === 0) {
            return [];
          }
          else {
            var walletPubkey = csWallet.isLogin() ? csWallet.data.pubkey : null;
            var messages = res.hits.hits.reduce(function(result, hit) {
              var msg = hit._source;
              msg.id = hit._id;
              msg.issuer = msg.issuer !== walletPubkey ? msg.issuer : msg.recipient;
              msg.read = !!msg.read_signature;
              delete msg.read_signature; // not need anymore
              return result.concat(msg);
            }, []);

            console.debug('[ES] [message] Loading ' + messages.length + ' messages');

            // Update message count
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.count = messages.length;

            return decryptMessages(messages, keypair)
              .then(function(){
                return esUser.profile.fillAvatars(messages, 'issuer');
              });
          }
        });
    }

    function getAndDecrypt(params, keypair) {
      return esHttp.get(host, port, '/message/record/:id')(params)
        .then(function(hit) {
          if (!hit.found) {
            return;
          }
          var walletPubkey = csWallet.isLogin() ? csWallet.data.pubkey : null;
          var msg = hit._source;
          msg.id = hit._id;
          msg.read = !!msg.read_signature;
          delete msg.read_signature; // not need anymore

          // Decrypt message
          return decryptMessages([msg], keypair)
            .then(function(){
              // Fill avatar
              return esUser.profile.fillAvatars([msg], 'issuer');
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

    function removeMessage(id) {
      return esHttp.record.remove(host, port, 'message', 'record')(id)
        .then(function(res) {
          // update message count
          csWallet.data.messages = csWallet.data.messages || {};
          csWallet.data.messages.count = csWallet.data.messages.count > 0 ? csWallet.data.messages.count-1 : 0;
          return res;
        });
    }

    // Mark a message as read
    function markMessageAsRead(message) {
      if (message.read) {
        var deferred = $q.defer();
        deferred.resolve();
        return deferred.promise;
      }
      message.read = true;
      csWallet.data.messages = csWallet.data.messages || {};
      csWallet.data.messages.unreadCount = csWallet.data.messages.unreadCount ? csWallet.data.messages.unreadCount-1 : 0;
      return CryptoUtils.sign(message.hash, csWallet.data.keypair)
        .then(function(signature){
          return esHttp.post(host, port, '/message/record/:id/_read')(signature, {id:message.id})
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
        onWalletLoad(csWallet.data);
      }
    });

    // Default action
    refreshListeners();

    return {
      copy: copy,
      node: {
        server: esHttp.getServer(host, port)
      },
      search: esHttp.post(host, port, '/message/record/_search'),
      notifications: {
        load: loadMessageNotifications
      },
      load: loadMessages,
      searchAndDecrypt: searchAndDecrypt,
      get: getAndDecrypt,
      send: sendMessage,
      remove: removeMessage,
      markAsRead: markMessageAsRead,
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
