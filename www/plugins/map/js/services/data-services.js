
angular.module('cesium.map.data.services', ['cesium.services'])

// [NEW] Manage events from the page #/app/wot/map
.factory('MapData', function(csHttp, esHttp, csWot) {
  'ngInject';

  var
    that = this,
    constants = {
      DEFAULT_LOAD_SIZE: 1000
    },
    fields = {
      profile: ["issuer", "title", "description", "geoPoint"]
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

    return that.raw.profile.postSearch(request)
      .then(function(res) {
        if (!res.hits || !res.hits.total) return [];

        var commaRegexp = new RegExp('[,]');

        res = res.hits.hits.reduce(function(res, hit) {
          var item = hit._source;

          if (!item.geoPoint || !item.geoPoint.lat || !item.geoPoint.lon) return res;

          // Convert lat/lon to float (if need)
          if (item.geoPoint.lat && typeof item.geoPoint.lat === 'string') {
            item.geoPoint.lat = parseFloat(item.geoPoint.lat.replace(commaRegexp, '.'));
          }
          if (item.geoPoint.lon && typeof item.geoPoint.lon === 'string') {
            item.geoPoint.lon = parseFloat(item.geoPoint.lon.replace(commaRegexp, '.'));
          }

          return res.concat(item);
        }, []);

        return csWot.extendAll(res, 'issuer');
      });
  }

  return {
    load: load
  };

});
