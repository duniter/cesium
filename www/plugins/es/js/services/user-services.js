angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, Wallet, WotService, UIUtils, BMA, CryptoUtils, Device) {
  'ngInject';

  function factory(host, port) {

    var listeners,
      savedSettingsKeys = ['locale', 'showUDHistory', 'useRelative', 'useLocalStorage', 'plugins', 'helptip'],
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

    function onWalletLoad(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }

      esHttp.get(host, port, '/user/profile/:id?_source=avatar,title')({id: data.pubkey})
      .then(function(res) {
        if (res && res._source) {
          data.name = res._source.title;
          var avatar = res._source.avatar? UIUtils.image.fromAttachment(res._source.avatar) : null;
          if (avatar) {
            data.avatarStyle={'background-image':'url("'+avatar.src+'")'};
            data.avatar=avatar;
          }
        }
        resolve(data);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          resolve(data); // not found
        }
        else {
          reject(err);
        }
      });
    }

    function onWalletReset(data) {
      data.avatar = null;
      data.avatarStyle = null;
      data.profile = null;
      data.name = null;
    }

    function onWotLoad(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }
      esHttp.get(host, port, '/user/profile/:id')({id: data.pubkey})
      .then(function(res) {
        if (res && res._source) {
          data.name = res._source.title;
          var avatar = res._source.avatar? UIUtils.image.fromAttachment(res._source.avatar) : null;
          data.profile = res._source;
          if (avatar) {
            data.avatarStyle={'background-image':'url("'+avatar.src+'")'};
            data.avatar=avatar;
            delete res._source.avatar;
          }
          data.profile = res._source;
        }
        resolve(data);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          resolve(data); // not found
        }
        else {
          reject(err);
        }
      });
    }

    function onWotSearch(text, datas, resolve, reject, pubkeyAtributeName) {
      if (!datas) {
        if (resolve) {
          resolve();
        }
        return;
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
        resolve(datas);
        return;
      }

      var uidsByPubkey;
      var hits;
      $q.all([
        BMA.wot.member.uids()
          .then(function(res){
            uidsByPubkey = res;
          }),
        esHttp.post(host, port, '/user/profile/_search?pretty')(request)
          .then(function(res){
            hits = res.hits;
          })
      ])
      .then(function() {
        if (hits.total === 0) {
          resolve(datas);
        }
        else {
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
              if (!data.uid) {
                data.uid = hit._source.uid ? hit._source.uid : uidsByPubkey[data[pubkeyAtributeName]];
              }
              if (hit.highlight) {
                if (hit.highlight.title) {
                    data.name = hit.highlight.title[0];
                }
              }
            });
          });
        }
        resolve(datas);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          resolve(datas);
        }
        else {
          reject(err);
        }
      });
    }

    function fillAvatars(datas, pubkeyAtributeName) {
      return $q(function(resolve, reject) {
        onWotSearch(null, datas, resolve, reject, pubkeyAtributeName);
      });
    }

    function onWalletLogin(data, resolve, reject) {
      if (!data || !data.pubkey || !data.keypair) {
        if (resolve) {
          resolve();
        }
        return;
      }

      // Waiting to load crypto libs
      if (!CryptoUtils.isLoaded()) {
        console.debug('[esUser] Waiting crypto lib loading...');
        $timeout(function() {
          onWalletLogin(data, resolve, reject);
        }, 200);
        return;
      }

      console.debug('[esUser] Loading user settings from ES node...');

      // Load settings
      esHttp.get(host, port, '/user/settings/:id')({id: data.pubkey})
        .then(function(res) {
          if (!res || !res._source) {
            resolve(data);
            return;
          }
          var record = res._source;
          // Do not apply if same version
          if (record.time === csSettings.data.time) {
            console.debug('[esUser] Local settings already up to date');
            resolve(data);
            return;
          }
          var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(data.keypair);
          var nonce = CryptoUtils.util.decode_base58(record.nonce);
          // Decrypt settings content
          return CryptoUtils.box.open(record.content, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
            .then(function(json) {
              var settings = JSON.parse(json || '{}');
              settings.time = record.time;
              angular.merge(csSettings.data, settings);
              restoringSettings = true;
              csSettings.store();
              console.debug('[esUser] Successfully loaded user settings from ES node');
              console.debug(settings);
              resolve(data);
            });
        })
        .catch(function(err){
          if (err && err.ucode && err.ucode == 404) {
            console.debug('[esUser] No user settings found in ES node...');
            resolve(data); // not found
          }
          else {
            reject(err);
          }
        });
    }

    function onSettingsChanged(data) {
      if (!Wallet.isLogin()) return;

      // Waiting to load crypto libs
      if (!CryptoUtils.isLoaded()) {
        console.debug('[esUser] Waiting crypto lib loading...');
        $timeout(function() {
          onSettingsChanged(data);
        }, 200);
        return;
      }

      console.debug('[esUser] Saving user settings to ES...');

      var boxKeypair = CryptoUtils.box.keypair.fromSignKeypair(Wallet.data.keypair);
      var nonce = CryptoUtils.util.random_nonce();

      var formData = {
        issuer: Wallet.data.pubkey,
        nonce: CryptoUtils.util.encode_base58(nonce),
        time: Math.trunc(new Date().getTime() / 1000)
      };

      var dataToSaved = {};
      _.forEach(savedSettingsKeys, function(key) {
        dataToSaved[key] = data[key];
      });

      var json = JSON.stringify(dataToSaved);

      return CryptoUtils.box.pack(json, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
        .then(function(cypherText) {
          formData.content = cypherText;
          return esHttp.record.post(host, port, '/user/settings')(formData);
        })
        .then(function() {
          // Change settings version
          csSettings.data.time = formData.time;
          restoringSettings = true;
          csSettings.store();
          console.debug('[esUser] User settings saved in ES');
        })
        .catch(function(err) {
          console.error(err);
          throw new Error(err);
        })
      ;
    }

    function removeListeners() {
      console.debug("[esUser] Disable user extension");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] Enable user extension");

      // Extend Wallet.loadData() and WotService.loadData()
      listeners = [
        Wallet.api.data.on.load($rootScope, onWalletLoad, this),
        Wallet.api.data.on.reset($rootScope, onWalletReset, this),
        Wallet.api.data.on.login($rootScope, onWalletLogin, this),
        WotService.api.data.on.load($rootScope, onWotLoad, this),
        WotService.api.data.on.search($rootScope, onWotSearch, this),
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
        return $q(function(resolve, reject){
          onWalletLogin(Wallet.data, resolve, reject);
        });
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
