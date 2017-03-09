angular.module('cesium.storage.services', ['ngResource', 'ngResource', 'xdLocalStorage', 'ngApi', 'cesium.config'])

.factory('localStorage', function($window, $q, $rootScope, $timeout, ionicReady, csConfig, Api, xdLocalStorage) {
  'ngInject';

  var
    appName = "Cesium",
    api = new Api(this, "localStorage"),
    started = false,
    startPromise,
    tryInitSecureStorage = true, // default for device (override later)
    exports = {
      api: api,
      useHttpsFrame: false,
      standard: {
        storage: null
      },
      xd: {
        enable: false
      },
      secure: {
        storage: null
      }
    };

  // removeIf(device)
  // Use this workaround to avoid the use of Device service (could cause a circular reference)
  tryInitSecureStorage = false;
  // endRemoveIf(device)

  /* -- Use standard browser implementation -- */

  exports.standard.put = function(key, value) {
    exports.standard.storage[key] = value;
    return $q.when();
  };

  exports.standard.get = function(key, defaultValue) {
    return $q.when(exports.standard.storage[key] || defaultValue);
  };

  exports.standard.setObject = function(key, value) {
    exports.standard.storage[key] = JSON.stringify(value);
    return $q.when();
  };

  exports.standard.getObject = function(key) {
    return $q.when(JSON.parse(exports.standard.storage[key] || '{}'));
  };


  /* -- Use of cross-domain HTTPS iframe -- */
  // See https://github.com/ofirdagan/cross-domain-local-storage

  exports.xd.put = function(key, value) {
    if (!started) {
      console.debug('[storage] Waiting start finished...');
      return startPromise.then(function(){
        return exports.xd.put(key, value);
      });
    }

    xdLocalStorage.setItem(key, value);
  };

  exports.xd.get = function(key, defaultValue) {
    if (!started) {
      console.debug('[storage] Waiting start finished...');
      return startPromise.then(function(){
        return exports.xd.get(key, defaultValue);
      });
    }

    return xdLocalStorage.getItem(key).then(function(response){
      return (response && response.value) || defaultValue;
    });
  };

  exports.xd.setObject = function(key, value) {
    if (!started) {
      console.debug('[storage] Waiting start finished...');
      return startPromise.then(function(){
        return exports.xd.setObject(key, value);
      });
    }

    if (!value) {
      return xdLocalStorage.removeItem(key);
    }
    return xdLocalStorage.setItem(key, JSON.stringify(value));
  };

  exports.xd.getObject = function(key, defaultObject) {
    if (!started) {
      console.debug('[storage] Waiting start finished...');
      return startPromise.then(function(){
        return exports.xd.getObject(key, defaultObject);
      });
    }

    return xdLocalStorage.getItem(key).then(function(response){
      return response && response.value && JSON.parse(response.value) || defaultObject;
    });
  };

  /* -- Use secure storage (using a cordova plugin) -- */

  // Set a value to the secure storage (or remove if value is not defined)
  exports.secure.put = function(key, value) {
    var deferred = $q.defer();
    if (angular.isDefined(value)) {
      exports.secure.storage.set(
        function (key) { deferred.resolve(); },
        function (err) { deferred.reject(err); },
        key, value);
    }
    // Remove
    else {
      exports.secure.storage.remove(
        function (key) { deferred.resolve(); },
        function (err) { deferred.reject(err); },
        key);
    }
    return deferred.promise;
  };

  // Get a value from the secure storage
  exports.secure.get = function(key, defaultValue) {
    var deferred = $q.defer();
    exports.secure.storage.get(
      function (value) {
        if (!value && defaultValue) {
          deferred.resolve(defaultValue);
        }
        else {
          deferred.resolve(value);
        }
      },
      function (err) { deferred.reject(err); },
      key);
    return deferred.promise;
  };

  // Set a object to the secure storage
  exports.secure.setObject = function(key, value) {
    return exports.secure.set(key, JSON.stringify(value));
  };

  // Get a object from the secure storage
  exports.secure.getObject = function(key) {
    return exports.secure.get(key)
      .then(function(value) {
        return (value && JSON.parse(value)) || {};
      });
  };

  function initStandardStorage() {
    console.debug('[storage] Starting [standard mode]...');
   exports.standard.storage = $window.localStorage;
    // Set standard storage as default
    _.forEach(_.keys(exports.standard), function(key) {
      exports[key] = exports.standard[key];
    });

    return $q.when();
  }

  function initXdStorage() {
    // Compute the HTTPS iframe url
    var href = $window.location.href;
    var hashIndex = href.indexOf('#');
    var rootPath = (hashIndex != -1) ? href.substr(0, hashIndex) : href;
    var iframeUrl = 'https' + rootPath.substr(4);
    if (iframeUrl.charAt(iframeUrl.length-1) != '/') iframeUrl += '/'; // end slash
    iframeUrl += 'https-storage.html';

    console.debug('[storage] Starting [cross-domain mode] using iframe [{0}]'.format(iframeUrl));

    // Set cross-domain storage as default
    _.forEach(_.keys(exports.xd), function(key) {
      exports[key] = exports.xd[key];
    });

    var isOK = false;
    var deferred = $q.defer();

    // Timeout, in case the frame could not be loaded
    $timeout(function() {
      if (!isOK) {
        // TODO: alert user ?
        console.error('[storage] https frame not loaded (timeout). Trying standard mode...');
        deferred.resolve(initStandardStorage());
      }
    }, csConfig.timeout);

    xdLocalStorage.init({iframeUrl: iframeUrl})
      .then(function() {
        isOK = true;
        deferred.resolve();
      })
      .catch(function(err) {
        console.error('[storage] Could not init cross-domain storage. Trying standard mode...', err);
        deferred.resolve(initStandardStorage());
      });
    return deferred.promise;
  }

  function initSecureStorage() {
    console.debug('[storage] Starting [secure mode]...');
    // Set secure storage as default
    _.forEach(_.keys(exports.secure), function(key) {
      exports[key] = exports.secure[key];
    });

    var deferred = $q.defer();

    ionicReady().then(function() {
      if (!cordova.plugins || !cordova.plugins.SecureStorage) {
        deferred.resolve(initStandardStorage());
        return;
      }
      exports.secure.storage = new cordova.plugins.SecureStorage(
        function () {
          deferred.resolve();
        },
        function (err) {
          console.error('[storage] Could not use secure storage. Will use standard.', err);
          deferred.resolve(initStandardStorage());
        },
        appName);
    });

    return deferred.promise;
  }

  exports.isStarted = function() {
    return started;
  };

  exports.ready = function() {
    if (started) return $q.when();
    return startPromise || start();
  };

  function start() {
    if (startPromise) return startPromise;

    var now = new Date().getTime();

    // Is site on both HTTPS and HTTP: Need to use cross-domain storage
    if (csConfig.httpsMode === 'clever' && $window.location.protocol !== 'https:') {
      startPromise = initXdStorage();
    }

    // Use Cordova secure storage plugin
    else if (tryInitSecureStorage) {
      startPromise = initSecureStorage();
    }

    // Use default browser local storage
    else {
      startPromise = initStandardStorage();
    }

    return startPromise
      .then(function() {
        console.debug('[storage] Started in ' + (new Date().getTime() - now) + 'ms');
        started = true;
        startPromise = null;
      });
  }

  // default action
  start();

  return exports;
})
;
