angular.module('cesium.es.geo.services', ['cesium.services', 'cesium.es.http.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esGeo');
    }

  })

  .factory('esGeo', function($q, csHttp) {
    'ngInject';

    var
      that = this;

    that.raw = {
      searchByAddress: csHttp.get('nominatim.openstreetmap.org', 80, '/search.php?format=json&q=:query'),
      searchByIP: csHttp.get('freegeoip.net', 80, '/json/:ip')
    };

    function searchPositionByAddress(queryString) {

      var now = new Date();
      console.debug('[ES] [geo] Searching address position [{0}]...'.format(queryString));

      return that.raw.searchByAddress({query: queryString})
        .then(function(res) {
          console.debug('[ES] [geo] Found {0} address position(s) in {0}ms'.format(res && res.length || 0, new Date().getTime() - now.getTime()));
          return res;
        });
    }

    function getCurrentPosition() {
      var defer = $q.defer();
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          if (!position || !position.coords) {
            console.error('[ES] [geo] navigator geolocation > Unknown format:', position);
            return;
          }
          defer.resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude
          });
        }, function(error) {
          defer.reject(error);
        },{timeout:5000});
      }else{
        defer.reject();
      }
      return defer.promise;
    }

    function searchPositionByIP(ip) {

      var now = new Date();
      console.debug('[ES] [geo] Searching IP position [{0}]...'.format(ip));

      return that.raw.searchByIP({ip: ip})
        .then(function(res) {
          console.debug('[ES] [geo] Found IP {0} position in {0}ms'.format(res ? 1 : 0, new Date().getTime() - now.getTime()));
          return res ? {lat: res.latitude,lng: res.longitude} : undefined;
        });
    }

    return {
      point: {
        current: getCurrentPosition,
        searchByAddress: searchPositionByAddress,
        searchByIP: searchPositionByIP
      }
    };
  });
