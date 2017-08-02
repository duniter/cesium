
angular.module('cesium.map.wot.services', ['cesium.services'])

.factory('mapWot', function($q, csHttp, esHttp, csWot, BMA, esGeo) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 1000
    },
    fields = {
      profile: ["title", "geoPoint", "avatar._content_type", "address", "city", "description"]
    };

  that.raw = {
    profile: {
      postSearch: esHttp.post('/user/profile/_search')
    }
  };

  function createFilterQuery(options) {
    options = options || {};
    var query = {
      bool: {}
    };

    // Limit to profile with geo point
    if (esGeo.google.hasApiKey()) {
      query.bool.should = [
        {exists: {field: "geoPoint"}},
        {exists: {field: "address"}},
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

    var request = {
      query: createFilterQuery(options),
      from: options.from,
      size: options.size,
      _source: fields.profile
    };

    return $q.all([
        that.raw.profile.postSearch(request),
        BMA.wot.member.uids(),
        BMA.wot.member.pending()
          .then(function(res) {
            return (res.memberships && res.memberships.length) ? res.memberships : [];
          })
      ])
      .then(function(res) {
        var uids = res[1];
        var memberships = res[2];
        var res = res[0];
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


        // Transform profile hits
        var commaRegexp = new RegExp('[,]');
        var noPositionItems = [];
        var items = res.hits.hits.reduce(function(res, hit) {
          var pubkey =  hit._id;

          var uid = uids[pubkey];
          var item = uid && {uid: uid} || memberships[pubkey] || {};
          item.pubkey = pubkey;

          // City & address
          item.city = hit._source.city;
          item.fullAddress = item.city && ((hit._source.address ? hit._source.address+ ', ' : '') + item.city);

          // Set geo point
          item.geoPoint = hit._source.geoPoint;
          if (!item.geoPoint || !item.geoPoint.lat || !item.geoPoint.lon) {
            if (!item.fullAddress) return res; // no city: exclude this item
            noPositionItems.push(item);
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
          item.description = esHttp.util.trustAsHtml(hit._source.description);

          return item.geoPoint ? res.concat(item) : res;
        }, []);

        // Resolve missing positions by addresses (only if google API enable)
        if (noPositionItems.length && esGeo.google.hasApiKey()) {
          var now = new Date().getTime();
          console.log('[map] [wot] Search positions of {0} addresses...'.format(noPositionItems.length));
          var counter = 0;

          return $q.all(noPositionItems.reduce(function(res, item) {
            return res.concat(esGeo.google.searchByAddress(item.fullAddress)
              .then(function(res) {
                if (!res || !res.length) return;
                item.geoPoint = res[0];
                delete item.fullAddress;
                items.push(item);
                counter++;
              })
              .catch(function() {/*silent*/}));
            }, []))
              .then(function(){
                console.log('[map] [wot] Resolved {0}/{1} addresses in {2}ms'.format(counter, noPositionItems.length, new Date().getTime()-now));
                return items;
              });
        }

        return items;
      });
  }


  return {
    load: load
  };

});
