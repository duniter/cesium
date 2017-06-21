angular.module('cesium.es.profile.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esProfile');
    }

  })

.factory('esProfile', function($rootScope, $q, esHttp, SocialUtils, csWot, csWallet, csPlatform) {
  'ngInject';

  var
    that = this,
    listeners;

  that.raw = {
    getFields: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content&_source=:fields'),
    get: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content'),
    getAll: esHttp.get('/user/profile/:id'),
    search: esHttp.post('/user/profile/_search')
  };

  function getAvatarAndName(pubkey) {
    return that.raw.getFields({id: pubkey, fields: 'title,avatar._content_type'})
      .then(function(res) {
        var profile;
        if (res && res._source) {
          // name
          profile = {name: res._source.title};
          // avatar
          profile.avatar = esHttp.image.fromHit(res, 'avatar');
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

  function getProfile(pubkey, options) {
    options = options || {};

    var get = options.raw ? that.raw.getAll : that.raw.get;
    return get({id: pubkey})
        .then(function(res) {
          if (!res || !res.found || !res._source) return undefined;

          var profile = {
            name: res._source.title,
            source: res._source
          };

          // Avoid too long name (workaround for #308)
          if (profile.name && profile.name.length > 30) {
            profile.name = profile.name.substr(0, 27) + '...';
          }

          // avatar
          profile.avatar = esHttp.image.fromHit(res, 'avatar');

          // description
          profile.description = esHttp.util.trustAsHtml(profile.source.description);

          // Social url must be unique in socials links - Workaround for issue #306:
          if (profile.source.socials && profile.source.socials.length) {
            profile.source.socials = _.uniq(profile.source.socials, false, function (social) {
              return social.url;
            });
          }

          // decrypt socials, and remove duplicated url
          return SocialUtils.open(profile.source.socials, csWallet.data.keypair)
            .then(function(){
              return profile;
            });
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

  function onWotSearch(text, datas, pubkeyAtributeName, deferred) {
    deferred = deferred || $q.defer();
    if (!text && (!datas || !datas.length)) {
      deferred.resolve(datas);
      return deferred.promise;
    }

    pubkeyAtributeName = pubkeyAtributeName || 'pubkey';
    text = text ? text.toLowerCase().trim() : text;
    var dataByPubkey;
    var tags = text ? esHttp.util.parseTags(text) : undefined;
    var request = {
      query: {},
      highlight: {fields : {title : {}, tags: {}}},
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
                    {match: {title: {query: text, boost: 2}}},
                    {prefix: {title: text}}
                  ]}
              }
          ]}}
        };

        if (tags) {
          request.query.constant_score.filter.bool.should.push({terms: {tags: tags}});
        }
      }
    }
    else if (text){
      request.query.bool = {
        should: [
          {match: {title: {
            query: text,
            boost: 2
          }}},
          {prefix: {title: text}}
        ]
      };
      if (tags) {
        request.query.bool.should.push({terms: {tags: tags}});
      }
    }
    else {
      // nothing to search: stop here
      deferred.resolve(datas);
      return deferred.promise;
    }

    var hits;
    that.raw.search(request)
    .then(function(res) {
      hits = res.hits;
      if (hits.total > 0) {
        _.forEach(hits.hits, function(hit) {
          var values = dataByPubkey && dataByPubkey[hit._id];
          if (!values) {
            var value = {};
            value[pubkeyAtributeName] = hit._id;
            values=[value];
            datas.push(value);
          }
          var avatar = esHttp.image.fromHit(hit, 'avatar');
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
              if (hit.highlight.tags) {
                data.tags = hit.highlight.tags.reduce(function(res, tag){
                  return res.concat(tag.replace('<em>', '').replace('</em>', ''));
                },[]);
              }
            }
            // avatar
            data.avatar=avatar;
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

    $q.all([
      // Load full profile
      getProfile(data.pubkey)
        .then(function(profile) {
          if (profile) {
            data.name = profile.name;
            data.avatar = profile.avatar;
            data.description = profile.description;
            data.profile = profile.source;
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

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWot events
    listeners = [
      csWot.api.data.on.load($rootScope, onWotLoad, this),
      csWot.api.data.on.search($rootScope, onWotSearch, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [profile] Disable");
      removeListeners();
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [profile] Enable");
      addListeners();
    }
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  return {
    getAvatarAndName: getAvatarAndName,
    get: getProfile,
    add: esHttp.record.post('/user/profile'),
    update: esHttp.record.post('/user/profile/:id/_update'),
    avatar: esHttp.get('/user/profile/:id?_source=avatar'),
    fillAvatars: fillAvatars
  };
})
;
