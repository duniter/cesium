angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, csWallet, csWot, UIUtils, BMA, CryptoUtils, Device) {
  'ngInject';

  function factory(host, port, wsPort) {

    var listeners,
      settingsSaveSpec = {
        includes: ['locale', 'showUDHistory', 'useRelative', 'useLocalStorage', 'expertMode'],
        excludes: ['time'],
        plugins: {
          es: {
            excludes: ['enable', 'host', 'port', 'wsPort']
          }
        },
        helptip: {
          excludes: ['installDocUrl']
        }
      },
      restoringSettings = false;

    function copy(otherNode) {
      removeListeners();
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }

    function copyUsingSpec(data, copySpec) {
      var result = {};

      // Add implicit includes
      if (copySpec.includes) {
        _.forEach(_.keys(copySpec), function(key) {
          if (key != "includes" && key != "excludes") {
            copySpec.includes.push(key);
          }
        });
      }

      _.forEach(_.keys(data), function(key) {
        if ((!copySpec.includes || _.contains(copySpec.includes, key)) &&
          (!copySpec.excludes || !_.contains(copySpec.excludes, key))) {
          if (data[key] && (typeof data[key] == 'object') &&
            copySpec[key] && (typeof copySpec[key] == 'object')) {
            result[key] = copyUsingSpec(data[key], copySpec[key]);
          }
          else {
            result[key] = data[key];
          }
        }
      });
      return result;
    }

    function loadProfileAvatarAndName(pubkey) {
      return esHttp.get(host, port, '/user/profile/:id?_source=avatar,title')({id: pubkey})
        .then(function(res) {
          var profile;
          if (res && res._source) {
            profile = {name: res._source.title};
            var avatar = res._source.avatar? UIUtils.image.fromAttachment(res._source.avatar) : null;
            if (avatar) {
              profile.avatarStyle={'background-image':'url("'+avatar.src+'")'};
              profile.avatar=avatar;
            }
          }
          return profile;
        })
        .catch(function(err){
          // no profile defined
          if (err && err.ucode && err.ucode == 404) {
            return null;
          }
          else {
            throw err;
          }
        });
    }

    function loadProfile(pubkey) {
      return esHttp.get(host, port, '/user/profile/:id')({id: pubkey})
        .then(function(res) {
          var profile;
          if (res && res._source) {
            profile = {name: res._source.title};
            var avatar = res._source.avatar? UIUtils.image.fromAttachment(res._source.avatar) : null;
            if (avatar) {
              profile.avatarStyle={'background-image':'url("'+avatar.src+'")'};
              profile.avatar=avatar;
              delete res._source.avatar;
            }
            profile.source = res._source;
          }
          return profile;
        })
        .catch(function(err){
          // no profile defined
          if (err && err.ucode && err.ucode == 404) {
            return null;
          }
          else {
            throw err;
          }
        });
    }


    function fillAvatars(datas, pubkeyAtributeName) {
      return onWotSearch(null, datas, null, pubkeyAtributeName);
    }

    // Load settings
    function loadSettings(pubkey, keypair) {
      return esHttp.get(host, port, '/user/settings/:id')({id: pubkey})
        .then(function(res) {
          if (!res || !res._source) {
            return;
          }
          var record = res._source;
          // Do not apply if same version
          if (record.time === csSettings.data.time) {
            console.debug('[ES] [user] Local settings already up to date');
            return;
          }
          var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(keypair);
          var nonce = CryptoUtils.util.decode_base58(record.nonce);
          // Decrypt settings content
          return CryptoUtils.box.open(record.content, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
            .then(function(json) {
              var settings = JSON.parse(json || '{}');
              settings.time = record.time;
              return settings
            });
        })
        .catch(function(err){
          if (err && err.ucode && err.ucode == 404) {
            return null; // not found
          }
          else {
            throw err;
          }
        });
    }

    // Load unread notifications count
    function loadUnreadNotificationsCount(pubkey, readTime) {
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

      // Filter codes
      var excludesCodes = [];
      if (!csSettings.getByPath('plugins.es.notifications.txSent', false)) {
        excludesCodes.push('TX_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.txReceived', true)) {
        excludesCodes.push('TX_RECEIVED');
      }
      if (excludesCodes.length) {
        request.query.bool.must_not = {terms: { code: excludesCodes}};
      }

      // Filter time
      if (readTime) {
        request.query.bool.must.push({range: {time: {gte: readTime}}});
      }

      return esHttp.post(host, port, '/user/event/_count')(request)
        .then(function(res) {
          return res.count;
        });
    }

    // Load user notifications
    function loadNotifications(pubkey, from, size) {
      from = from || 0;
      size = size || 40;
      var request = {
        query: {
          bool: {
            must: [
              {term: {recipient: pubkey}}
            ]
          }
        },
        sort : [
          { "time" : {"order" : "desc"}}
        ],
        from: from,
        size: size,
        _source: ["type", "code", "params", "reference", "recipient", "time", "hash", "read_signature"]
      };

      // Filter codes
      var excludesCodes = [];
      if (!csSettings.getByPath('plugins.es.notifications.txSent', false)) {
        excludesCodes.push('TX_SENT');
      }
      if (!csSettings.getByPath('plugins.es.notifications.txReceived', true)) {
        excludesCodes.push('TX_RECEIVED');
      }
      if (excludesCodes.length) {
        request.query.bool.must_not = {terms: { code: excludesCodes}};
      }

      return esHttp.post(host, port, '/user/event/_search')(request)
        .then(function(res) {
          if (!res.hits || !res.hits.total) return;
          return res.hits.hits.reduce(function(res, hit) {
            var item = new Notification(hit._source, markNotificationAsRead);
            item.id = hit._id;
            return res.concat(item)
          }, []);
        });
    }

    // Mark a notification as read
    function markNotificationAsRead(notification) {
      return CryptoUtils.sign(notification.hash, csWallet.data.keypair)
        .then(function(signature){
          return esHttp.post(host, port, '/user/event/:id/_read')(signature, {id:notification.id})
        })
        .catch(function(err) {
          console.error('Error while trying to mark event as read:' + (err.message ? err.message : err));
        });
    }

    function onWalletReset(data) {
      data.avatar = null;
      data.avatarStyle = null;
      data.profile = null;
      data.name = null;
    }

    function onWalletLogin(data, deferred) {
      deferred = deferred || $q.defer();
      if (!data || !data.pubkey || !data.keypair) {
        deferred.resolve();
        return deferred.promise;
      }

      // Waiting to load crypto libs
      if (!CryptoUtils.isLoaded()) {
        console.debug('[ES] [user] Waiting crypto lib loading...');
        $timeout(function() {
          onWalletLogin(data, deferred);
        }, 200);
        return;
      }

      console.debug('[ES] [user] Loading user data from ES node...');
      $q.all([
        // Load settings
        loadSettings(data.pubkey, data.keypair)
          .then(function(settings) {
            if (!settings) { // not found
              // make sure to remove save timestamp
              delete csSettings.data.time;
              return;
            }
            angular.merge(csSettings.data, settings);
            restoringSettings = true;
            csSettings.store();
          }),

        // Load unread notifications count
        loadUnreadNotificationsCount(
            data.pubkey,
            csSettings.data.wallet ? csSettings.data.wallet.notificationReadTime : 0)
          .then(function(unreadCount) {
            data.notifications.unreadCount = unreadCount;
            data.notifications.history = null; // remove list (usefull when settings changed)
          }),

        // Load profile avatar and name
        loadProfileAvatarAndName(data.pubkey)
          .then(function(profile) {
            if (profile) {
              data.name = profile.name;
              data.avatarStyle = profile.avatarStyle;
              data.avatar = profile.avatar;
            }
          })
      ])
        .then(function() {
          console.debug('[ES] [user] Successfully loaded user data from ES node');
          deferred.resolve(data);
        })
        .catch(function(err){
          deferred.reject(err);
        })

        // Listen new events
        .then(function(){
          esHttp.ws('ws://'+esHttp.getServer(host, wsPort)+'/ws/event/user/:pubkey/:locale')
            .on(function(event) {
                $rootScope.$apply(function() {
                  $rootScope.walletData.notifications.history.splice(0, 0, new Notification(event));
                  $rootScope.walletData.notifications.unreadCount++;
                });
              },
              {pubkey: data.pubkey, locale: csSettings.data.locale.id}
            );
        });

      return deferred.promise;
    }

    function onWalletLoad(data, options, deferred) {
      deferred = deferred || $q.defer();

      options = options || {};
      options.notifications = options.notifications || {};
      if (!options.notifications.enable) {
        deferred.resolve(data);
        return deferred.promise;
      }

      // Load user notifications
      loadNotifications(data.pubkey,
        options.notifications.from,
        options.notifications.size)
      .then(function(notifications) {
        if (!notifications || !notifications.length || !options.notifications.from) {
          data.notifications.history = notifications;
        }
        else {
          // Concat (but keep original array - for data binding)
          _.forEach(notifications, function(notification){
            data.notifications.history.push(notification);
          });
        }
        deferred.resolve(data);
      })
      .catch(function(err) {
        deferred.reject(err);
      });

      return deferred.promise;
    }

    function onWalletFinishLoad(data, deferred) {
      deferred = deferred || $q.defer();
      // If membership pending, but not enough certifications: suggest to fill user profile
      if (!data.name && data.requirements.pendingMembership && data.requirements.needCertificationCount > 0) {
        data.events.push({type:'info',message: 'ACCOUNT.EVENT.MEMBER_WITHOUT_PROFILE'});
      }
      deferred.resolve();
      return deferred.promise;
    }

    function onWotSearch(text, datas, deferred, pubkeyAtributeName) {
      deferred = deferred || $q.defer();
      if (!datas) {
        deferred.resolve();
        return deferred.promise;
      }

      pubkeyAtributeName = pubkeyAtributeName || 'pubkey';
      text = text ? text.toLowerCase().trim() : text;
      var map = {};

      var request = {
        query: {},
        highlight: {fields : {title : {}}},
        from: 0,
        size: 100,
        _source: ["title", "avatar"]
      };

      if (datas.length > 0) {
        // collect pubkeys
        var pubkeys = datas.reduce(function(res, data) {
          var pubkey = data[pubkeyAtributeName];
          var values = map[pubkey];
          if (!values) {
            values = [];
            map[pubkey] = values;
          }
          values.push(data);
          return res.concat(pubkey);
        }, []);
        request.query.constant_score = {
           filter: {
             bool: {should: [{terms : {_id : pubkeys}}]}
           }
        };
        if (!text) {
          delete request.highlight; // highlight not need
        }
        else {
          request.query.constant_score.filter.bool.should.push(
            {bool: {must: [
                {match: {title: text}},
                {prefix: {title: text}}
              ]}});
        }
      }
      else if (text){
        request.query.bool = {
          should: [
            {match: {title: text}},
            {prefix: {title: text}}
          ]
        };
      }
      else {
        // nothing to search: stop here
        deferred.resolve(datas);
        return;
      }

      var hits;
      $q.all([
        BMA.wot.member.uids()
          .then(function(uidsByPubkey){
            _.forEach(datas, function(data) {
              if (!data.uid && data[pubkeyAtributeName]) {
                data.uid = uidsByPubkey[data[pubkeyAtributeName]];
              }
            });
          }),
        esHttp.post(host, port, '/user/profile/_search')(request)
          .then(function(res){
            hits = res.hits;
          })
      ])
      .then(function() {
        if (hits.total > 0) {
          _.forEach(hits.hits, function(hit) {
            var values = map[hit._id];
            if (!values) {
              var value = {};
              value[pubkeyAtributeName] = hit._id;
              values=[value];
              datas.push(value);
            }
            var avatar = hit._source.avatar? UIUtils.image.fromAttachment(hit._source.avatar) : null;
            _.forEach(values, function(data) {
              if (avatar) {
                data.avatarStyle={'background-image':'url("'+avatar.src+'")'};
                data.avatar=avatar;
              }
              data.name=hit._source.title;
              if (hit.highlight) {
                if (hit.highlight.title) {
                    data.name = hit.highlight.title[0];
                }
              }
            });
          });
        }
        deferred.resolve(datas);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          deferred.resolve(datas);
        }
        else {
          deferred.reject(err);
        }
      });

      return deferred.promise;
    }

    function onWotLoad(data, deferred) {
      deferred = deferred || $q.defer();
      if (!data || !data.pubkey) {
        deferred.resolve();
        return deferred.promise;
      }

      // Load full profile
      loadProfile(data.pubkey)
        .then(function(profile) {
          if (profile) {
            data.name = profile.name;
            data.avatarStyle = profile.avatarStyle;
            data.avatar = profile.avatar;
            data.profile = profile.source;
          }
          deferred.resolve(data);
        })
        .catch(function(err){
          deferred.reject(err);
        });
      return deferred.promise;
    }

    function onSettingsChanged(data) {
      if (!csWallet.isLogin()) return;

      // Waiting to load crypto libs
      if (!CryptoUtils.isLoaded()) {
        console.debug('[ES] [user] Waiting crypto lib loading...');
        $timeout(function() {
          onSettingsChanged(data);
        }, 200);
        return;
      }

      console.debug('[ES] [user] Saving user settings to ES...');

      var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(csWallet.data.keypair);
      var nonce = CryptoUtils.util.random_nonce();

      var record = {
        issuer: csWallet.data.pubkey,
        nonce: CryptoUtils.util.encode_base58(nonce),
        time: esHttp.date.now()
      };

      var filteredData = copyUsingSpec(data, settingsSaveSpec);

      var json = JSON.stringify(filteredData);

      return CryptoUtils.box.pack(json, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
        .then(function(cypherText) {
          record.content = cypherText;
          return !data.time ?
            // create
            esHttp.record.post(host, port, '/user/settings')(record) :
            // or update
            esHttp.record.post(host, port, '/user/settings/:pubkey/_update')(record, {pubkey: record.issuer});
        })
        .then(function() {
          // Change settings version
          csSettings.data.time = record.time;
          // Force notifications reload
          csWallet.data.notifications.history = [];
          restoringSettings = true;
          csSettings.store();
          console.debug('[ES] [user] User settings saved in ES');
        })
        .catch(function(err) {
          console.error(err);
          throw err;
        })
      ;
    }

    function removeListeners() {
      console.debug("[ES] [user] Disable");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] [user] Enable");

      // Extend csWallet.loadData() and csWot.loadData()
      listeners = [
        csWallet.api.data.on.login($rootScope, onWalletLogin, this),
        csWallet.api.data.on.load($rootScope, onWalletLoad, this),
        csWallet.api.data.on.finishLoad($rootScope, onWalletFinishLoad, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this),
        csWot.api.data.on.load($rootScope, onWotLoad, this),
        csWot.api.data.on.search($rootScope, onWotSearch, this),
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
    csSettings.api.data.on.changed($rootScope, function(data){
      if (restoringSettings) {
        restoringSettings = false;
        return;
      }

      var wasEnable = listeners && listeners.length > 0;

      refreshListeners();

      if (!wasEnable && isEnable()) {
        return onWalletLogin(csWallet.data);
      }
      else {
        onSettingsChanged(data);
      }
    });

    // Ask (once) user to enable ES plugin
    Device.ready().then(function() {

      if (csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.askEnable && // if config ask enable
        csSettings.data.plugins.es && !csSettings.data.plugins.es.enable && // AND user settings has disable plugin
        csSettings.data.plugins.es.askEnable // AND user has not yet answer 'NO'
      ) {
        UIUtils.alert.confirm('ES_SETTINGS.CONFIRM.ASK_ENABLE', 'ES_SETTINGS.CONFIRM.ASK_ENABLE_TITLE', {
          cancelText: 'COMMON.BTN_NO',
          okText: 'COMMON.BTN_YES'
        })
          .then(function (confirm) {
            if (confirm) {
              csSettings.data.plugins.es.enable = true;
            }
            csSettings.data.plugins.es.askEnable = false;
            csSettings.store();
          });
      }
    });

    // Default action
    refreshListeners();

    return {
      copy: copy,
      node: {
        server: esHttp.getServer(host, port)
      },
      profile: {
        get: esHttp.get(host, port, '/user/profile/:id'),
        add: esHttp.record.post(host, port, '/user/profile'),
        update: esHttp.record.post(host, port, '/user/profile/:id/_update'),
        avatar: esHttp.get(host, port, '/user/profile/:id?_source=avatar'),
        fillAvatars: fillAvatars
      },
      settings: {
        get: esHttp.get(host, port, '/user/settings/:id'),
        add: esHttp.record.post(host, port, '/user/settings'),
        update: esHttp.record.post(host, port, '/user/settings/:id/_update'),
      },
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
  var wsPort = host ? csSettings.data.plugins.es.wsPort : port;

  var service = factory(host, port, wsPort);
  service.instance = factory;
  return service;
})
;
