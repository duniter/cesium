
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
      var boundingBox = {
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
      console.debug("[map] [wot] Filtering on bounds: ", options.bounds);
      query.bool.must = query.bool.must || [];
      query.bool.must.push({geo_bounding_box:  boundingBox});
    }
    return query;
  }

  function load(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || constants.DEFAULT_LOAD_SIZE;
    options.searchAddress = esGeo.google.isEnable() && (angular.isDefined(options.searchAddress) ? options.searchAddress : true);

    options.fields = options.fields || {};
    options.fields.description = angular.isDefined(options.fields.description) ? options.fields.description : false;

    var request = {
      query: createFilterQuery(options),
      from: 0,
      size: options.size,
      _source: options.fields.description ? fields.profile.concat("description") : fields.profile
    };

    var mixedSearch = false;
    /*var mixedSearch = esSettings.wot.isMixedSearchEnable();
    if (mixedSearch) {
      // add special fields for page and group
      request._source = request._source.concat(["type", "pubkey", "issuer", "category"]);
      console.debug("[ES] [map] Mixed search: enable");
    }*/

    var search = mixedSearch ? that.raw.profile.mixedSearch : that.raw.profile.search;

    return $q.all([
        search(request),
        BMA.wot.member.uids(),
        BMA.wot.member.pending()
          .then(function(res) {
            return (res.memberships && res.memberships.length) ? res.memberships : [];
          })
      ])
      .then(function(res) {
        var uids = res[1];
        var memberships = res[2];
        res = res[0];
        if (!res.hits || !res.hits.total) return [];

        // Transform pending MS into a map by pubkey
        memberships = memberships.reduce(function(res, ms){
          if (ms.membership == 'IN' && !uids[ms.pubkey]) {
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

        var jobs = [
          processLoadHits(options, uids, memberships, res)
        ];

        // Additional slice requests
        request.from += request.size;
        var processRequestResultFn = function(subRes) {
          if (!subRes.hits || !subRes.hits.hits.length) return [];
          return processLoadHits(options, uids, memberships, subRes);
        };
        while (request.from < res.hits.total) {
          var searchRequest = search(angular.copy(request)).then(processRequestResultFn);
          jobs.push(searchRequest);
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

  function processLoadHits(options, uids, memberships, res) {

    // Transform profile hits
    var commaRegexp = new RegExp('[,]');
    var searchAddressItems = [];
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
      var now = Date.now();
      console.debug('[map] [wot] Search positions of {0} addresses...'.format(searchAddressItems.length));
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
          console.debug('[map] [wot] Resolved {0}/{1} addresses in {2}ms'.format(counter, searchAddressItems.length, Date.now()-now));
          return items;
        });
    }

    return $q.when(items);
  }

  return {
    load: load
  };

});
