angular.module('cesium.cache.services', ['angular-cache'])

.factory('csCache', function($http, $window, csSettings, CacheFactory) {
  'ngInject';

  var
    constants = {
      VERY_LONG: 54000000, /*15 days*/
      LONG: 1 * 60  * 60 * 1000 /*1 hour*/,
      MEDIUM: 5  * 60 * 1000 /*5 min*/,
      SHORT: csSettings.defaultSettings.cacheTimeMs // around 1min
    },
    cacheNames = []
  ;

  function getOrCreateCache(prefix, maxAge, onExpire){
    prefix = prefix || 'csCache-';
    maxAge = maxAge || constants.SHORT;
    var cacheName = prefix + (maxAge / 1000);

    // FIXME: enable this when cache is cleaning on rollback
    var storageMode = csSettings.data.useLocalStorage && $window.localStorage ? 'localStorage' : 'memory';

    if (!onExpire) {
      if (!cacheNames[cacheName]) {
        cacheNames[cacheName] = true;
        console.debug("[cache] Creating cache {0}...".format(cacheName));
      }
      return CacheFactory.get(cacheName) ||
        CacheFactory.createCache(cacheName, {
          maxAge: maxAge,
          deleteOnExpire: 'passive',
          //cacheFlushInterval: 60 * 60 * 1000, //  clear itself every hour
          recycleFreq: Math.max(maxAge - 1000, 5 * 60 * 1000 /*5min*/),
          storageMode: storageMode
        });
    }
    else {
      var counter = 1;
      while(CacheFactory.get(cacheName + counter)) {
        counter++;
      }
      cacheName = cacheName + counter;
      if (!cacheNames[cacheName]) {
        cacheNames[cacheName] = true;
      }
      console.debug("[cache] Creating cache {0} with 'onExpire' option...".format(cacheName));
      return CacheFactory.createCache(cacheName, {
          maxAge: maxAge,
          deleteOnExpire: 'aggressive',
          //cacheFlushInterval: 60 * 60 * 1000, // This cache will clear itself every hour
          recycleFreq: maxAge,
          onExpire: onExpire,
          storageMode: storageMode
        });
    }
  }

  function clearAllCaches() {
    console.debug("[cache] cleaning all caches");
    _.forEach(_.keys(cacheNames), function(cacheName) {
      var cache = CacheFactory.get(cacheName);
      if (cache) {
        cache.removeAll();
      }
    });
  }

  function clearFromPrefix(cachePrefix) {
    _.forEach(_.keys(cacheNames), function(cacheName) {
      if (cacheName.startsWith(cachePrefix)) {
        var cache = CacheFactory.get(cacheName);
        if (cache) {
          cache.removeAll();
        }
      }
    });
  }

  return {
    get: getOrCreateCache,
    clear: clearFromPrefix,
    clearAll: clearAllCaches,
    constants: constants
  };
})
;
