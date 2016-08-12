angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider) {
    'ngInject';

    PluginServiceProvider.registerEagerLoadingService('esUser');

  })

.factory('esUser', function($rootScope, esHttp, Wallet, WotService, UIUtils, BMA) {
  'ngInject';

  function ESUser(server) {

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

    onWalletLoad = function(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }
      esHttp.get('/user/profile/:id?_source=avatar,title')({id: data.pubkey})
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

    onWotLoad = function(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }
      esHttp.get('/user/profile/:id')({id: data.pubkey})
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

    onWotSearch = function(text, datas, resolve, reject) {
      if (!datas) {
        if (resolve) {
          resolve();
        }
        return;
      }

      var text = text.toLowerCase().trim();
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
        var pubkeys = datas.reduce(function(res, data, resolve, reject) {
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
        return esHttp.post('/user/profile/_search?pretty')(request);
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

    // Extend Wallet.loadData() and WotService.loadData()
    listeners = [
      Wallet.api.data.on.load($rootScope, onWalletLoad, this),
      WotService.api.data.on.load($rootScope, onWotLoad, this),
      WotService.api.data.on.search($rootScope, onWotSearch, this)
    ];

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    return {
      copy: copy,
      profile: {
        get: esHttp.get('/user/profile/:id'),
        add: esHttp.record.post('/user/profile'),
        update: esHttp.record.post('/user/profile/:id/_update'),
        avatar: esHttp.get('/user/profile/:id?_source=avatar')
      }
    };
  }

  var service = ESUser();
  service.instance = ESUser;
  return service;
})
;
