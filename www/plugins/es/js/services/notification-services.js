angular.module('cesium.es.notification.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esNotification');
    }

  })

.factory('esNotification', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, csWallet, csWot, UIUtils, BMA, CryptoUtils, Device, Api, esUser) {
  'ngInject';

  function factory(id, host, port, wsPort) {

    var listeners,
      constants = {
        MESSAGE_CODES: ['MESSAGE_RECEIVED']
      },
      api = new Api(this, 'esNotification-' + id)
    ;

    // Create the filter query
    function createFilterQuery(pubkey, options) {
      options = options || {};
      options.codes = options.codes || {};
      options.codes.excludes = options.codes.excludes || constants.MESSAGE_CODES;
      var query = {
        bool: {
          must: [
            {term: {recipient: pubkey}}
          ]
        }
      };

      // Includes codes
      if (options.codes && options.codes.includes) {
        query.bool.must.push({terms: { code: options.codes.includes}});
      }

      // Excludes codes
      var excludesCodes = [];
      if (!csSettings.getByPath('plugins.es.notifications.txSent', false)) {
        excludesCodes.push('TX_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.txReceived', true)) {
        excludesCodes.push('TX_RECEIVED');
      }
      if (options.codes.excludes) {
        _.forEach(options.codes.excludes, function(code) {
          excludesCodes.push(code);
        });
      }
      if (excludesCodes.length) {
        query.bool.must_not = {terms: { code: excludesCodes}};
      }

      // Filter on time
      if (options.readTime) {
        query.bool.must.push({range: {time: {gt: options.readTime}}});
      }
      return query;
    }

    // Load unread notifications count
    function loadUnreadNotificationsCount(pubkey, options) {
      var request = {
        query: createFilterQuery(pubkey, options)
      };
      // Filter unread only
      request.query.bool.must.push({missing: { field : "read_signature" }});
      return esHttp.post(host, port, '/user/event/_count')(request)
        .then(function(res) {
          return res.count;
        });
    }

    // Load user notifications
    function loadNotifications(pubkey, options) {
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || 40;
      var request = {
        query: createFilterQuery(pubkey, options),
        sort : [
          { "time" : {"order" : "desc"}}
        ],
        from: options.from,
        size: options.size,
        _source: ["type", "code", "params", "reference", "recipient", "time", "hash", "read_signature"]
      };

      return esHttp.post(host, port, '/user/event/_search')(request)
        .then(function(res) {
          if (!res.hits || !res.hits.total) return;
          var notifications = res.hits.hits.reduce(function(res, hit) {
            var item = new Notification(hit._source, markNotificationAsRead);
            item.id = hit._id;
            return res.concat(item)
          }, []);

          return esUser.profile.fillAvatars(notifications);
        });
    }

    function listenNewNotification(data) {
      esHttp.ws('ws://'+esHttp.getServer(host, wsPort)+'/ws/event/user/:pubkey/:locale')
        .on(function(event) {
            $rootScope.$apply(function() {
              var notification = new Notification(event, markNotificationAsRead);
              esUser.profile.fillAvatars([notification])
                .then(function() {
                  var isMessage = _.contains(constants.MESSAGE_CODES, event.code);
                  notification.isMessage = isMessage;
                  if (!isMessage) {
                    data.notifications = data.notifications || {};
                    data.notifications.unreadCount++;
                  }
                  else {
                    data.messages = data.messages || {};
                    data.messages.unreadCount++;
                  }
                  api.data.raise.new(notification);
                });
            });
          },
          {pubkey: data.pubkey, locale: csSettings.data.locale.id}
        );
    }

    // Mark a notification as read
    function markNotificationAsRead(notification) {
      if (notification.read) return; // avoid multi call
      notification.read = true;
      CryptoUtils.sign(notification.hash, csWallet.data.keypair)
        .then(function(signature){
          return esHttp.post(host, port, '/user/event/:id/_read')(signature, {id:notification.id})
        })
        .catch(function(err) {
          console.error('Error while trying to mark event as read:' + (err.message ? err.message : err));
        });
    }

    function onWalletReset(data) {
      data.notifications = data.notifications || {};
      data.notifications.unreadCount = null;
    }

    function onWalletLogin(data, deferred) {
      deferred = deferred || $q.defer();
      if (!data || !data.pubkey || !data.keypair) {
        deferred.resolve();
        return deferred.promise;
      }

      console.debug('[ES] [notification] Loading count from ES node...');

      // Load unread notifications count
      loadUnreadNotificationsCount(
          data.pubkey, {
            readTime: csSettings.data.wallet ? csSettings.data.wallet.notificationReadTime : 0,
            excludeCodes: ['MESSAGE_RECEIVED']
          })
        .then(function(unreadCount) {
          data.notifications = data.notifications || {};
          data.notifications.unreadCount = unreadCount;
          console.debug('[ES] [notification] Successfully load count from ES node');
          deferred.resolve(data);
        })
        .catch(function(err){
          deferred.reject(err);
        })

        // Listen new events
        .then(function(){
          listenNewNotification(data);
        });

      return deferred.promise;
    }

    function removeListeners() {
      console.debug("[ES] [notification] Disable");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] [notification] Enable");

      // Extend csWallet.loadData() and csWot.loadData()
      listeners = [
        csWallet.api.data.on.login($rootScope, onWalletLogin, this),
        csWallet.api.data.on.init($rootScope, onWalletReset, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this)
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

    // Default action
    refreshListeners();

    // Register extension points
    api.registerEvent('data', 'new');

    return {
      load: loadNotifications,
      api: api,
      websocket: {
        event: function() {
          return esHttp.ws('ws://'+esHttp.getServer(host, wsPort)+'/ws/event/user/:pubkey/:locale');
        },
        change: function() {
          return esHttp.ws('ws://'+esHttp.getServer(host, wsPort)+'/ws/_changes');
        }
      }
    };
  }

  var host = csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null;
  var port = host ? csSettings.data.plugins.es.port : null;
  var wsPort = host && csSettings.data.plugins.es.wsPort ? csSettings.data.plugins.es.wsPort : port;

  var service = factory('default', host, port, wsPort);
  service.instance = factory;
  return service;
})
;
