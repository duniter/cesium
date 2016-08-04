angular.module('cesium.user.services', ['cesium.services', 'cesium.es.services'])

.factory('UserService', function(APP_CONFIG, $rootScope, ESUtils, Wallet, IdentityService, UIUtils) {
  'ngInject';

  function UserService(server) {

    loadNameAndAvatar = function(data, resolve, reject) {
      if (!data || !data.pubkey) {
        if (resolve) {
          resolve();
        }
        return;
      }
      ESUtils.get('http://' + server + '/user/profile/:id?_source=avatar,title')({id: data.pubkey})
      .then(function(res) {
        if (res && res._source) {
          data.name = res._source.title;
          data.avatar = res._source.avatar;
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

    loadNamesAndAvatars = function(datas, resolve, reject) {
      if (!datas) {
        if (resolve) {
          resolve();
        }
        return;
      }

      var size = datas.length;
      var map = {};
      var pubkeys = datas.reduce(function(res, data) {
        map[data.pub] = data;
        return res.concat(data.pub);
      }, []);

      var request = {
        query : {
          constant_score:{
            filter: {
              terms: { _id : pubkeys}
            }
          }
        },
        from: 0,
        size: size,
        _source: ["title", "avatar"]
      };

      ESUtils.post('http://' + server + '/user/profile/_search?pretty')(request)
      .then(function(res) {
        if (res.hits.total === 0) {
          resolve(datas);
        }
        else {
          _.forEach(res.hits.hits, function(hit) {
            var data = map[hit._id];
            var avatar = hit._source.avatar? UIUtils.image.fromAttachment(hit._source.avatar) : null;
            if (avatar) {
              data.avatarStyle={'background-image':'url("'+avatar.src+'")'};
              data.avatar=avatar;
            }
            data.name=hit._source.title;
          });
        }
        resolve(datas);
      })
      .catch(function(err){
        if (err && err.ucode && err.ucode == 404) {
          resolve(datas); // not found
        }
        else {
          reject(err);
        }
      });
    }

    // Extend Wallet.loadData() and IdentityService.loadData()
    Wallet.api.data.on.load($rootScope, loadNameAndAvatar);
    IdentityService.api.data.on.load($rootScope, loadNameAndAvatar);
    IdentityService.api.data.on.loadMany($rootScope, loadNamesAndAvatars);

    return {
      profile: {
        get: ESUtils.get('http://' + server + '/user/profile/:id'),
        add: ESUtils.record.post('http://' + server + '/user/profile'),
        update: ESUtils.record.post('http://' + server + '/user/profile/:id/_update'),
        avatar: ESUtils.get('http://' + server + '/user/profile/:id?_source=avatar')
      }
    };
  }

  var enable = !!APP_CONFIG.DUNITER_NODE_ES;
  if (!enable) {
    return null;
  }

  var service = UserService(APP_CONFIG.DUNITER_NODE_ES);
  service.instance = UserService;
  return service;
})
;
