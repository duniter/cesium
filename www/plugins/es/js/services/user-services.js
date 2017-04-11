angular.module('cesium.es.user.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esUser');
    }

  })

.factory('esUser', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize,
                            esSettings, CryptoUtils, UIUtils, csWallet, csWot, BMA, Device) {
  'ngInject';
  var
    constants = {
      contentTypeImagePrefix: "image/",
      ES_USER_API_ENDPOINT: "ES_USER_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))"
    },
    regexp = {
      ES_USER_API_ENDPOINT: exact(constants.ES_USER_API_ENDPOINT)
    },
    that = this,
    listeners;

  that.raw = {
    profile: {
      getFields: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content&_source=:fields'),
      get: esHttp.get('/user/profile/:id?&_source_exclude=avatar._content'),
      search: esHttp.post('/user/profile/_search')
    }
  };

  function exact(regexpContent) {
    return new RegExp("^" + regexpContent + "$");
  }

  function loadProfileAvatarAndName(pubkey) {
    return that.raw.profile.getFields({id: pubkey, fields: 'title,avatar._content_type'})
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

  function loadProfile(pubkey) {
    return that.raw.profile.get({id: pubkey})
      .then(function(res) {
        var profile;
        if (res && res._source) {
          // name
          profile = {name: res._source.title};

          // other fields
          profile.source = res._source;

          // avatar
          profile.avatar = esHttp.image.fromHit(res, 'avatar');
          delete profile.source.avatar; // not need anymore

          profile.source.description = esHttp.util.trustAsHtml(profile.source.description);
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
      return $timeout(function() {
        return onWalletLogin(data, deferred);
      }, 50);
    }

    console.debug('[ES] [user] Loading user avatar+name...');
    var now = new Date().getTime();

    loadProfileAvatarAndName(data.pubkey)
      .then(function(profile) {
        if (profile) {
          data.name = profile.name;
          data.avatarStyle = profile.avatarStyle;
          data.avatar = profile.avatar;
          console.debug('[ES] [user] Loaded user avatar+name in '+ (new Date().getTime()-now) +'ms');
        }
        else {
          console.debug('[ES] [user] No user avatar+name found');
        }
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

    console.debug('[ES] [user] Loading full user profile...');
    var now = new Date().getTime();

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
          console.debug('[ES] [user] Loaded full user profile in '+ (new Date().getTime()-now) +'ms');
        }
        deferred.resolve();
      });

    return deferred.promise;
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
    that.raw.profile.search(request)
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

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet and csWot events
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

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [user] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [user] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  function parseEndPoint(endpoint) {
    var matches = regexp.ES_USER_API_ENDPOINT.exec(endpoint);
    if (!matches) return;
    return {
      "dns": matches[2] || '',
      "ipv4": matches[4] || '',
      "ipv6": matches[6] || '',
      "port": matches[8] || 80
    };
  }

  // Default actions
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.node = {
      summary: esHttp.get('/node/summary'),
      parseEndPoint: parseEndPoint
    };
  that.profile = {
      get: esHttp.get('/user/profile/:id'),
      add: esHttp.record.post('/user/profile'),
      update: esHttp.record.post('/user/profile/:id/_update'),
      avatar: esHttp.get('/user/profile/:id?_source=avatar'),
      fillAvatars: fillAvatars
    };
  that.settings = {
      get: esHttp.get('/user/settings/:id'),
      add: esHttp.record.post('/user/settings'),
      update: esHttp.record.post('/user/settings/:id/_update'),
    };
  that.websocket = {
      event: function() {
        return esHttp.ws('/ws/event/user/:pubkey/:locale');
      },
      change: function() {
        return esHttp.ws('/ws/_changes');
      }
    };
  that.constants = constants;

  return that;
})
;
