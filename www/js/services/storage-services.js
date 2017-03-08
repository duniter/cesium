angular.module('cesium.storage.services', ['ngResource', 'ngResource', 'xdLocalStorage',
 'cesium.device.services', 'cesium.config'])

.factory('localStorage', function($window, $q, $rootScope, Device, csConfig, xdLocalStorage) {
  'ngInject';

  var
    appName = "Cesium",
    localStorage = $window.localStorage,
    exports = {
      useHttpsFrame: false,
      unsecure: {},
      https: {},
      secure: {
        storage: null
      }
    };

  /* -- Use default default browser implementation -- */

  exports.unsecure.put = function(key, value) {
    localStorage[key] = value;
  };

  exports.unsecure.get = function(key, defaultValue) {
    return localStorage[key] || defaultValue;
  };

  exports.unsecure.setObject = function(key, value) {
    localStorage[key] = JSON.stringify(value);
  };

  exports.unsecure.getObject = function(key) {
    return JSON.parse(localStorage[key] || '{}');
  };


  /* -- Use of HTTPS frame -- */

  exports.https.put = function(key, value) {
    console.log('TODO: setting [{0}] into https frame'.format(key));
  };

  exports.https.get = function(key, defaultValue) {
    console.log('TODO: getting [{0}] from https frame'.format(key));
    return localStorage[key] || defaultValue;
  };

  exports.https.setObject = function(key, value) {
    console.log('TODO: setting object [{0}] into https frame'.format(key));
  };

  exports.https.getObject = function(key) {
    console.log('TODO: getting object [{0}] from https frame'.format(key));
    return JSON.parse(localStorage[key] || '{}');
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
        return JSON.parse(localStorage[key] || '{}');
      });
  };

  // Copy HTTPS functions as default function
  if (csConfig.httpsMode === 'clever' && $window.location.protocol !== 'https:') {
    _.forEach(_.keys(exports.https), function(key) {
      exports[key] = exports.https[key];
    });
  }

  else {
    // Copy unsecure function as default function
    _.forEach(_.keys(exports.unsecure), function(key) {
      exports[key] = exports.unsecure[key];
    });
  }


  Device.ready().then(function() {

    function replaceSecureStorage() {
      exports.secure = exports.unsecure;
      exports.secure.storage = null;
    }

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
