angular.module('cesium.es.group.services', ['cesium.platform', 'cesium.es.http.services',
  'cesium.es.profile.services', 'cesium.es.notification.services', 'cesium.es.comment.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esGroup');
    }

  })

.factory('esGroup', function($q, $rootScope, csPlatform, BMA, csSettings, esHttp, CryptoUtils, csWot, csWallet, esNotification, esComment) {
  'ngInject';

  var
    listeners,
    defaultLoadSize = 50,
    fields = {
      list: ["issuer", "title", "description", "type", "creationTime", "avatar._content_type"],
      commons: ["issuer", "title", "description", "creationTime", "time", "signature"],
      notifications: ["issuer", "time", "hash", "read_signature"]
    },
    exports = {
      _internal: {}
    };

  function onWalletInit(data) {
    data.groups = data.groups || {};
    data.groups.unreadCount = null;
  }

  function onWalletReset(data) {
    if (data.groups) {
      delete data.groups;
    }
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey) {
      deferred.resolve();
      return deferred.promise;
    }

    // Count unread notifications
    esNotification.unreadCount(data.pubkey, {codes: {
      includes: ['GROUP_INVITATION'],
      excludes: []
    }})
      .then(function(unreadCount){
        data.groups = data.groups || {};
        data.groups.unreadCount = unreadCount;
        console.debug('[ES] [group] Detecting ' + unreadCount + ' unread notifications');
        deferred.resolve(data);
      })
      .catch(function(err){
        console.error('Error while counting group notifications: ' + (err.message ? err.message : err));
        deferred.resolve(data);
      });
    return deferred.promise;
  }

  function readRecordFromHit(hit, html) {
    if (!hit) return;
    var record = hit._source;
    if (html && hit.highlight) {
      if (hit.highlight.title) {
        record.title = hit.highlight.title[0];
      }
      if (hit.highlight.description) {
        record.description = hit.highlight.description[0];
      }
      if (hit.highlight.location) {
        record.location = hit.highlight.location[0];
      }
      if (hit.highlight.tags) {
        data.tags = hit.highlight.tags.reduce(function(res, tag){
          return res.concat(tag.replace('<em>', '').replace('</em>', ''));
        },[]);
      }
    }

    // description
    if (html) {
      record.description = esHttp.util.trustAsHtml(record.description);
    }

    // avatar
    record.avatar = esHttp.image.fromHit(hit, 'avatar');

    // pictures
    if (hit._source.pictures && hit._source.pictures.reduce) {
      record.pictures = hit._source.pictures.reduce(function(res, pic) {
        return res.concat(esHttp.image.fromAttachment(pic.file));
      }, []);
    }

    return record;
  }

  exports._internal.search = esHttp.post('/group/record/_search');

  function _executeSearchRequest(request) {
    return exports._internal.search(request)
      .then(function(res) {
        if (!res || !res.hits || !res.hits.total) {
          return [];
        }
        var groups = res.hits.hits.reduce(function(res, hit) {
          var record = readRecordFromHit(hit, true/*html*/);
          record.id = hit._id;
          return record ? res.concat(record) : res;
        }, []);

        console.debug('[ES] [group] Loading {0} groups'.format(groups.length));

        return groups;
      });
  }

  function getLastGroups(options) {
    options = options || {};

    /*if (!csWallet.isLogin()) {
      return $q.when([]);
    }*/

    var request = {
      sort: {
        "time" : "desc"
      },
      from: options.from || 0,
      size: options.size || defaultLoadSize,
      _source: options._source || fields.list
    };

    return _executeSearchRequest(request);
  }

  function searchGroups(options) {
    options = options || {};

    var text = options.text && options.text.trim();
    if (!text) return getLastGroups(options);

    var request = {
      from: options.from || 0,
      size: options.size || defaultLoadSize,
      highlight: {fields : {title : {}, tags: {}}},
      _source: options._source || fields.list
    };


    var matches = [];
    var filters = [];
    // pubkey : use a special 'term', because of 'non indexed' field
    if (BMA.regexp.PUBKEY.test(text /*case sensitive*/)) {
      filters.push({term : { issuer: text}});
      filters.push({term : { pubkey: text}});
    }
    else {
      text = text.toLowerCase();
      var matchFields = ["title", "description"];
      matches.push({multi_match : { query: text,
        fields: matchFields,
        type: "phrase_prefix"
      }});
      matches.push({match : { title: text}});
      matches.push({match : { description: text}});
    }

    request.query = {bool: {}};
    if (matches.length > 0) {
      request.query.bool.should =  matches;
    }
    if (filters.length > 0) {
      request.query.bool.filter =  filters;
    }




    return _executeSearchRequest(request);
  }

  exports._internal.get = esHttp.get('/group/record/:id');
  exports._internal.getCommons = esHttp.get('/group/record/:id?_source=' + fields.commons.join(','));

  function loadData(id, options) {
    options = options || {};
    options.fecthPictures = angular.isDefined(options.fetchPictures) ? options.fetchPictures : false;
    options.html = angular.isDefined(options.html) ? options.html : true;

    // Do get source
    var promise = options.fecthPictures ?
      exports._internal.get({id: id}) :
      exports._internal.getCommons({id: id});

    return promise
      .then(function(hit) {
        var record = readRecordFromHit(hit, options.html);

        // Load issuer (avatar, name, uid, etc.)
        return csWot.extend({pubkey: record.issuer})
          .then(function(issuer) {
            return {
              id: hit._id,
              issuer: issuer,
              record: record
            };
          });
      });
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend csWallet.loadData()
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.init($rootScope, onWalletInit, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [group] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [group] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        onWalletLogin(csWallet.data);
      }
    }
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  return {
    record: {
      last: getLastGroups,
      search: searchGroups,
      load: loadData,
      add: esHttp.record.post('/group/record'),
      update: esHttp.record.post('/group/record/:id/_update'),
      remove: esHttp.record.remove('group', 'record'),
      fields: {
        commons: fields.commons
      },
      picture: {
        all: esHttp.get('/group/record/:id?_source=pictures')
      },
      comment: esComment.instance('group')
    }
  };
})
;
