angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, csWallet, csWot, UIUtils, BMA, CryptoUtils, Device, Api) {
  'ngInject';

  function factory(id, host, port, wsPort) {

    var
      CONSTANTS = {
        contentTypeImagePrefix: "image/",
        ES_USER_API_ENDPOINT: "ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))"
      },
      REGEX = {
        ES_USER_API_ENDPOINT: exact(CONSTANTS.ES_USER_API_ENDPOINT)
      },
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
      };

    var listeners,
      restoringSettings = false,
      getRequestFields = esHttp.get(host, port, '/user/profile/:id?&_source_exclude=avatar._content&_source=:fields'),
      getRequest = esHttp.get(host, port, '/user/profile/:id?&_source_exclude=avatar._content')
    ;

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

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
      addListeners();
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

    function readAvatarFromSource(source) {
      var extension = source.avatar && source.avatar._content_type && source.avatar._content_type.startsWith(CONSTANTS.contentTypeImagePrefix) ?
        source.avatar._content_type.substr(CONSTANTS.contentTypeImagePrefix.length) : null;
      if (extension) {
        return esHttp.getUrl(host, port, '/user/profile/' + pubkey + '/_image/avatar.' + extension);
      }
      return null;
    }

    function loadProfileAvatarAndName(pubkey) {
      return getRequestFields({id: pubkey, fields: 'title,avatar._content_type'})
        .then(function(res) {
          var profile;
          if (res && res._source) {
            // name
            profile = {name: res._source.title};
            // avatar
            profile.avatar = esHttp.image.fromHit(host, port, res, 'avatar');
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
      return getRequest({id: pubkey})
        .then(function(res) {
          var profile;
          if (res && res._source) {
            // name
            profile = {name: res._source.title};

            // other fields
            profile.source = res._source;

            // avatar
            profile.avatar = esHttp.image.fromHit(host, port, res, 'avatar');
            delete profile.source.avatar; // not need anymore
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
      return onWotSearch(null, datas, pubkeyAtributeName);
    }

    // Load settings
    function loadSettings(pubkey, keypair) {
      return $q.all([
          CryptoUtils.box.keypair.fromSignKeypair(keypair),
          esHttp.get(host, port, '/user/settings/:id')({id: pubkey})
            .catch(function(err){
              if (err && err.ucode && err.ucode == 404) {
                return null; // not found
              }
              else {
                throw err;
              }
            })])
        .then(function(res) {
          boxKeypair = res[0];
          res = res[1];
          if (!res || !res._source) {
            return;
          }
          var record = res._source;
          // Do not apply if same version
          if (record.time === csSettings.data.time) {
            console.debug('[ES] [user] Local settings already up to date');
            return;
          }
          var nonce = CryptoUtils.util.decode_base58(record.nonce);
          // Decrypt settings content
          return CryptoUtils.box.open(record.content, nonce, boxKeypair.boxPk, boxKeypair.boxSk)
            .then(function(json) {
              var settings = JSON.parse(json || '{}');
              settings.time = record.time;
              return settings;
            })
            // if error: skip stored content
            .catch(function(err){
              console.error('[ES] [user] Could not read stored settings: ' + (err && err.message || 'decryption error'));
              return null;
            });
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
        //throw 'stop';
        $timeout(function() {
          onWalletLogin(data, deferred);
        }, 50);
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
      });

      return deferred.promise;
    }

    function onWalletFinishLoad(data, deferred) {
      deferred = deferred || $q.defer();
      // If membership pending, but not enough certifications: suggest to fill user profile
      if (!data.name && data.requirements.pendingMembership && data.requirements.needCertificationCount > 0) {
        data.events.push({type:'info',message: 'ACCOUNT.EVENT.MEMBER_WITHOUT_PROFILE'});
      }

      // Load full profile
      loadProfile(data.pubkey)
        .then(function(profile) {
          if (profile) {
            data.name = profile.name;
            // Avoid too long name (workaround for #308)
            if (data.name && data.name.length > 30) {
              data.name = data.name.substr(0, 27) + '...';
            }
            data.avatar = profile.avatar;
            data.profile = profile.source;

            // Social url must be unique in socials links - Workaround for issue #306:
            if (data.profile && data.profile.socials && data.profile.socials.length) {
              data.profile.socials = _.uniq(data.profile.socials, false, function (social) {
                return social.url;
              });
            }

          }
          deferred.resolve();
        });

      return deferred.promise;
    }

    function onWotSearch(text, datas, pubkeyAtributeName, deferred) {
      deferred = deferred || $q.defer();
      if (!text && (!datas || !datas.length)) {
        deferred.resolve(datas);
        return deferred.promise;
      }

      pubkeyAtributeName = pubkeyAtributeName || 'pubkey';
      text = text ? text.toLowerCase().trim() : text;
      var dataByPubkey;
      var request = {
        query: {},
        highlight: {fields : {title : {}}},
        from: 0,
        size: 100,
        _source: ["title", "avatar._content_type"]
      };

      if (datas.length > 0) {
        // collect pubkeys and fill values map
        dataByPubkey = {};
        _.forEach(datas, function(data) {
          var pubkey = data[pubkeyAtributeName];
          if (pubkey) {
            var values = dataByPubkey[pubkey];
            if (!values) {
              values = [data];
              dataByPubkey[pubkey] = values;
            }
            else {
              values.push(data);
            }
          }
        });
        var pubkeys = _.keys(dataByPubkey);
        // Make sure all results will be return
        request.size = (pubkeys.length <= request.size) ? request.size : pubkeys.length;
        if (!text) {
          delete request.highlight; // highlight not need
          request.query.constant_score = {
            filter: {
              terms : {_id : pubkeys}
            }
          };
        }
        else {
          request.query.constant_score = {
            filter: {bool: {should: [
                {terms : {_id : pubkeys}},
                {bool: {
                    must: [
                      {match: {title: text}},
                      {prefix: {title: text}}
                    ]}
                }
            ]}}
          };
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
        return deferred.promise;
      }

      var hits;
      var uidsByPubkey;
      $q.all([
        BMA.wot.member.uids()
          .then(function(res){
            uidsByPubkey = res;
          }),
        esHttp.post(host, port, '/user/profile/_search')(request)
          .then(function(res){
            hits = res.hits;
          })
      ])
      .then(function() {
        if (hits.total > 0) {
          _.forEach(hits.hits, function(hit) {
            var values = dataByPubkey && dataByPubkey[hit._id];
            if (!values) {
              var value = {};
              value[pubkeyAtributeName] = hit._id;
              values=[value];
              datas.push(value);
            }
            var avatar = esHttp.image.fromHit(host, port, hit, 'avatar');
            _.forEach(values, function(data) {
              // name (basic or highlighted)
              data.name = hit._source.title;
              // Avoid too long name (workaround for #308)
              if (data.name && data.name.length > 30) {
                data.name = data.name.substr(0, 27) + '...';
              }
              if (hit.highlight) {
                if (hit.highlight.title) {
                    data.name = hit.highlight.title[0];
                }
              }
              // avatar
              data.avatar=avatar;
            });
          });
        }

        // Set uid (on every data)
        _.forEach(datas, function(data) {
          if (!data.uid && data[pubkeyAtributeName]) {
            data.uid = uidsByPubkey[data[pubkeyAtributeName]];
            // Remove name if redundant with uid
            if (data.uid && data.uid == data.name) {
              return data.name;
            }
          }
        });
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

      $q.all([
        // Load full profile
        loadProfile(data.pubkey)
          .then(function(profile) {
            if (profile) {
              data.name = profile.name;
              // Avoid too long name (workaround for #308)
              if (data.name && data.name.length > 30) {
                data.name = data.name.substr(0, 27) + '...';
              }
              data.avatar = profile.avatar;
              data.profile = profile.source;

              // Social url must be unique in socials links - Workaround for issue #306:
              if (data.profile && data.profile.socials && data.profile.socials.length) {
                data.profile.socials = _.uniq(data.profile.socials, false, function(social) {
                  return social.url;
                });
              }

            }
            deferred.resolve(data);
          }),

        // Load avatar on certifications
        fillAvatars(
          (data.received_cert||[])
          .concat(data.received_cert_pending||[])
          .concat(data.given_cert||[])
          .concat(data.given_cert_pending||[])
        )
      ])
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
            time: esHttp.date.now()
          };

          var filteredData = copyUsingSpec(data, SETTINGS_SAVE_SPEC);

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
              restoringSettings = true;
              csSettings.store();
              console.debug('[ES] [user] User settings saved in ES');
            });
        })
        .catch(function(err) {
          console.error(err);
          throw err;
        })
      ;
    }

    function onWalletLoadTx(tx, deferred) {
      fillAvatars((tx.history || []).concat(tx.pendings||[]), 'pubkey')
        .then(function() {
          deferred.resolve();
        })
        .catch(function(err) {
          console.error(err);
          deferred.resolve(); // silent
        });
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
        csWallet.api.data.on.finishLoad($rootScope, onWalletFinishLoad, this),
        csWallet.api.data.on.init($rootScope, onWalletReset, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this),
        csWallet.api.data.on.loadTx($rootScope, onWalletLoadTx, this),
        csWot.api.data.on.load($rootScope, onWotLoad, this),
        csWot.api.data.on.search($rootScope, onWotSearch, this)
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

    function parseEndPoint(endpoint) {
      var matches = REGEX.ES_USER_API_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80
      };
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
        server: esHttp.getServer(host, port),
        summary: esHttp.get(host, port, '/node/summary'),
        parseEndPoint: parseEndPoint
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
          return esHttp.ws((wsPort == 443 ? 'wss' : 'ws') +'://'+esHttp.getServer(host, wsPort)+'/ws/event/user/:pubkey/:locale');
        },
        change: function() {
          return esHttp.ws((wsPort == 443 ? 'wss' : 'ws') +'://'+esHttp.getServer(host, wsPort)+'/ws/_changes');
        }
      },
      constants: CONSTANTS
    };
  }

  var host = csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null;
  var port = host ? csSettings.data.plugins.es.port : null;
  var wsPort = host ? csSettings.data.plugins.es.wsPort : port;

  var service = factory('default', host, port, wsPort);
  service.instance = factory;
  return service;
})
;
