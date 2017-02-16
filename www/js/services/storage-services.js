angular.module('cesium.storage.services', ['ngResource', 'cesium.device.services'])

.factory('localStorage', function($window, $q, Device) {
  'ngInject';

  var
    appName = "Cesium",
    localStorage = $window.localStorage,
    exports = {
      unsecure: {
        put: function(key, value) {
          localStorage[key] = value;
        },
        get: function(key, defaultValue) {
          return localStorage[key] || defaultValue;
        },
        setObject: function(key, value) {
          localStorage[key] = JSON.stringify(value);
        },
        getObject: function(key) {
          return JSON.parse(localStorage[key] || '{}');
        }
      },
      secure: {
        storage: null
      }
    };

  function replaceSecureStorage() {
    exports.secure = exports.unsecure;
    exports.secure.storage = null;
  }

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
        return JSON.parse(localStorage[key] || '{}');
      });
  };

  // Copy unsecure function as root exports function
  _.forEach(_.keys(exports.unsecure), function(key) {
    exports[key] = exports.unsecure[key];
  });

  Device.ready().then(function() {
    if (Device.enable) {
      exports.secure.storage = new cordova.plugins.SecureStorage(
        function () {
          console.log('[storage] Secure storage initialized.');
        },
        function (error) {
          console.error('[storage] Could not use secure storage: ' + error);
          replaceSecureStorage();
        },
        appName);
    }
    else {
      replaceSecureStorage();
    }

  });

  return exports;
})
;
