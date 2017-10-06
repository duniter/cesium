angular.module('cesium.es.registry.services', ['ngResource', 'cesium.services', 'cesium.es.http.services'])

.factory('esRegistry', function($q, csSettings, esHttp, esComment, csWot) {
  'ngInject';

  function EsRegistry() {

    var
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "address", "city", "thumbnail._content_type", "picturesCount", "type", "socials", "pubkey"],
        comment: {
          commons: ["issuer", "time", "message"],
        }
      };
    var
      exports = {
        _internal: {},
      };

    exports._internal.getCategories = esHttp.get('/page/category/_search?sort=order&from=0&size=1000&_source=name,parent');

    function getCategories() {
      if (exports._internal.categories && exports._internal.categories.length) {
        var deferred = $q.defer();
        deferred.resolve(exports._internal.categories);
        return deferred.promise;
      }
      return exports._internal.getCategories()
        .then(function(res) {
          if (res.hits.total === 0) {
            exports._internal.categories = [];
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
            exports._internal.categories = categories;
          }
          return exports._internal.categories;
        });
    }

    exports._internal.getCategory = esHttp.get('/page/category/:id');

    function getCategory(params) {
      return exports._internal.getCategory(params)
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

    exports._internal.searchText = esHttp.get('/page/record/_search?q=:search');
    exports._internal.search = esHttp.post('/page/record/_search');
    exports._internal.get = esHttp.get('/page/record/:id');
    exports._internal.getCommons = esHttp.get('/page/record/:id?_source=' + fields.commons.join(','));

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
          exports.category.all(),
          // Do search
          exports._internal.search(request)
        ])
        .then(function(res) {
          var categories = res[0];
          res = res[1];

          if (!res || !res.hits || !res.hits.total) {
            return [];
          }
          return res.hits.hits.reduce(function(result, hit) {
            var record = readRecordFromHit(hit, categories);
            record.id = hit._id;
            return result.concat(record);
          }, []);
        });
    }

    function loadData(id, options) {
      options = options || {};
      options.raw = angular.isDefined(options.raw) ? options.raw : false;
      options.fecthPictures = angular.isDefined(options.fetchPictures) ? options.fetchPictures : options.raw;

      return $q.all([

        // load categories
        exports.category.all(),

        // Do get source
        options.fecthPictures ?
          exports._internal.get({id: id}) :
          exports._internal.getCommons({id: id})
      ])
      .then(function(res) {
        var categories = res[0];
        var hit = res[1];
        var record = readRecordFromHit(hit, categories);

        // parse description as Html
        if (!options.raw) {
          record.description = esHttp.util.parseAsHtml(record.description);
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

    exports.category = {
        all: getCategories,
        get: getCategory
      };
    exports.record = {
        search: search,
        load: loadData,
        add: esHttp.record.post('/page/record', {tagFields: ['title', 'description']}),
        update: esHttp.record.post('/page/record/:id/_update', {tagFields: ['title', 'description']}),
        remove: esHttp.record.remove('registry', 'record'),
        fields: {
          commons: fields.commons
        },
        picture: {
          all: esHttp.get('/page/record/:id?_source=pictures')
        },
        comment: esComment.instance('page')
      };
    exports.currency = {
        all: esHttp.get('/currency/record/_search?_source=currencyName,peers.host,peers.port'),
        get: esHttp.get('/currency/record/:id/_source')
      };
    return exports;
  }

  return EsRegistry();
})
;
