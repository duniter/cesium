angular.module('cesium.es.settings.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esSettings');
    }

  })

.factory('esSettings', function($rootScope, $q, $timeout, Api, esHttp,
                            csConfig, csSettings, CryptoUtils, Device, UIUtils, csWallet) {
  'ngInject';

  var
    SETTINGS_SAVE_SPEC = {
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
    defaultSettings = angular.merge({
        plugins: {
          es: {
            askEnable: false,
            notifications: {
              readTime: true,
              txSent: true,
              txReceived: true,
              certSent: true,
              certReceived: true
            },
            invitations: {
              readTime: true
            }
          }
        }
    }, {plugins: {es: csConfig.plugins && csConfig.plugins.es || {}}}),
    that = this,
    api = new Api('esSettings'),
    previousRemoteData,
    listeners,
    ignoreSettingsChanged = false
  ;

  that.api = api;
  that.get = esHttp.get('/user/settings/:id');
  that.add = esHttp.record.post('/user/settings');
  that.update = esHttp.record.post('/user/settings/:id/_update');

  that.isEnable = function() {
    return csSettings.data.plugins &&
      csSettings.data.plugins.es &&
      csSettings.data.plugins.es.enable &&
      !!csSettings.data.plugins.es.host;
  };

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

  // Load settings
  function loadSettings(pubkey, keypair) {
    var now = new Date().getTime();
    return $q.all([
        CryptoUtils.box.keypair.fromSignKeypair(keypair),
        that.get({id: pubkey})
          .catch(function(err){
            if (err && err.ucode && err.ucode == 404) {
              return null; // not found
            }
            else {
              throw err;
            }
          })])
      .then(function(res) {
        var boxKeypair = res[0];
        res = res[1];
        if (!res || !res._source) {
          return;
        }
        var record = res._source;
        // Do not apply if same version
        if (record.time === csSettings.data.time) {
          console.debug('[ES] [settings] Loaded user settings in '+ (new Date().getTime()-now) +'ms (no update need)');
          return;
        }
        var nonce = CryptoUtils.util.decode_base58(record.nonce);
        // Decrypt settings content
        return CryptoUtils.box.open(record.content, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
          .then(function(json) {
            var settings = JSON.parse(json || '{}');
            settings.time = record.time;
            console.debug('[ES] [settings] Loaded user settings in '+ (new Date().getTime()-now) +'ms');
            console.log(settings);
            return settings;
          })
          // if error: skip stored content
          .catch(function(err){
            console.error('[ES] [settings] Could not read stored settings: ' + (err && err.message || 'decryption error'));
            // make sure to remove time, to be able to save it again
            delete csSettings.data.time;
            return null;
          });
      });
  }

  function onSettingsReset(data, deferred) {
    deferred = deferred || $q.defer();
    angular.merge(data, defaultSettings);
    deferred.resolve(data);
    return deferred.promise;
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    // Waiting to load crypto libs
    if (!CryptoUtils.isLoaded()) {
      console.debug('[ES] [settings] Waiting crypto lib loading...');
      return $timeout(function() {
        return onWalletLogin(data, deferred);
      }, 50);
    }

    console.debug('[ES] [settings] Loading user settings...');

    // Load settings
    loadSettings(data.pubkey, data.keypair)
      .then(function(settings) {
        if (!settings) return; // not found or up to date
        angular.merge(csSettings.data, settings);

        // Remember for comparison
        previousRemoteData = settings;

        console.debug('[ES] [settings] Successfully load settings from ES');
        return storeSettingsLocally();
      })
    .then(function() {
      deferred.resolve(data);
    })
    .catch(function(err){
      deferred.reject(err);
    });

    return deferred.promise;
  }

  // Listen for settings changed
  function onSettingsChanged(data) {
    // avoid recursive call, because storeSettingsLocally() could emit event again
    if (ignoreSettingsChanged) return;

    var wasEnable = listeners && listeners.length > 0;

    refreshState();

    var isEnable = that.isEnable();
    if (csWallet.isLogin()) {
      if (!wasEnable && isEnable) {

        onWalletLogin(csWallet.data);
      }
      else {
        storeSettingsRemotely(data);
      }
    }
  }

  function storeSettingsLocally() {
    if (ignoreSettingsChanged) return $q.when();
    ignoreSettingsChanged = true;
    return csSettings.store()
      .then(function(){
        ignoreSettingsChanged = false;
      })
      .catch(function(err) {
        ignoreSettingsChanged = false;
        throw err;
      });
  }

  function storeSettingsRemotely(data) {
    if (!csWallet.isLogin()) return $q.when();

    var filteredData = copyUsingSpec(data, SETTINGS_SAVE_SPEC);
    if (previousRemoteData && angular.equals(filteredData, previousRemoteData)) {
      return $q.when();
    }

    // Waiting to load crypto libs
    if (!CryptoUtils.isLoaded()) {
      console.debug('[ES] [settings] Waiting crypto lib loading...');
      return $timeout(function() {
        return storeSettingsRemotely();
      }, 50);
    }

    var time = esHttp.date.now();
    console.debug('[ES] [settings] Saving user settings... at time ' + time);

    return $q.all([
        CryptoUtils.box.keypair.fromSignKeypair(csWallet.data.keypair),
        CryptoUtils.util.random_nonce()
      ])
      .then(function(res) {
        var boxKeypair = res[0];
        var nonce = res[1];

        var record = {
          issuer: csWallet.data.pubkey,
          nonce: CryptoUtils.util.encode_base58(nonce),
          time: time
        };

        //console.debug("Will store settings remotely: ", filteredData);

        var json = JSON.stringify(filteredData);

        return CryptoUtils.box.pack(json, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
          .then(function(cypherText) {
            record.content = cypherText;
            // create or update
            return !data.time ?
              that.add(record) :
              that.update(record, {id: record.issuer});
          });
      })
      .then(function() {
        // Update settings version, then store (on local store only)
        csSettings.data.time = time;
        previousRemoteData = filteredData;
        console.debug('[ES] [settings] Saved user settings in ' + (esHttp.date.now() - time) + 'ms');
        return storeSettingsLocally();
      })
      .catch(function(err) {
        console.error(err);
        throw err;
      })
    ;
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet.login()
    listeners = [
      csSettings.api.data.on.reset($rootScope, onSettingsReset, this),
      csWallet.api.data.on.login($rootScope, onWalletLogin, this)
    ];
  }

  function refreshState() {
    var enable = that.isEnable();

    // Disable
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [settings] Disable");
      removeListeners();


      // Force ES node to stop
      return esHttp.stop()
        .then(function() {
          // Emit event
          api.state.raise.changed(enable);
        });
    }

    // Enable
    else if (enable && (!listeners || listeners.length === 0)) {
      return esHttp.start()
        .then(function(started) {
          if (!started) {
            // TODO : alert user ?
            console.error('[ES] node could not be started !!');
          }
          else {
            console.debug("[ES] [settings] Enable");
            addListeners();

            // Emit event
            api.state.raise.changed(enable);

            if (csWallet.isLogin()) {
              return onWalletLogin(csWallet.data)
                .then(function() {
                  // Emit event
                  api.state.raise.changed(enable);
                });
            }
            else {
              // Emit event
              api.state.raise.changed(enable);
            }
          }
        });
    }
  }

  api.registerEvent('state', 'changed');

  csSettings.ready().then(function() {

    csSettings.api.data.on.changed($rootScope, onSettingsChanged, this);
    esHttp.api.node.on.stop($rootScope, function() {
      previousRemoteData = null;
    }, this);
    return refreshState();
  })

  .then(function() {
    // Ask (once) user to enable ES plugin
    if (csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.askEnable && // if config ask enable
      csSettings.data.plugins.es && !csSettings.data.plugins.es.enable && // AND user settings has disable plugin
      csSettings.data.plugins.es.askEnable // AND user has not yet answer 'NO'
    ) {
      return UIUtils.alert.confirm('ES_SETTINGS.CONFIRM.ASK_ENABLE', 'ES_SETTINGS.CONFIRM.ASK_ENABLE_TITLE',
        {
          cancelText: 'COMMON.BTN_NO',
          okText: 'COMMON.BTN_YES'
        })
        .then(function (confirm) {
          if (confirm) {
            csSettings.data.plugins.es.enable = true;
          }
          csSettings.data.plugins.es.askEnable = false;
          return csSettings.store();
        });
    }
  });

  return that;
});
