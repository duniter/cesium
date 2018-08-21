angular.module('cesium.es.notification.services', ['cesium.platform', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esNotification');
    }

  })

.factory('esNotification', function($rootScope, $q, $timeout,
                                    esHttp, csConfig, csSettings, csWallet, csWot, UIUtils, filterTranslations,
                                    BMA, CryptoUtils, csPlatform, Api) {
  'ngInject';

  var
    constants = {
      MESSAGE_CODES: ['MESSAGE_RECEIVED'],
      INVITATION_CODES: ['INVITATION_TO_CERTIFY'],
      DEFAULT_LOAD_SIZE: 20
    },

    fields = {
      commons: ["type", "code", "params", "reference", "recipient", "time", "hash", "read_signature"]
    },
    that = this,
    listeners,
    wsUserEventCloseFn,
    api = new Api(this, 'esNotification')
  ;

  constants.EXCLUDED_CODES = constants.MESSAGE_CODES.concat(constants.INVITATION_CODES);

  that.raw = {
    postCount: esHttp.post('/user/event/_count'),
    postSearch: esHttp.post('/user/event/_search'),
    postReadById: esHttp.post('/user/event/:id/_read'),
    ws: {
      getUserEvent: esHttp.ws('/ws/event/user/:pubkey/:locale'),
      getChanges: esHttp.ws('/ws/_changes')
    }
  };

  // Create the filter query
  function createFilterQuery(pubkey, options) {
    options = options || {};
    options.codes = options.codes || {};
    options.codes.excludes = options.codes.excludes || constants.EXCLUDED_CODES;
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
    else {
      // Excludes codes
      var excludesCodes = [];
      if (!csSettings.getByPath('plugins.es.notifications.txSent', false)) {
        excludesCodes.push('TX_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.txReceived', true)) {
        excludesCodes.push('TX_RECEIVED');
      }
      if (!csSettings.getByPath('plugins.es.notifications.certSent', false)) {
        excludesCodes.push('CERT_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.certReceived', true)) {
        excludesCodes.push('CERT_RECEIVED');
      }
      if (options.codes.excludes) {
        _.forEach(options.codes.excludes, function(code) {
          excludesCodes.push(code);
        });
      }
      if (excludesCodes.length) {
        query.bool.must_not = {terms: { code: excludesCodes}};
      }
    }

    // Filter on time
    if (options.readTime) {
      query.bool.must.push({range: {time: {gt: options.readTime}}});
    }
    return query;
  }

  // Load unread notifications count
  function loadUnreadNotificationsCount(pubkey, options) {
    if (!pubkey) {
      return $q.reject('[ES] [notification] Unable to load - missing pubkey');
    }
    var request = {
      query: createFilterQuery(pubkey, options)
    };
    // Filter unread only
    request.query.bool.must.push({missing: { field : "read_signature" }});
    return that.raw.postCount(request)
      .then(function(res) {
        return res.count;
      });
  }

  // Load user notifications
  function loadNotifications(options) {
    options = options || {};
    if (!options.pubkey) {
      return $q.reject('[ES] [notification] Unable to load - missing options.pubkey');
    }
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;
    var wallet = options.wallet || csWallet;
    var request = {
      query: createFilterQuery(options.pubkey, options),
      sort : [
        { "time" : {"order" : "desc"}}
      ],
      from: options.from,
      size: options.size,
      _source: fields.commons
    };

    return that.raw.postSearch(request)
      .then(function(res) {
        if (!res.hits || !res.hits.total) return [];
        var events;

        // Add wallet events as notifications
        if (wallet.data.events && wallet.data.events.length) {
          var time = moment().utc().unix() - filterTranslations.MEDIAN_TIME_OFFSET;
          events = (wallet.data.events || []).reduce(function(res, event) {
            if (event.type != "warn") return res;
            var notification = new Notification({}, function(self) {
              if (!self.read) {
                self.read = true;
                if (wallet.data.notifications && wallet.data.notifications.warnCount > 0) {
                  wallet.data.notifications.warnCount--;
                }
              }
            });
            notification.id=event.code;
            notification.read = false;
            notification.state = 'app.view_wallet';
            notification.avatarIcon = 'ion-alert-circled';
            notification.icon = 'ion-alert-circled assertive';
            notification.time = time;
            notification.message = event.message;
            notification.messageParams = event.messageParams;
            return res.concat(notification);
          }, []);
        }

        var notifications = res.hits.hits.reduce(function(res, hit) {
          var item = new Notification(hit._source, markNotificationAsRead);
          item.id = hit._id;
          return res.concat(item);
        }, events || []);

        return csWot.extendAll(notifications);
      });
  }

  function onNewUserEvent(event) {
    if (!event || !csWallet.isLogin()) return;

    // If notification is an invitation
    if (_.contains(constants.INVITATION_CODES, event.code)) {
      api.event.raise.newInvitation(event);
      return;
    }

    // If notification is a message
    if (_.contains(constants.MESSAGE_CODES, event.code)) {
      api.event.raise.newMessage(event);
      return;
    }

    var notification = new Notification(event, markNotificationAsRead);

    // Extend the notification entity
    return csWot.extendAll([notification])
      .then(function() {
        if (!$rootScope.$$phase) {
          $rootScope.$applyAsync(function() {
            addNewNotification(notification);
          });
        }
        else {
          addNewNotification(notification);
        }
      });
  }

  function addNewNotification(notification) {
    csWallet.data.notifications = csWallet.data.notifications || {};
    csWallet.data.notifications.unreadCount++;
    api.data.raise.new(notification);
  }

  // Mark a notification as read
  function markNotificationAsRead(notification) {
    if (notification.read || !notification.id) return; // avoid multi call
    // Should never append (fix in Duniter4j issue #12)
    if (!notification.id) {
      console.error('[ES] [notification] Could not mark as read: no \'id\' found!', notification);
      return;
    }

    // user not auth: could not mark as read
    if (!csWallet.isAuth()) return;

    notification.read = true;
    return csWallet.getKeypair()
      .then(function(keypair) {
        return CryptoUtils.sign(notification.hash, keypair)
          .then(function(signature){
            return that.raw.postReadById(signature, {id:notification.id});
          })
          .catch(function(err) {
            console.error('[ES] [notification] Error while trying to mark event as read.', err);
          });

      });
  }

  function onWalletReset(data) {
    data.notifications = data.notifications || {};
    data.notifications.unreadCount = null;
    data.notifications.warnCount = null;
    data.notifications.time = null;
    // Stop listening notification
    if (wsUserEventCloseFn) {
      wsUserEventCloseFn();
      wsUserEventCloseFn = null;
    }
  }

  function onWalletLoad(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    var now = new Date().getTime();
    var time = Math.trunc(now / 1000);

    // Skip if loaded less than 1 min ago
    // (This is need to avoid reload on login AND load phases)
    if (data.notifications && data.notifications.time && (time - data.notifications.time < 30 /*=30s*/)) {
      // update warn count
      data.notifications.warnCount = countWarnEvents(data);

      console.debug('[ES] [notification] Skipping load (loaded '+(time - data.notifications.time)+'s ago)');
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [notification] Loading count...');

    // Load unread notifications count
    loadUnreadNotificationsCount(
        data.pubkey, {
          readTime: csSettings.data.wallet ? csSettings.data.wallet.notificationReadTime : 0,
          excludeCodes: constants.EXCLUDED_CODES
        })
      .then(function(unreadCount) {
        data.notifications = data.notifications || {};
        data.notifications.unreadCount = unreadCount;
        data.notifications.warnCount = countWarnEvents(data);

        console.debug('[ES] [notification] Loaded count (' + unreadCount + ') in '+(new Date().getTime()-now)+'ms');
        deferred.resolve(data);
      })
      .catch(deferred.reject)



    return deferred.promise;
  }

  function onWalletLogin(data, deferred) {
    // Call load
    return onWalletLoad(data, deferred)

      // then start listening new events
      .then(function(){
        console.debug('[ES] [notification] Starting listen user event...');
        var wsUserEvent = that.raw.ws.getUserEvent();
        wsUserEvent.on(
          onNewUserEvent,
          {pubkey: data.pubkey, locale: csSettings.data.locale.id}
        )
          .catch(function(err) {
            console.error('[ES] [notification] Unable to listen user event', err);

            // TODO : send a event to csHttp instead ?
            // And display such connectivity errors in UI
            UIUtils.alert.error('ACCOUNT.ERROR.WS_CONNECTION_FAILED');
          });
        wsUserEventCloseFn = wsUserEvent.close;
      });
  }

  function countWarnEvents(data){
    if (!data.events) return 0;
    return data.events.reduce(function(counter, event) {
      return (event.type == "warn") ? counter+1 : counter;
    }, 0);
  }

  function addListeners() {
    // Listen some events
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.load($rootScope, onWalletLoad, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [notification] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [notification] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Register extension points
  api.registerEvent('data', 'new');
  api.registerEvent('event', 'newInvitation');
  api.registerEvent('event', 'newMessage');

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.load = loadNotifications;
  that.unreadCount = loadUnreadNotificationsCount;
  that.api = api;
  that.websocket = {
      event: that.raw.ws.getUserEvent,
      change: that.raw.ws.getChanges
    };
  that.constants = constants;

  return that;
})
;
