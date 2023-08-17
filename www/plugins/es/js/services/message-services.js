angular.module('cesium.es.message.services', ['ngResource', 'cesium.platform',
  'cesium.es.http.services', 'cesium.es.wallet.services', 'cesium.es.notification.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esMessage');
    }

  })

  .factory('esMessage', function($q, $rootScope, $timeout, UIUtils, Api, CryptoUtils,
                                 csPlatform, csConfig, csSettings, esHttp, csWallet, esWallet, csWot, esNotification) {
    'ngInject';

    var
      constants = {
        DEFAULT_LOAD_SIZE: 10
      },
      fields = {
        commons: ["issuer", "recipient", "title", "content", "time", "nonce", "read_signature"],
        notifications: ["issuer", "time", "hash", "read_signature"]
      },
      raw = {
        search: esHttp.post('/message/inbox/_search'),
        searchByType: esHttp.post('/message/:type/_search'),
        getByTypeAndId : esHttp.get('/message/:type/:id'),
        postReadById: esHttp.post('/message/inbox/:id/_read'),
        count: esHttp.post('/message/inbox/_count')
      },
      listeners,
      api = new Api(this, 'esMessage');

    function onWalletInit(data) {
      data.messages = data.messages || {};
      data.messages.unreadCount = null;
      data.messages.time = null;
    }

    function onWalletReset(data) {
      if (data.messages) {
        delete data.messages;
      }
    }

    function onWalletLoad(data, deferred) {
      deferred = deferred || $q.defer();

      if (!data || !data.pubkey) {
        $timeout(function() {
          deferred.resolve(data);
        });
        return deferred.promise;
      }

      var now = Date.now();
      var time = Math.trunc(now / 1000);

      // Skip if loaded less than 1 min ago
      // (This is need to avoid reload on login AND load phases)
      if (data.messages && data.messages.time && (time - data.messages.time < 30 /*=30s*/)) {
        console.debug('[ES] [message] Skipping load (loaded '+(time - data.messages.time)+'s ago)');
        $timeout(function() {
          deferred.resolve(data);
        });
        return deferred.promise;
      }

      console.debug('[ES] [message] Loading count...');

      // Count unread messages
      countUnreadMessages({pubkey: data.pubkey})
        .then(function(unreadCount) {
          data.messages = data.messages || {};
          data.messages.unreadCount = unreadCount;
          data.messages.time = time;
          console.debug('[ES] [message] Loaded count (' + unreadCount + ') in '+(Date.now()-now)+'ms');
          deferred.resolve(data);
        })
        .catch(function(err){
          console.error('Error while counting messages: ' + (err.message ? err.message : err));
          deferred.resolve(data);
        });
      return deferred.promise;
    }

    function countUnreadMessages(options) {
      if (typeof options === 'string') throw new Error('Invalid argument options: expected an object, but get a string!');
      options = options || {};
      var wallet = options.wallet ||
        (options.walletId && csWallet.children.get(options.walletId)) || csWallet;
      var pubkey = options.pubkey || (wallet && wallet.data && wallet.data.pubkey);
      if (!pubkey) {
        return $q.reject('[ES] [message] No pubkey or wallet found in options, and user not connected.');
      }

      if (!options.readTime) {
        return loadLastReadTime(pubkey)
          .then(function(readTime){
            options.readTime = readTime || -1; // SKip 0 or undefined, to avoid infinite loop
            return countUnreadMessages(options); // Loop
          });
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

      // Filter on time
      if (options.readTime > 0) {
        request.query.bool.must.push({range: {time: {gt: options.readTime}}});
      }

      return raw.count(request)
        .then(function(res) {
          return res.count;
        });
    }

    function loadLastReadTime(pubkey) {
      if (!pubkey) {
        return $q.reject('[ES] [message] Unable to load - missing pubkey');
      }

      var request = {
        query: {
          bool: {
            must: [
              {term: {recipient: pubkey}},
              {exists: { field : "read_signature" }}
            ]
          }
        },
        sort : [
          { "time" : {"order" : "desc"}}
        ],
        from: 0,
        size: 1,
        _source: ['time']
      };

      return raw.search(request)
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total || !res.hits.hits) return undefined;
          return res.hits.hits[0] && res.hits.hits[0]._source && res.hits.hits[0]._source.time;
        })
        .catch(function(err) {
          console.error('[ES] [message] Failed to load the last read time', err);
          //return undefined; // Continue
          throw err;
        });
    }

    // Listen message changes
    function onNewMessageEvent(event, wallet) {
      console.debug("[ES] [message] detected new message (from notification service)");

      var notification = new EsNotification(event);
      notification.issuer = notification.pubkey;
      delete notification.pubkey;

      if (!notification.issuer) return; // Skip if invalid

      // Get the wallet
      wallet = wallet || (notification.issuer && csWallet.isUserPubkey(notification.issuer) && csWallet) ||
       (notification.issuer && csWallet.children.getByPubkey(notification.issuer));

      if (!wallet) {
        throw new Error("No wallet for pubkey: {0}".format(notification.issuer.substring(0, 6)));
      }

      csWot.extend(notification, 'issuer')
        .then(function() {

          wallet.data.messages = wallet.data.messages || {};
          wallet.data.messages.unreadCount++;

          // Raise event
          api.data.raise.new(notification);
        });
    }

    function sendMessage(message, options) {
      options = options || {};
      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      delete options.wallet;
      message.issuer = message.issuer || wallet.data.pubkey;
      return wallet.getKeypair()
        .then(function(keypair) {

          // Send to recipient inbox
          return doSendMessage(message, keypair)
            .then(function (res) {

              // Check if outbox is enable (in settings)
              var outbox = (csSettings.data.plugins.es.message &&
              angular.isDefined(csSettings.data.plugins.es.message.outbox)) ?
                csSettings.data.plugins.es.message.outbox : true;
              if (!outbox) return res;

              // Send to outbox
              return doSendMessage(message, keypair, '/message/outbox', 'issuer')
                .catch(function (err) {
                  console.error("Failed to store message to outbox: " + err);
                  return res; // the first result
                });
            })
            .then(function (res) {
              // Raise API event
              api.data.raise.sent(res);

              return res;
            });
        });
    }

    function doSendMessage(message, keypair, boxPath, recipientFieldName) {
      boxPath = boxPath || '/message/inbox';

      // Encrypt fields
      return esWallet.box.record.pack(message, keypair, recipientFieldName, ['title', 'content'])
      // Send message
        .then(function(message){
          return esHttp.record.post(boxPath)(message, {pubkey: message.issuer, keypair: keypair});
        });
    }

    function loadMessageNotifications(options) {
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || constants.DEFAULT_LOAD_SIZE;
      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      delete options.wallet;

      if (!wallet.isLogin()) {
        return $q.when([]); // Should never happen
      }

      var request = {
        sort: {
          "time" : "desc"
        },
        query: {bool: {filter: {term: {recipient: wallet.data.pubkey}}}},
        from: options.from,
        size: options.size,
        _source: fields.notifications
      };

      return raw.search(request)
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) return [];
          var notifications = res.hits.hits.reduce(function(result, hit) {
            var msg = hit._source;
            msg.id = hit._id;
            msg.read = !!msg.read_signature;
            delete msg.read_signature; // not need anymore
            return result.concat(msg);
          }, []);
          return csWot.extendAll(notifications, 'issuer');
        });
    }


    function searchMessages(pubkey, options) {
      pubkey = pubkey || csWallet.data.pubkey;

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

      if (options.type === 'inbox') {
        request.query = {bool: {filter: {term: {recipient: pubkey}}}};
      }
      else {
        request.query = {bool: {filter: {term: {issuer: pubkey}}}};
      }

      return raw.searchByType(request, {type: options.type})
        .then(function(res) {
          if (!res || !res.hits || !res.hits.total) {
            return [];
          }
          var messages = res.hits.hits.reduce(function(res, hit) {
            var msg = hit._source || {};
            msg.id = hit._id;
            msg.read = (options.type === 'outbox') || !!msg.read_signature;
            delete msg.read_signature; // not need anymore
            return res.concat(msg);
          }, []);

          console.debug('[ES] [message] Loading {0} {1} messages'.format(messages.length, options.type));

          return messages;
        });
    }

    function loadMessages(options) {
      options = options || {};
      options.type = options.type || 'inbox';
      options._source = fields.commons;
      options.summary = angular.isDefined(options.summary) ? options.summary : true;
      options.filter = angular.isDefined(options.filter) ? options.filter : undefined;
      options.from = options.from || 0;

      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      delete options.wallet; // avoid error in angular.copy()

      var promise = wallet.auth()
        .then(function(walletData) {

          // Get encrypted message (with common fields)
          return searchMessages(walletData.pubkey, options)

          // Decrypt content
            .then(function(messages) {
              return decryptMessages(messages, walletData.keypair, options.summary);
            });
        })

        // Add avatar
        .then(function(messages){
          var avatarField = (options.type === 'inbox') ? 'issuer' : 'recipient';
          return csWot.extendAll(messages, avatarField);
        })

        // Update message count
        .then(function(messages){
          if (messages.length && options.filter){
            var filteredMessages = filterMessages(messages, options.filter);

            // Need more messages: iterate again
            if (filteredMessages.length < messages.length) {
              options = angular.copy(options);
              options.from += options.size;
              options.size = messages.length - filteredMessages.length;
              // put the wallet again, because it has been removed before the angular.copy()
              // To avoid an error
              options.wallet = wallet;
              return loadMessages(options) // Loop
                .then(function(messages) {
                  return filteredMessages.concat(messages);
                });
            }
          }

          if (options.from === 0 && !options.filter) {
            wallet.data.messages = wallet.data.messages || {};
            wallet.data.messages.count = messages.length;
          }

          return messages;
        });

      // If filter, apply sorting (only once)
      if (options.from === 0 && options.filter) {
        promise.then(sortFilteredMessages);
      }

      return promise;
    }

    function getAndDecrypt(id, type, options) {
      type = type || 'inbox';
      options = options || {};
      options.summary = angular.isDefined(options.summary) ? options.summary : false/*summary not need by default*/;
      var wallet = options.wallet || (options.walletId && csWallet.children.get(options.walletId)) || csWallet;

      return wallet.auth()
        .then(function(walletData) {
          return raw.getByTypeAndId({id: id, type: type})
            .then(function(hit) {
              if (!hit.found) return;
              var msg = hit._source;
              msg.id = hit._id;
              msg.read = (type === 'outbox') || !!msg.read_signature;
              delete msg.read_signature; // not need anymore

              // Decrypt message
              return decryptMessages([msg], walletData.keypair, options.summary)

              // Add avatar
                .then(function(){
                  var avatarField = (type === 'inbox') ? 'issuer' : 'recipient';
                  return csWot.extend(msg, avatarField);
                });
            });
        });
    }

    function decryptMessages(messages, keypair, withSummary) {

      var now = Date.now();
      var issuerBoxPks = {}; // a map used as cache

      var jobs = [esWallet.box.getKeypair(keypair)];
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
                  if (withSummary) {
                    fillSummary(message);
                  }
                  else if (content){
                    message.html = esHttp.util.parseAsHtml(content);
                  }
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
          console.debug('[ES] [message] All messages decrypted in ' + (Date.now() - now) + 'ms');
          return messages;
        });

    }

    // Compute a summary (truncated to 140 characters), from the message content
    function fillSummary(message) {
      if (message.content) {
        message.summary = message.content.replace(/(^|[\n\r]+)\s*>[^\n\r]*/g, '').trim();
        if (message.summary.length > 140) {
          message.summary = message.summary.substring(0, 137) + '...';
        }
      }
    }

    function removeMessage(id, type, options) {
      type = type || 'inbox';

      var wallet = options.wallet || (options.walletId && csWallet.children.get(options.walletId)) || csWallet;

      return esHttp.record.remove('message', type)(id, {wallet: wallet})
        .then(function(res) {
          // Update message count
          if (type === 'inbox') {
            wallet.data.messages = wallet.data.messages || {};
            wallet.data.messages.count = wallet.data.messages.count > 0 ? wallet.data.messages.count-1 : 0;
          }

          // Raise event
          if (wallet.isDefault()) {
            api.data.raise.delete(id);
          }

          return res;
        });
    }

    function removeAllMessages(type, options) {
      type = type || 'inbox';
      var wallet = options && options.walletId && csWallet.children.get(options.walletId) || csWallet;
      return wallet.auth()
        .then(function(walletData) {
          // Get all message id
          return searchMessages(walletData.pubkey, {type: type, from: 0, size: 1000, _source: false})
            .then(function (res) {
              if (!res || !res.length) return;

              var ids = _.pluck(res, 'id');

              // Remove each messages
              return $q.all(res.reduce(function (res, msg) {
                return res.concat(esHttp.record.remove('message', type)(msg.id, {wallet: wallet}));
              }, []))
                .then(function() {
                  return ids;
                });
            })
            .then(function (ids) {
              // update message count
              if (type === 'inbox') {
                wallet.data.messages = wallet.data.messages || {};
                wallet.data.messages.count = 0;
                wallet.data.messages.unreadCount = 0;
              }

              // Raise events
              if (wallet.isDefault()) {
                _.forEach(ids, api.data.raise.delete);
              }
            });
        });
    }

    // Mark a message as read
    function markMessageAsRead(message, options) {
      options = options || {};
      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      var type = options && options.type || (!wallet.isUserPubkey(message.recipient) ? 'outbox' : 'inbox');
      if (message.read) {
        var deferred = $q.defer();
        deferred.resolve();
        return deferred.promise;
      }
      message.read = true;

      return wallet.getKeypair()

      // Prepare the read_signature to sent
        .then(function(keypair) {
          return CryptoUtils.sign(message.hash, keypair);
        })

        // Send read request
        .then(function(signature){
          return raw.postReadById(signature, {id:message.id});
        })

        // Update message count
        .then(function() {
          if (type === 'inbox') {
            wallet.data.messages = wallet.data.messages || {};
            wallet.data.messages.unreadCount = wallet.data.messages.unreadCount ? wallet.data.messages.unreadCount - 1 : 0;
          }
        });
    }

    // Mark all messages as read
    function markAllMessageAsRead(options) {
      options = options || {};
      var wallet = options.wallet || options.walletId && csWallet.children.get(options.walletId) || csWallet;
      return wallet.auth()
        .then(function(walletData) {

          // Get all messages hash
          return searchMessages(walletData.pubkey, {
            type: 'inbox',
            from: 0,
            size: 1000,
            _source: ['hash', 'read_signature']
          })

            .then(function (messages) {
              if (!messages || !messages.length) return;

              // Keep only unread message
              messages = _.filter(messages, {read: false});

              // Remove  messages
              return $q.all(messages.reduce(function (res, message) {
                return res.concat(
                  // Sign hash
                  CryptoUtils.sign(message.hash, walletData.keypair)
                  // then send read request
                    .then(function (signature) {
                      return raw.postReadById(signature, {id: message.id});
                    }));
              }, []));
            })
            .then(function () {
              // update message count
              wallet.data.messages = wallet.data.messages || {};
              wallet.data.messages.unreadCount = 0;
            });
        });
    }

    // Filter messages (after decryption) searching on [title, content]
    function filterMessages(messages, filter) {
      if (filter && !filter.trim().length) return messages;

      // Init summary, removing reply content (lines starting with '>')
      messages.forEach(function(msg) {
        if (msg.content) {
          msg.summary = msg.content.replace(/(^|[\n\r]+)\s*>[^\n\r]*/g, '').trim() || '';
        }
      });

      // For each search words
      var words = filter.trim().split(' ');
      words.forEach(function(word) {
        var regexp = new RegExp(word, 'gi');
        messages.forEach(function(msg) {

          // Search on title
          var matches = regexp.exec(msg.title);
          if (matches) {
            msg.title = msg.title.replace(regexp, '<b>$&</b>');
            msg.titleMatch = (msg.titleMatch || 0) + 1;
            while(true) {
              matches = regexp.exec(msg.title.substring(matches.index + word.length));
              if (!matches || msg.titleMatch >= 10) break;
              msg.titleMatch = msg.titleMatch + 1;
            }
            return;
          }

          // Search on summary
          matches = regexp.exec(msg.summary);
          if (matches) {
            if (matches.index > 140) {
              msg.summary = '...' + msg.summary.substring(matches.index - 20);
            }
            msg.summary = msg.summary.replace(regexp, '<b>$&</b>');
            msg.contentMatch = (msg.contentMatch || 0) + 1;
            while(true) {
              matches = regexp.exec(msg.summary.substring(matches.index + word.length));
              if (!matches || msg.contentMatch >= 10) break;
              msg.contentMatch++;
            }
            if (msg.summary.length > 140) {
              msg.summary = msg.summary.substr(0, 137) + '...';
            }
          }
        });
      });

      // Keep only matches
      messages = _.filter(messages, function(msg) {
        return msg.titleMatch || msg.contentMatch;
      });

      return messages;
    }

    // Sort filtered messages by matches
    function sortFilteredMessages(messages) {
      // Sort by matches
      return _.sortBy(messages, function(msg) {
        return -1 * (
          1000 * (msg.titleMatch || 0) +
          100 * (msg.contentMatch || 0) +
          (msg.time / 10000000000));
      });
    }

    // Send message to developers - need for issue #524
    function onSendError(message) {
      var developers = csConfig.developers || [{pubkey: '38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE'/*kimamila*/}];
      if(!message || !message.content || !developers || !developers.length) return;

      console.info("[ES] [message] Sending logs to developers...");
      message.issuer = csWallet.data.pubkey;
      message.title = message.title || 'Sending log';
      message.time = moment().utc().unix();

      csWallet.getKeypair()
        .then(function(keypair) {
          return $q.all(developers.reduce(function(res, developer){
            return !developer.pubkey ? res :
              res.concat(doSendMessage(angular.merge({recipient: developer.pubkey}, message), keypair));
          }, []));
        })
        .then(function(res) {
          console.info("[ES] [message] Logs sent to {0} developers".format(res.length));
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
        csWallet.api.data.on.load($rootScope, onWalletLoad, this), // need for secondary wallets
        csWallet.api.data.on.reset($rootScope, onWalletReset, this),
        esNotification.api.event.on.newMessage($rootScope, onNewMessageEvent, this),
        // for issue #524
        csWallet.api.error.on.send($rootScope, onSendError, this)
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
          onWalletLoad(csWallet.data);
        }
      }
    }

    // Register extension points
    api.registerEvent('data', 'new');
    api.registerEvent('data', 'delete');
    api.registerEvent('data', 'sent');

    // Default action
    csPlatform.ready().then(function() {
      esHttp.api.node.on.start($rootScope, refreshState, this);
      esHttp.api.node.on.stop($rootScope, refreshState, this);
      return refreshState();
    });

    return {
      api: api,
      search: raw.search,
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
  })
;
