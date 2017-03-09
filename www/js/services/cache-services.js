angular.module('cesium.cache.services', ['ngResource', 'angular-cache'])

.factory('csCache', function($http, csSettings, CacheFactory) {
  'ngInject';

  var
    constants = {
      LONG: 1 * 60  * 60 * 1000 /*5 min*/,
      SHORT: csSettings.defaultSettings.cacheTimeMs
    },
    cacheNames = []
  ;

  function getOrCreateCache(prefix, maxAge, onExpire){
    prefix = prefix || 'csCache-';
    maxAge = maxAge || constants.SHORT;
    var cacheName = prefix + maxAge;
    if (!onExpire) {
      if (!cacheNames[cacheName]) {
        cacheNames[cacheName] = true;
      }
      return CacheFactory.get(cacheName) ||
        CacheFactory.createCache(cacheName, {
          maxAge: maxAge,
          deleteOnExpire: 'aggressive',
          //cacheFlushInterval: 60 * 60 * 1000, //  clear itself every hour
          recycleFreq: Math.max(maxAge - 1000, 5 * 60 * 1000 /*5min*/),
          storageMode: 'memory'
            // FIXME : enable this when cache is cleaning on rollback
            //csSettings.data.useLocalStorage ? 'localStorage' : 'memory'
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
      return CacheFactory.createCache(cacheName, {
          maxAge: maxAge,
          deleteOnExpire: 'aggressive',
          //cacheFlushInterval: 60 * 60 * 1000, // This cache will clear itself every hour
          recycleFreq: maxAge,
          onExpire: onExpire,
          storageMode: 'memory'
            // FIXME : enable this when cache is cleaning on rollback
            //csSettings.data.useLocalStorage ? 'localStorage' : 'memory'
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
        var cache = CacheFactory.get(cacheNames);
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
    constants: {
      LONG : constants.LONG,
      SHORT: constants.SHORT
    }
  };
})
;
