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
        postSearch: esHttp.post('/message/inbox/_search'),
        postSearchByType: esHttp.post('/message/:type/_search'),
        getByTypeAndId : esHttp.get('/message/:type/:id'),
        postReadById: esHttp.post('/message/inbox/:id/_read')
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
        deferred.resolve();
        return deferred.promise;
      }

      var now = new Date().getTime();
      var time = Math.trunc(now / 1000);

      // Skip if loaded less than 1 min ago
      // (This is need to avoid reload on login AND load phases)
      if (data.messages && data.messages.time && (time - data.messages.time < 30 /*=30s*/)) {
        console.debug('[ES] [message] Skipping load (loaded '+(time - data.messages.time)+'s ago)');
        deferred.resolve();
        return deferred.promise;
      }

      console.debug('[ES] [message] Loading count...');

      // Count unread messages
      countUnreadMessages(data.pubkey)
        .then(function(unreadCount){
          data.messages = data.messages || {};
          data.messages.unreadCount = unreadCount;
          data.messages.time = time;
          console.debug('[ES] [message] Loaded count (' + unreadCount + ') in '+(new Date().getTime()-now)+'ms');
          deferred.resolve(data);
        })
        .catch(function(err){
          console.error('Error while counting messages: ' + (err.message ? err.message : err));
          deferred.resolve(data);
        });
      return deferred.promise;
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

    // Listen message changes
    function onNewMessageEvent(event) {
      console.debug("[ES] [message] detected new message (from notification service)");

      var notification = new Notification(event);
      notification.issuer = notification.pubkey;
      delete notification.pubkey;

      csWot.extend(notification, 'issuer')
        .then(function() {

          csWallet.data.messages = csWallet.data.messages || {};
          csWallet.data.messages.unreadCount++;

          // Raise event
          api.data.raise.new(notification);
        });
    }

    function sendMessage(message) {
      return csWallet.getKeypair()
        .then(function(keypair) {
          return doSendMessage(message, keypair)
            .then(function (res) {
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
              // Raise event
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
          return esHttp.record.post(boxPath)(message);
        });
    }

    function loadMessageNotifications(options) {
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
        _source: fields.notifications
      };

      return raw.postSearch(request)
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

      if (options.type == 'inbox') {
        request.query = {bool: {filter: {term: {recipient: pubkey}}}};
      }
      else {
        request.query = {bool: {filter: {term: {issuer: pubkey}}}};
      }

      return raw.postSearchByType(request, {type: options.type})
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

    function loadMessages(options) {
      options = options || {};
      options.type = options.type || 'inbox';
      options._source = fields.commons;
      options.summary = angular.isDefined(options.summary) ? options.summary : true;
      options.filter = angular.isDefined(options.filter) ? options.filter : undefined;
      options.from = options.from || 0;

      var promise = csWallet.auth()
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
          var avatarField = (options.type == 'inbox') ? 'issuer' : 'recipient';
          return csWot.extendAll(messages, avatarField);
        })

        // Update message count
        .then(function(messages){
          if (messages.length && options.filter){
            var filteredMessages = filterMessages(messages, options.filter);

            // Recursive loop, if need more
            if (filteredMessages.length < messages.length) {
              options = angular.copy(options);
              options.from += options.size;
              options.size = messages.length - filteredMessages.length;
              return loadMessages(options)
                .then(function(messages) {
                  return filteredMessages.concat(messages);
                });
            }
          }

          if (options.from === 0 && !options.filter) {
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.count = messages.length;
          }

          return messages;
        });

      // If filter, apply sorting (only once)
      if (options.from === 0 && options.filter) {
        promise.then(sortFilteredMessages);
      }

      return promise;
    }

    function getAndDecrypt(id, options) {
      options = options || {};
      options.type = options.type || 'inbox';
      options.summary = angular.isDefined(options.summary) ? options.summary : false/*summary not need by default*/;

      return csWallet.auth()
        .then(function(walletData) {
          return raw.getByTypeAndId({id: id, type: options.type})
            .then(function(hit) {
              if (!hit.found) return;
              var msg = hit._source;
              msg.id = hit._id;
              msg.read = (options.type == 'outbox') || !!msg.read_signature;
              delete msg.read_signature; // not need anymore

              // Decrypt message
              return decryptMessages([msg], walletData.keypair, options.summary)

              // Add avatar
                .then(function(){
                  var avatarField = (options.type == 'inbox') ? 'issuer' : 'recipient';
                  return csWot.extend(msg, avatarField);
                });
            });
        });
    }

    function decryptMessages(messages, keypair, withSummary) {

      var now = new Date().getTime();
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
          console.debug('[ES] [message] All messages decrypted in ' + (new Date().getTime() - now) + 'ms');
          return messages;
        });

    }

    // Compute a summary (truncated to 140 characters), from the message content
    function fillSummary(message) {
      if (message.content) {
        message.summary = message.content.replace(/(^|[\n\r]+)\s*>[^\n\r]*/g, '').trim();
        if (message.summary.length > 140) {
          message.summary = message.summary.substr(0, 137) + '...';
        }
      }
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
          // Raise event
          api.data.raise.delete(id);

          return res;
        });
    }

    function removeAllMessages(type) {
      type = type || 'inbox';

      return csWallet.auth()
        .then(function(walletData) {
          // Get all message id
          return searchMessages(walletData.pubkey, {type: type, from: 0, size: 1000, _source: false})
            .then(function (res) {
              if (!res || !res.length) return;

              var ids = _.pluck(res, 'id');

              // Remove each messages
              return $q.all(res.reduce(function (res, msg) {
                return res.concat(esHttp.record.remove('message', type)(msg.id, walletData));
              }, []))
                .then(function() {
                  return ids;
                });
            })
            .then(function (ids) {
              // update message count
              if (type == 'inbox') {
                csWallet.data.messages = csWallet.data.messages || {};
                csWallet.data.messages.count = 0;
                csWallet.data.messages.unreadCount = 0;
              }

              // Raise events
              _.forEach(ids, api.data.raise.delete);
            });
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

      return csWallet.getKeypair()

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
          if (type == 'inbox') {
            csWallet.data.messages = csWallet.data.messages || {};
            csWallet.data.messages.unreadCount = csWallet.data.messages.unreadCount ? csWallet.data.messages.unreadCount - 1 : 0;
          }
        });
    }

    // Mark all messages as read
    function markAllMessageAsRead() {
      return csWallet.auth()
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
              csWallet.data.messages = csWallet.data.messages || {};
              csWallet.data.messages.unreadCount = 0;
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
      message.time = esHttp.date.now();

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
  })
;
