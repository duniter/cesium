
angular.module('cesium.map.wot.services', ['cesium.services'])

.factory('mapWot', function($q, csHttp, esHttp, csWot, BMA) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 1000
    },
    fields = {
      profile: ["title", "geoPoint", "avatar._content_type"]
    };

  that.raw = {
    profile: {
      postSearch: esHttp.post('/user/profile/_search')
    }
  };

  function createFilterQuery(options) {
    var query = {
      bool: {
        must: [
          {exists: {field: "geoPoint"}}
        ]
      }
    };

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
        res = res.hits.hits.reduce(function(res, hit) {
          var pubkey =  hit._id;

          var uid = uids[pubkey];
          var item = uid && {uid: uid} || memberships[pubkey] || {};
          item.pubkey = pubkey;

          // Set geo point
          item.geoPoint = hit._source.geoPoint;
          if (!item.geoPoint || !item.geoPoint.lat || !item.geoPoint.lon) return res;

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
          console.log(item);

          return res.concat(item);
        }, []);

        return csWot.extendAll(res, 'pubkey');
      });
  }


  return {
    load: load
  };

});
