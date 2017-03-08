angular.module('cesium.storage.services', ['ngResource', 'cesium.device.services', 'cesium.config'])

.factory('localStorage', function($window, $q, $rootScope, Device, csConfig) {
  'ngInject';

  var
    appName = "Cesium",
    localStorage = $window.localStorage,
    exports = {
      useHttpsFrame: false,
      unsecure: {},
      https: {
        frame: null,
        domain: null
      },
      secure: {
        storage: null
      }
    };

    /* -- default implementation (default browser storage) -- */

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


  /* -- HTTPS frame -- */

  exports.https.put = function(key, value) {
    console.log('TODO: setting [{0}] into https frame'.format(key));
  };

  exports.https.get = function(key, defaultValue) {
    exports.https.frame.postMessage(key, exports.https.domain);
    console.log('TODO: getting [{0}] from https frame'.format(key));
    return localStorage[key] || defaultValue;
  };

  exports.https.setObject = function(key, value) {
    console.log('TODO: setting object [{0}] into https frame'.format(key));
  };

  exports.https.getObject = function(key) {
    exports.https.frame.postMessage(key, exports.https.domain);
    console.log('TODO: getting object [{0}] from https frame'.format(key));
    return JSON.parse(localStorage[key] || '{}');
  };


  /* -- Secure storage (device only, using a cordova plugin) -- */

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

  // Create a HTTPS frame to get local storage from HTTPS domaine
  if (csConfig.httpsMode === 'clever' && $window.location.protocol !== 'https:') {

    var href = $window.location.href;
    var hashIndex = href.indexOf('#');
    var rootPath = (hashIndex != -1) ? href.substr(0, hashIndex) : href;
    var httpsFrame = (csConfig.httpsModeDebug ? 'http' : 'https') + rootPath.substr(4) + 'sync-storage.html';

    console.debug('[storage] Adding HTTPS iframe [{0}]'.format(httpsFrame));
    angular.element(document.body).append('<iframe name="httpsFrame" style="display:none" src="'+httpsFrame+'"></iframe>');


    // Copy httpsFrame function as root exports function
    _.forEach(_.keys(exports.https), function(key) {
      exports[key] = exports.https[key];
    });

    exports.https.domain = 'https' + rootPath.substr(4);
    exports.https.frame = frames['httpsFrame'];
  }

  else {
    // Copy unsecure function as root exports function
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
