angular.module('cesium.es.group.services', ['ngResource', 'cesium.services', 'cesium.es.http.services',
  'cesium.es.user.services', 'cesium.es.notification.services', 'cesium.es.comment.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esGroup');
    }

  })

.factory('esGroup', function($q, $rootScope, Device, csSettings, esHttp, CryptoUtils, esUser, csWallet, esNotification, esComment) {
  'ngInject';

  function EsGroup() {

    var
      listeners,
      defaultLoadSize = 50,
      fields = {
        list: ["issuer", "title"],
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

      // thumbnail
      record.thumbnail = esHttp.image.fromHit(hit, 'thumbnail');

      // pictures
      if (hit._source.pictures && hit._source.pictures.reduce) {
        record.pictures = hit._source.pictures.reduce(function(res, pic) {
          return res.concat(esHttp.image.fromAttachment(pic.file));
        }, []);
      }

      return record;
    }

    exports._internal.search = esHttp.post('/group/record/_search');

    function searchGroups(options) {
      if (!csWallet.isLogin()) {
        return $q.when([]);
      }

      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || defaultLoadSize;
      options._source = options._source || fields.list;
      var request = {
        sort: {
          "time" : "desc"
        },
        from: options.from,
        size: options.size,
        _source: options._source
      };

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

          console.debug('[ES] [group] Loading {0} {1} messages'.format(groups.length, options.type));

          return groups;
        });
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
          return esUser.profile.fillAvatars([{pubkey: record.issuer}])
            .then(function(idties) {
              var data = {
                id: hit._id,
                issuer: idties[0],
                record: record
              };
              return data;
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
    Device.ready().then(function() {
      esHttp.api.node.on.start($rootScope, refreshState, this);
      esHttp.api.node.on.stop($rootScope, refreshState, this);
      return refreshState();
    });

    return {
      record: {
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
  }

  return EsGroup();
})
;
