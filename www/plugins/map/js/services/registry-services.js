
angular.module('cesium.map.registry.services', ['cesium.services'])

.factory('mapRegistry', function($q, csHttp, esHttp, esSettings, csWot, BMA, esGeo) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 1000
    },
    fields = {
      record: ["title", "geoPoint", "avatar._content_type", "address", "city", "type", "pubkey", "issuer", "category"]
    };

  that.raw = {
    profile: {
      search: esHttp.post('/page/record/_search'),
      mixedSearch: esHttp.post('/user,page,group/profile,record/_search')
    }
  };

  function createFilterQuery(options) {
    options = options || {};
    var query = {
      bool: {}
    };

    // Limit to profile with geo point
    if (options.searchAddress) {
      query.bool.should = [
        {exists: {field: "geoPoint"}},
        {exists: {field: "city"}}
      ];
    }
    else {
      query.bool.must= [
        {exists: {field: "geoPoint"}}
      ];
    }

    // Filter on bounding box
    // see https://www.elastic.co/guide/en/elasticsearch/reference/2.4/geo-point.html
    if (options.bounds && options.bounds.northEast && options.bounds.southWest) {
      query.bool.should = query.bool.should || {};
      query.bool.should.geo_bounding_box = {
        "geoPoint" : {
          "top_left" : {
            "lat" : Math.max(Math.min(options.bounds.northEast.lat, 90), -90),
            "lon" : Math.max(Math.min(options.bounds.southWest.lng, 180), -180)
          },
          "bottom_right" : {
            "lat" : Math.max(Math.min(options.bounds.southWest.lat, 90), -90),
            "lon" : Math.max(Math.min(options.bounds.northEast.lng, 180), -180)
          }
        }
      };
    }
    return query;
  }

  function load(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;
    options.searchAddress = esGeo.google.isEnable() && (angular.isDefined(options.searchAddress) ? options.searchAddress : true);

    options.fields = options.fields || {};
    options.fields.description = angular.isDefined(options.fields.description) ? options.fields.description : true;

    var request = {
      query: createFilterQuery(options),
      from: 0,
      size: options.size,
      _source: options.fields.description ? fields.record.concat("description") : fields.record
    };

    // Search on profiles ?
    var mixedSearch = false;
    /*var mixedSearch = esSettings.registry.isMixedSearchEnable();
    if (mixedSearch) {
      console.debug("[ES] [map] Mixed search: enable");
    }*/

    var search = mixedSearch ? that.raw.profile.mixedSearch : that.raw.profile.search;

    return search(request)
      .then(function(res) {
        if (!res.hits || !res.hits.total) return [];

        var jobs = [
          processLoadHits(options, res)
        ];

        // Additional slice requests
        request.from += request.size;
        while (request.from < res.hits.total) {
          jobs.push(search(angular.copy(request))
            .then(function(res) {
              if (!res.hits || !res.hits.hits.length) return [];
              return processLoadHits(options, res);
            }));
          request.from += request.size;
        }
        return $q.all(jobs)
          .then(function(res){
            return res.reduce(function(res, items) {
              return res.concat(items);
            }, []);
          });
      });
  }

  function processLoadHits(options, res) {

    // Transform hits
    var commaRegexp = new RegExp('[,]');
    var searchAddressItems = [];
    var items = res.hits.hits.reduce(function(res, hit) {
      var pubkey =  hit._source.issuer;
      var item = {};
      item.issuer = pubkey;
      item.pubkey = hit._source.pubkey||item.issuer;
      item.id = hit._id;
      item.index = hit._index;
      item.type = hit._source.type;
      item.category = hit._source.category;
      if (item.category) {
        delete item.category.parent; // parent not need
      }

      // City & address
      item.city = hit._source.city;
      item.address = hit._source.address;

      // Set geo point
      item.geoPoint = hit._source.geoPoint;
      if (!item.geoPoint || !item.geoPoint.lat || !item.geoPoint.lon) {
        if (!options.searchAddress || !item.city) return res; // no city: exclude this item
        item.searchAddress = item.city && ((hit._source.address ? hit._source.address+ ', ' : '') + item.city);
        searchAddressItems.push(item);
      }
      else {
        // Convert lat/lon to float (if need)
        if (item.geoPoint.lat && typeof item.geoPoint.lat === 'string') {
          item.geoPoint.lat = parseFloat(item.geoPoint.lat.replace(commaRegexp, '.'));
        }
        if (item.geoPoint.lon && typeof item.geoPoint.lon === 'string') {
          item.geoPoint.lon = parseFloat(item.geoPoint.lon.replace(commaRegexp, '.'));
        }
      }

      // Avatar
      item.avatar = esHttp.image.fromHit(hit, 'avatar');

      // Name
      item.name = hit._source.title;
      // Avoid too long name (workaround for #308)
      if (item.name && item.name.length > 30) {
        item.name = item.name.substr(0, 27) + '...';
      }

      // Description
      item.description = hit._source.description && esHttp.util.parseAsHtml(hit._source.description);

      return item.geoPoint ? res.concat(item) : res;
    }, []);

    // Resolve missing positions by addresses (only if google API enable)
    if (searchAddressItems.length) {
      var now = new Date().getTime();
      console.debug('[map] [registry] Search positions of {0} addresses...'.format(searchAddressItems.length));
      var counter = 0;

      return $q.all(searchAddressItems.reduce(function(res, item) {
        return !item.city ? res : res.concat(esGeo.google.searchByAddress(item.searchAddress)
          .then(function(res) {
            if (!res || !res.length) return;
            item.geoPoint = res[0];
            // If search on city, add a randomized delta to avoid superposition
            if (item.city == item.searchAddress) {
              item.geoPoint.lon += Math.random() / 1000;
              item.geoPoint.lat += Math.random() / 1000;
            }
            delete item.searchAddress; // not need anymore
            items.push(item);
            counter++;
          })
          .catch(function() {/*silent*/}));
      }, []))
        .then(function(){
          console.debug('[map] [registry] Resolved {0}/{1} addresses in {2}ms'.format(counter, searchAddressItems.length, new Date().getTime()-now));
          return items;
        });
    }

    return $q.when(items);
  }

  return {
    load: load
  };

});
