angular.module('cesium.es.registry.services', ['ngResource', 'cesium.services', 'cesium.es.http.services', 'cesium.es.like.services'])
.config(function(PluginServiceProvider, csConfig) {
  'ngInject';

  var enable = csConfig.plugins && csConfig.plugins.es;
  if (enable) {
    // Will force to load this service
    PluginServiceProvider.registerEagerLoadingService('esRegistry');
  }

})

.factory('esRegistry', function($rootScope, $q, csPlatform, csSettings, csWallet, csWot, esHttp, esComment, esLike, esGeo) {
  'ngInject';

  var
    fields = {
      commons: ["title", "description", "issuer", "time", "address", "city", "creationTime", "avatar._content_type",
        "picturesCount", "type", "category", "socials", "pubkey",
        "geoPoint"
      ]
    },
    that = this,
    listeners;

  that.raw = {
    count: esHttp.get('/page/record/_search?size=0&q=issuer::pubkey'),
    searchText: esHttp.get('/page/record/_search?q=:search'),
    search: esHttp.post('/page/record/_search'),
    get: esHttp.get('/page/record/:id'),
    getCommons: esHttp.get('/page/record/:id?_source=' + fields.commons.join(',')),
    category: {
      get: esHttp.get('/page/category/:id'),
      all: esHttp.get('/page/category/_search?sort=order&from=0&size=1000&_source=name,parent')
    }
  };

  function onWalletReset(data) {
    data.pages = null;
  }

  function onWalletLoad(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [registry] Loading pages count...');

    // Load subscriptions count
    that.raw.count({pubkey: data.pubkey})
      .then(function(res) {
        data.pages = data.pages || {};
        data.pages.count = res && res.hits && res.hits.total;
        console.debug('[ES] [registry] Loaded pages count (' + data.pages.count  + ')');
        deferred.resolve(data);
      })
      .catch(function(err) {
        console.error('[ES] [registry] Error while counting page: ' + (err.message ? err.message : err));
        deferred.resolve(data);
      });

    return deferred.promise;
  }

  function getCategories() {
    if (that.raw.categories && that.raw.categories.length) {
      var deferred = $q.defer();
      deferred.resolve(that.raw.categories);
      return deferred.promise;
    }
    return that.raw.category.all()
      .then(function(res) {
        if (res.hits.total === 0) {
          that.raw.categories = [];
        }
        else {
          var categories = res.hits.hits.reduce(function(result, hit) {
            var cat = hit._source;
            cat.id = hit._id;
            return result.concat(cat);
          }, []);
          // add as map also
          _.forEach(categories, function(cat) {
            categories[cat.id] = cat;
          });
          that.raw.categories = categories;
        }
        return that.raw.categories;
      });
  }

  function getCategory(params) {
    return that.raw.category.get(params)
      .then(function(hit) {
        var res = hit._source;
        res.id = hit._id;
        return res;
      });
  }

  function readRecordFromHit(hit, categories) {
    if (!hit) return;
    var record = hit._source;
    if (record.category && record.category.id) {
      record.category = categories[record.category.id];
    }
    if (hit.highlight) {
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
        record.tags = hit.highlight.tags.reduce(function(res, tag){
          return res.concat(tag.replace('<em>', '').replace('</em>', ''));
        },[]);
      }
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


  function search(request) {
    request = request || {};
    request.from = request.from || 0;
    request.size = request.size || 20;
    request._source = request._source || fields.commons;
    request.highlight = request.highlight || {
        fields : {
          title : {},
          description : {}
        }
    };

    return $q.all([
        // load categories
        getCategories(),
        // Do search
        that.raw.search(request)
      ])
      .then(function(res) {
        var categories = res[0];
        res = res[1];

        if (!res || !res.hits || !res.hits.total) {
          return {
            total: 0,
            hits: []
          };
        }

        // Get geo_distance filter
        var geoDistanceObj = esHttp.util.findObjectInTree(request.query, 'geo_distance');
        var geoPoint = geoDistanceObj && geoDistanceObj.geoPoint;
        var geoDistanceUnit = geoDistanceObj && geoDistanceObj.distance && geoDistanceObj.distance.replace(new RegExp("[0-9 ]+", "gm"), '');

        var hits = res.hits.hits.reduce(function(result, hit) {
          var record = readRecordFromHit(hit, categories);
          record.id = hit._id;

          // Add distance to point
          if (geoPoint && record.geoPoint && geoDistanceUnit) {
            record.distance = esGeo.point.distance(
              geoPoint.lat, geoPoint.lon,
              record.geoPoint.lat, record.geoPoint.lon,
              geoDistanceUnit
            );
          }
          return result.concat(record);
        }, []);

        return {
          total: res.hits.total,
          hits: hits
        };
      });
  }

  function loadData(id, options) {
    options = options || {};
    options.raw = angular.isDefined(options.raw) ? options.raw : false;
    options.fecthPictures = angular.isDefined(options.fetchPictures) ? options.fetchPictures : options.raw;

    return $q.all([

      // load categories
      getCategories(),

      // Do get source
      options.fecthPictures ?
        that.raw.get({id: id}) :
        that.raw.getCommons({id: id})
    ])
    .then(function(res) {
      var categories = res[0];
      var hit = res[1];
      var record = readRecordFromHit(hit, categories);

      // parse description as Html
      if (!options.raw) {
        record.description = esHttp.util.parseAsHtml(record.description, {
          tagState: 'app.wot_lookup.tab_registry'
        });
      }

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
    // Extend
    listeners = [
      csWallet.api.data.on.load($rootScope, onWalletLoad, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [subscription] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [subscription] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLoad(csWallet.data);
      }
    }
  }

  // Default actions
  csPlatform.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  that.category = {
      all: getCategories,
      get: getCategory
    };
  that.record = {
      search: search,
      load: loadData,
      add: esHttp.record.post('/page/record', {tagFields: ['title', 'description'], creationTime: true}),
      update: esHttp.record.post('/page/record/:id/_update', {tagFields: ['title', 'description']}),
      remove: esHttp.record.remove('page', 'record'),
      fields: {
        commons: fields.commons
      },
      picture: {
        all: esHttp.get('/page/record/:id?_source=pictures')
      },
      like: esLike.instance('page', 'record'),
      comment: esComment.instance('page')
    };
  that.currency = {
      all: esHttp.get('/currency/record/_search?_source=currencyName,peers.host,peers.port'),
      get: esHttp.get('/currency/record/:id/_source')
    };
  return that;
})
;
