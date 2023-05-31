angular.module('cesium.storage.services', [ 'cesium.config'])


  .factory('sessionStorage', function($window, $q) {
    'ngInject';

    var
      exports = {
        storage: $window.sessionStorage || {}
      };

    exports.put = function(key, value) {
      exports.storage[key] = value;
      return $q.when();
    };

    exports.get = function(key, defaultValue) {
      return $q.when(exports.storage[key] || defaultValue);
    };

    exports.setObject = function(key, value) {
      exports.storage[key] = JSON.stringify(value);
      return $q.when();
    };

    exports.getObject = function(key) {
      return $q.when(JSON.parse(exports.storage[key] || 'null'));
    };

    return exports;
  })

  .factory('localStorage', function($window, $q, $log, sessionStorage) {
    'ngInject';

    var
      appName = "Cesium",
      started = false,
      startPromise,
      isDevice = true, // default for device (override later)
      exports = {
        standard: {
          storage: null
        },
        secure: {
          storage: null
        }
      };

    // removeIf(device)
    // Use this workaround to avoid to wait ionicReady() event
    isDevice = false;
    // endRemoveIf(device)

    /* -- Use standard browser implementation -- */

    exports.standard.put = function(key, value) {
      if (angular.isDefined(value) && value != null) {
        exports.standard.storage[key] = value;
      }
      else {
        exports.standard.storage.removeItem(key);
      }
      return $q.when();
    };

    exports.standard.remove = function(key, value) {
      exports.standard.storage.removeItem(key);
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
      return $q.when(JSON.parse(exports.standard.storage[key] || 'null'));
    };

    /* -- Use secure storage (using a cordova plugin) -- */

    // Set a value to the secure storage (or remove if value is not defined)
    exports.secure.put = function(key, value) {
      return $q(function(resolve, reject) {
        if (value != null) {
          exports.secure.storage.set(
            function (key) {
              resolve();
            },
            function (err) {
              $log.error("[storage] Failed to set value for key=" + key);
              $log.error(err);
              reject(err);
            },
            key, value,
            null // Cipher mode  - "CCM" (default) or "GCM" (Galois/Counter Mode)
          );
        }
        // Remove
        else {
          exports.secure.storage.remove(
            function () {
              resolve();
            },
            function (err) {
              $log.error("[storage] Failed to remove key=" + key);
              $log.error(err);
              resolve(); // Error = not found
            },
            key);
        }
      });
    };

    // Get a value from the secure storage
    exports.secure.get = function(key, defaultValue) {
      $log.debug("[storage] Getting value from secure storage, using key=" + key);
      return $q(function(resolve, reject) {
        exports.secure.storage.get(
          function (value) {
            if (!value && defaultValue) {
              resolve(defaultValue);
            }
            else {
              resolve(value);
            }
          },
          function (err) {
            $log.error("[storage] Failed to get value from secure storage, using key=" + key);
            $log.error(err);
            resolve(); // Error = not found
          },
          key);
      });
    };

    // Set a object to the secure storage
    exports.secure.setObject = function(key, value) {
      $log.debug("[storage] Setting object into secure storage, using key=" + key);
      return $q(function(resolve, reject){
        if (value != null) {
          exports.secure.storage.set(
            resolve,
            function(err) {
              $log.error("[storage] Failed to set object into secure storage, using key=" + key, value);
              $log.error(err);
              reject(err);
            },
            key,
            JSON.stringify(value),
            null // Cipher mode  - "CCM" (default) or "GCM" (Galois/Counter Mode)
          );
        }
        else {
          exports.secure.storage.remove(
            function () {
              resolve();
            },
            function (err) {
              $log.error("[storage] Failed to remove key=" + key);
              $log.error(err);
              resolve(); // Error = not found
            },
            key);
        }
      });
    };

    // Get a object from the secure storage
    exports.secure.getObject = function(key) {
      $log.debug("[storage] Getting object from secure storage, using key=" + key);
      return $q(function(resolve, reject){
        exports.secure.storage.get(
          function(value) {
            $log.debug("[storage] Getting object from secure storage, using key=" + key + " - result="+value);
            resolve(JSON.parse(value||'null'));
          },
          function(err) {
            $log.error("[storage] Failed to get object from secure storage, using key=" + key);
            $log.error(err);
            resolve(); // Error = not found
          },
          key);
      });
    };

    function initStandardStorage() {
      // use local browser storage
      if ($window.localStorage) {
        console.debug('[storage] Starting {local} storage...');
        exports.standard.storage = $window.localStorage;
        // Set standard storage as default
        _.forEach(_.keys(exports.standard), function(key) {
          exports[key] = exports.standard[key];
        });
      }

      // Fallback to session storage (localStorage could have been disabled on some browser)
      else {
        console.debug('[storage] Starting {session} storage...');
        // Set standard storage as default
        _.forEach(_.keys(sessionStorage), function(key) {
          exports[key] = sessionStorage[key];
        });
      }
      return $q.when();
    }

    function initSecureStorage() {
      console.debug('[storage] Starting {secure} storage...');
      // Set secure storage as default
      _.forEach(_.keys(exports.secure), function(key) {
        exports[key] = exports.secure[key];
      });

      var deferred = $q.defer();

      // No secure storage plugin: fall back to standard storage
      if (!cordova.plugins || !cordova.plugins.SecureStorage) {
        initStandardStorage();
        deferred.resolve();
      }
      else {

        exports.secure.storage = new cordova.plugins.SecureStorage(
          function () {
            deferred.resolve();
          },
          function (err) {
            console.error('[storage] Could not use secure storage. Will use standard.', err);
            initStandardStorage();
            deferred.resolve();
          },
          appName);
      }
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

      var now = Date.now();

      // Use Cordova secure storage plugin
      if (isDevice) {
        startPromise = initSecureStorage();
      }

      // Use default browser local storage
      else {
        startPromise = initStandardStorage();
      }

      return startPromise
        .then(function() {
          console.debug('[storage] Started in ' + (Date.now() - now) + 'ms');
          started = true;
          startPromise = null;
        });
    }

    // default action
    start();

    return exports;
  })


;
