
angular.module('cesium.map.wot.services', ['cesium.services'])

.factory('mapWot', function($q, csHttp, esHttp, esSettings, csWot, BMA, esGeo) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 1000
    },
    fields = {
      min: ["title", "geoPoint"],
      profile: ["title", "geoPoint", "avatar._content_type", "address", "city"]
    };

  that.raw = {
    profile: {
      search: esHttp.post('/user/profile/_search'),
      mixedSearch: esHttp.post('/user,page,group/profile,record/_search')
      //FOR DEV ONLY mixedSearch: esHttp.post('/page/record/_search')
    }
  };

  /**
   * Convert Leaflet BBox into ES BBox query
   * see https://www.elastic.co/guide/en/elasticsearch/reference/2.4/geo-point.html
   * @param bounds
   */
  function createFilterQuery(options) {
    var bounds = options && options.bounds;
    if (!bounds) throw new Error('Missing options.bounds!');

    var minLon = Math.min(bounds.northEast.lng, bounds.southWest.lng),
      minLat = Math.min(bounds.northEast.lat, bounds.southWest.lat),
      maxLon = Math.max(bounds.northEast.lng, bounds.southWest.lng),
      maxLat = Math.max(bounds.northEast.lat, bounds.southWest.lat);

    return {constant_score: {
      filter: [
        {exists: {field: "geoPoint"}},
        {geo_bounding_box: {geoPoint: {
              top_left: {
                lat: maxLat,
                lon: minLon
              },
              bottom_right: {
                lat: minLat,
                lon: maxLon
              }
            }
          }}
      ]
    }};
  }

  function createSliceQueries(options, total) {
    var bounds = options && options.bounds;
    if (!bounds) throw new Error('Missing options.bounds!');

    var minLon = Math.min(bounds.northEast.lng, bounds.southWest.lng),
      minLat = Math.min(bounds.northEast.lat, bounds.southWest.lat),
      maxLon = Math.max(bounds.northEast.lng, bounds.southWest.lng),
      maxLat = Math.max(bounds.northEast.lat, bounds.southWest.lat);

    var queries = [];
    var lonStep = (maxLon - minLon) / 5;
    var latStep = (maxLat - minLat) / 5;
    for (var lon = minLon; lon < maxLon; lon += lonStep) {
      for (var lat = minLat; lat < maxLat; lat += latStep) {
        queries.push({constant_score: {
            filter: [
              {exists: {field: "geoPoint"}},
              {geo_bounding_box: {
                geoPoint: {
                  top_left: {
                    lat: lat + latStep,
                    lon: lon
                  },
                  bottom_right: {
                    lat: lat,
                    lon: lon + lonStep
                  }
                }
              }}
            ]
          }});
      }
    }
    return queries;
  }

  function load(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;

    options.fields = options.fields || {};

    var countRequest = {
      query: createFilterQuery(options),
      size: 0
    };

    var mixedSearch = false;

    var search = mixedSearch ? that.raw.profile.mixedSearch : that.raw.profile.search;

    return $q.all([
        search(countRequest),
        BMA.wot.member.uids(),
        BMA.wot.member.pending()
          .then(function(res) {
            return (res.memberships && res.memberships.length) ? res.memberships : [];
          })
      ])
      .then(function(res) {
        var total = res[0].hits && res[0].hits.total || 0;
        var uids = res[1];
        var memberships = res[2];

        if (!total) return []; // No data

        var now = Date.now();
        console.info('[map] [wot] Loading {0} profiles...'.format(total));

        // Transform pending MS into a map by pubkey
        memberships = memberships.reduce(function(res, ms){
          if (ms.membership === 'IN' && !uids[ms.pubkey]) {
            var idty = {
              uid: ms.uid,
              pubkey: ms.pubkey,
              block: ms.blockNumber,
              blockHash: ms.blockHash,
              pending: true
            };
            var otherIdtySamePubkey = res[ms.pubkey];
            if (otherIdtySamePubkey && idty.block > otherIdtySamePubkey.block) {
              return res; // skip
            }
            res[idty.pubkey] = idty;
          }
          return res;
        }, {});

        var searchRecursive = function(request, result) {
          request.from = request.from || 0;
          request.size = request.size || constants.DEFAULT_LOAD_SIZE;
          result = result || {hits: {hits: []}};

          // DEBUG
          //console.debug('Searching... ' + request.from);

          return search(request).then(function(res) {
            if (!res.hits || !res.hits.hits.length) return result;
            result.hits.total = res.hits.total
            result.hits.hits = result.hits.hits.concat(res.hits.hits);
            if (result.hits.hits.length < result.hits.total) {
              request.from += request.size;
              if (request.from >= 10000) {
                console.error("Cannot load more than 10000 profiles in a slice. Please reduce slice size!");
                return result; // Skip if too large
              }
              return searchRecursive(request, result);
            }
            return result;
          })
        }
        var processRequestResultFn = function(subRes) {
          if (!subRes.hits || !subRes.hits.hits.length) return [];
          return processLoadHits(options, uids, memberships, subRes);
        };


        return $q.all(createSliceQueries(options, total)
          .reduce(function(res, query) {
            var request = {query: query, _source: fields.profile};
            return res.concat(searchRecursive(request).then(processRequestResultFn));
          }, []))
          .then(function(res){
            var result = res.reduce(function(res, items) {
              return res.concat(items);
            }, []);
            console.info('[map] [wot] Loaded {0} profiles in {1}ms'.format(result.length, Date.now() - now));

            return result;
          });
      });
  }

  function processLoadHits(options, uids, memberships, res) {

    // Transform profile hits
    var commaRegexp = new RegExp(',');
    var items = res.hits.hits.reduce(function(res, hit) {
      var pubkey =  hit._id;
      var uid = uids[pubkey];
      var item = uid && {uid: uid} || memberships[pubkey] || {};
      item.pubkey = pubkey;
      item.index = hit._index;

      // City & address
      item.city = hit._source.city;
      item.address = hit._source.address;

      // Set geo point
      item.geoPoint = hit._source.geoPoint;
      // Convert lat/lon to float (if need)
      if (item.geoPoint.lat && typeof item.geoPoint.lat === 'string') {
        item.geoPoint.lat = parseFloat(item.geoPoint.lat.replace(commaRegexp, '.'));
      }
      if (item.geoPoint.lon && typeof item.geoPoint.lon === 'string') {
        item.geoPoint.lon = parseFloat(item.geoPoint.lon.replace(commaRegexp, '.'));
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
      //item.description = hit._source.description && esHttp.util.parseAsHtml(hit._source.description);

      return item.geoPoint ? res.concat(item) : res;
    }, []);

    return $q.when(items);
  }

  return {
    load: load
  };

});
