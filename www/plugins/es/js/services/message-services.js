angular.module('cesium.es.message.services', ['ngResource', 'cesium.services', 'cesium.crypto.services', 'cesium.es.http.services', 'cesium.es.user.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esMessage');
    }

  })

.factory('esMessage', function($q, $rootScope, csSettings, esHttp, CryptoUtils, esUser, Wallet, BMA) {
  'ngInject';

  function factory(host, port) {

    var
    listeners,
    fields = {
      commons: ["issuer", "recipient", "title", "content", "time", "nonce"]
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
      data.messages.count = null;
    }

    function onWalletReset(data) {
      if (data.keypair) {
        delete data.keypair.boxSk;
        delete data.keypair.boxPk;
      };
      if (data.messages) {
        delete data.messages;
      }
    }

    function onWalletLoad(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }

      var lastMessageTime = csSettings.data && csSettings.data.plugins && csSettings.data.plugins.es ?
        csSettings.data.plugins.es.lastMessageTime :
        undefined;

      // Count new messages
      countNewMessages(data.pubkey, lastMessageTime)
        .then(function(count){
          data.messages = data.messages || {};
          data.messages.count = count;
          console.debug('[ES] [message] Detecting ' + count + (lastMessageTime ? ' unread' : '') + ' messages');
          if(resolve) resolve(data);
        })
        .catch(function(err){
          reject(err);
          if(reject) reject(data);
        });
    }


    function getBoxKeypair(keypair) {
      keypair = keypair || (Wallet.isLogin() ? Wallet.data.keypair : keypair);
      if (!keypair) {
        throw new Error('no keypair, and user not connected.');
      }
      if (keypair.boxPk && keypair.boxSk) {
        return keypair;
      }
      var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(keypair);
      Wallet.data.keypair.boxSk = boxKeypair.boxSk;
      Wallet.data.keypair.boxPk = boxKeypair.boxPk;
      console.debug("[ES] Secret box keypair successfully computed");
      return data.keypair;
    }

    function countNewMessages(pubkey, fromTime) {
      pubkey = pubkey || (Wallet.isLogin() ? Wallet.data.pubkey : pubkey);
      if (!pubkey) {
        throw new Error('no pubkey, and user not connected.');
      }

      var request = {
        size: 0,
        query: {constant_score: {filter: [{term: {recipient: pubkey}}]}}
      };

      // Add time filter
      if (fromTime) {
        request.query.constant_score.filter.push({range: {time: {gt: fromTime}}});
      }

      return esHttp.post(host, port, '/message/record/_search')(request)
        .then(function(res) {
          return res.hits ? res.hits.total : 0;
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

    function searchAndDecrypt(request, keypair) {
      var uids;
      return BMA.wot.member.uids()
        .then(function(res) {
          uids = res;
          return esHttp.post(host, port, '/message/record/_search')(request)
        })
        .then(function(res) {
          if (res.hits.total === 0) {
            return [];
          }
          else {
            var walletPubkey = Wallet.isLogin() ? Wallet.data.pubkey : null;
            var messages = res.hits.hits.reduce(function(result, hit) {
              var msg = hit._source;
              msg.id = hit._id;
              msg.pubkey = msg.issuer !== walletPubkey ? msg.issuer : msg.recipient;
              msg.uid = uids[msg.pubkey];
              return result.concat(msg);
            }, []);

            console.debug('[ES] [message] Loading ' + messages.length + ' messages');
            return decryptMessages(messages, keypair)
              .then(function(){
                return esUser.profile.fillAvatars(messages, 'pubkey');
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
          else {
            var walletPubkey = Wallet.isLogin() ? Wallet.data.pubkey : null;
            var msg = hit._source;
            msg.id = hit._id;
            msg.pubkey = msg.issuer !== walletPubkey ? msg.issuer : msg.recipient;

            // Get uid (if member)
            return BMA.wot.member.get(msg.pubkey)
              .then(function(user) {
                msg.uid = user ? user.uid : user;
                // Decrypt message
                return decryptMessages([msg], keypair)
              })
              .then(function(){
                // Fill avatar
                return esUser.profile.fillAvatars([msg], 'pubkey');
              })
              .then(function() {
                return msg;
              });
          }
        })
    }

    function decryptMessages(messages, keypair) {
      var jobs = [];
      var now = new Date().getTime();
      var boxKeypair = getBoxKeypair(keypair);
      var issuerBoxPks = {}; // a map used as cache

      var messages = messages.reduce(function(result, message) {
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

    function removeListeners() {
      console.debug("[ES] Disable message service listeners");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] Enable message service listeners");

      // Extend Wallet.loadData() and WotService.loadData()
      listeners = [
        Wallet.api.data.on.login($rootScope, onWalletLoad, this),
        Wallet.api.data.on.load($rootScope, onWalletLoad, this),
        Wallet.api.data.on.init($rootScope, onWalletInit, this),
        Wallet.api.data.on.reset($rootScope, onWalletReset, this),
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
      if (isEnable() && !Wallet.data.messages) {
        onWalletLoad(Wallet.data);
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
      searchAndDecrypt: searchAndDecrypt,
      get: getAndDecrypt,
      send: sendMessage,
      remove: esHttp.record.remove(host, port, 'message', 'record'),
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
