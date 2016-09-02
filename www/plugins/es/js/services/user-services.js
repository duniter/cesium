angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, esHttp, csSettings, Wallet, WotService, UIUtils, BMA) {
  'ngInject';

  function factory(host, port) {

    var listeners;

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

    function onWotSearch(text, datas, resolve, reject) {
      if (!datas) {
        if (resolve) {
          resolve();
        }
        return;
      }

      text = text.toLowerCase().trim();
      var map = {};

      var request = {
        query: {},
        highlight: {
          fields : {
            title : {}
          }
        },
        from: 0,
        size: 100,
        _source: ["title", "avatar"]
      };

      if (datas.length > 0) {
        var pubkeys = datas.reduce(function(res, data) {
          map[data.pubkey] = data;
          return res.concat(data.pubkey);
        }, []);
        request.query.constant_score = {
           filter: {
             bool: {
                should: [
                  {terms : {_id : pubkeys}},
                  {bool: {
                    must: [
                      {match: { title: text}},
                      {prefix: { title: text}}
                    ]}
                  }
                ]
             }
           }
         };
      }
      else {
        request.query.bool = {
          should: [
            {match: { title: text}},
            {prefix: { title: text}}
          ]
        };
      }

      var uidsByPubkey;
      BMA.wot.member.uids()
      .then(function(res){
        uidsByPubkey = res;
        return esHttp.post(host, port, '/user/profile/_search?pretty')(request);
      })
      .then(function(res) {
        if (res.hits.total === 0) {
          resolve(datas);
        }
        else {
          _.forEach(res.hits.hits, function(hit) {
            var data = map[hit._id];
            if (!data) {
              data = {
                pubkey: hit._id
              };
              datas.push(data);
            }
            var avatar = hit._source.avatar? UIUtils.image.fromAttachment(hit._source.avatar) : null;
            if (avatar) {
              data.avatarStyle={'background-image':'url("'+avatar.src+'")'};
              data.avatar=avatar;
            }
            data.name=hit._source.title;
            if (!data.uid) {
              data.uid = hit._source.uid ? hit._source.uid : uidsByPubkey[data.pubkey];
            }
            if (hit.highlight) {
              if (hit.highlight.title) {
                  data.name = hit.highlight.title[0];
              }
            }
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

    function removeListeners() {
      console.debug("[ES] Disable plugin contribution");

      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] Enable plugin contribution");

      // Extend Wallet.loadData() and WotService.loadData()
      listeners = [
        Wallet.api.data.on.load($rootScope, onWalletLoad, this),
        Wallet.api.data.on.reset($rootScope, onWalletReset, this),
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
    csSettings.api.data.on.changed($rootScope, function(){
      refreshListeners();
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
        avatar: esHttp.get(host, port, '/user/profile/:id?_source=avatar')
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
