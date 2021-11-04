angular.module('cesium.cache.services', ['angular-cache'])

.factory('csCache', function($rootScope, $http, $window, csSettings, CacheFactory) {
  'ngInject';

  var
    constants = {
      VERY_LONG: 54000000, /*15 days*/
      LONG: 1 * 60  * 60 * 1000 /*1 hour*/,
      MEDIUM: 5  * 60 * 1000 /*5 min*/,
      SHORT: csSettings.defaultSettings.cacheTimeMs // around 1min
    },
    storageMode = getSettingsStorageMode(),
    cacheNames = [],
    listeners = []
  ;

  function getSettingsStorageMode(settings) {
    settings = settings || csSettings.data;
    return settings && settings.useLocalStorage && settings.persistCache && $window.localStorage ? 'localStorage' : 'memory';
  }

  function getCacheOptions(options) {
    options = options || {};
    options.storageMode = getSettingsStorageMode();
    options.deleteOnExpire = (options.storageMode === 'localStorage' || options.onExpire) ? 'aggressive' : 'passive';
    options.cacheFlushInterval = options.deleteOnExpire === 'passive' ?
      (60 * 60 * 1000) : // If passive mode, remove all items every hour
      null;
    return options;
  }

  function getOrCreateCache(prefix, maxAge, onExpire){
    prefix = prefix || '';
    maxAge = maxAge || constants.SHORT;
    var cacheName = prefix + ((maxAge / 1000) + 's');

    // If onExpire fn, generate a new cache key
    var cache;
    if (onExpire && typeof onExpire == 'function') {
      var counter = 1;
      while (CacheFactory.get(cacheName + counter)) {
        counter++;
      }
      cacheName = cacheName + counter;
    }
    else {
      cache = CacheFactory.get(cacheName);
    }

    // Add to cache names map
    if (!cacheNames[cacheName]) cacheNames[cacheName] = true;

    // Already exists: use it
    if (cache) return cache;

    // Not exists yet: create a new cache
    var options = getCacheOptions({
      maxAge: maxAge,
      onExpire: onExpire || null
    });
    console.debug("[cache] Creating cache {{0}} with {storageMode: {1}}...".format(cacheName, options.storageMode));
    return CacheFactory.createCache(cacheName, options);
  }

  function clearAllCaches() {
    console.debug("[cache] Cleaning all caches...");
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

  function onSettingsChanged(settings) {
    var newStorageMode = getSettingsStorageMode(settings);
    var hasChanged = (newStorageMode !== storageMode);
    if (hasChanged) {
      storageMode = newStorageMode;
      console.debug("[cache] Updating caches with {storageMode: {0}}".format(storageMode));
      _.forEach(_.keys(cacheNames), function(cacheName) {
        var cache = CacheFactory.get(cacheName);
        if (cache) {
          cache.setOptions(getCacheOptions(), true);
        }
      });
    }
  }

  function addListeners() {
    listeners = [
      // Listen for settings changed (e.g. the storage mode)
      csSettings.api.data.on.changed($rootScope, onSettingsChanged, this)
    ];
  }

  addListeners();

  return {
    get: getOrCreateCache,
    clear: clearFromPrefix,
    clearAll: clearAllCaches,
    constants: constants
  };
})
;
