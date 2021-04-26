var App;

angular.module('cesium.device.services', ['cesium.utils.services', 'cesium.settings.services'])

  .factory('Device', function($rootScope, $translate, $ionicPopup, $q, Api,
      // removeIf(no-device)
      $cordovaClipboard, $cordovaBarcodeScanner, $cordovaCamera,
      // endRemoveIf(no-device)
      ionicReady) {
      'ngInject';

      var
        CONST = {
          MAX_HEIGHT: 400,
          MAX_WIDTH: 400
        },
        that = this,
        api = new Api(this, "Device"),
        exports = {
          // workaround to quickly no is device or not (even before the ready() event)
          enable: true
        },
        cache = {},
        started = false,
        startPromise;

      // removeIf(device)
      // workaround to quickly no is device or not (even before the ready() event)
      exports.enable = false;
      // endRemoveIf(device)

      function getPicture(options) {
        if (!exports.camera.enable) {
          return $q.reject("Camera not enable. Please call 'ionicReady()' once before use (e.g in app.js).");
        }

        // Options is the sourceType by default
        if (options && (typeof options === "string")) {
          options = {
            sourceType: options
          };
        }
        options = options || {};

        // Make sure a source type has been given (if not, ask user)
        if (angular.isUndefined(options.sourceType)) {
          return $translate(['SYSTEM.PICTURE_CHOOSE_TYPE', 'SYSTEM.BTN_PICTURE_GALLERY', 'SYSTEM.BTN_PICTURE_CAMERA'])
            .then(function(translations){
              return $ionicPopup.show({
                title: translations['SYSTEM.PICTURE_CHOOSE_TYPE'],
                buttons: [
                  {
                    text: translations['SYSTEM.BTN_PICTURE_GALLERY'],
                    type: 'button',
                    onTap: function(e) {
                      return navigator.camera.PictureSourceType.PHOTOLIBRARY;
                    }
                  },
                  {
                    text: translations['SYSTEM.BTN_PICTURE_CAMERA'],
                    type: 'button button-positive',
                    onTap: function(e) {
                      return navigator.camera.PictureSourceType.CAMERA;
                    }
                  }
                ]
              })
              .then(function(sourceType){
                console.info('[camera] User select sourceType:' + sourceType);
                options.sourceType = sourceType;
                return exports.camera.getPicture(options);
              });
            });
        }

        options.quality = options.quality || 50;
        options.destinationType = options.destinationType || navigator.camera.DestinationType.DATA_URL;
        options.encodingType = options.encodingType || navigator.camera.EncodingType.PNG;
        options.targetWidth = options.targetWidth || CONST.MAX_WIDTH;
        options.targetHeight = options.targetHeight || CONST.MAX_HEIGHT;
        return $cordovaCamera.getPicture(options);
      }

      function scan(n) {
        if (!exports.enable) {
          return $q.reject("Barcode scanner not enable. Please call 'ionicReady()' once before use (e.g in app.js).");
        }
        var deferred = $q.defer();
        cordova.plugins.barcodeScanner.scan(
          function(result) {
            if (!result.cancelled) {
              console.debug('[device] barcode scanner scan: ' + result.text);
              deferred.resolve(result.text); // make sure to convert into String
            }
            else {
              console.debug('[device] barcode scanner scan: CANCELLED');
              deferred.resolve();
            }
          },
          function(err) {
            console.error('[device] Error while using barcode scanner: ' + err);
            deferred.reject(err);
          },
          n);
        return deferred.promise;
      }

      function copy(text, callback) {
        if (!exports.enable) {
          return $q.reject('Device disabled');
        }
        var deferred = $q.defer();
        $cordovaClipboard
          .copy(text)
          .then(function () {
            // success
            if (callback) {
              callback();
            }
            deferred.resolve();
          }, function () {
            // error
            deferred.reject({message: 'ERROR.COPY_CLIPBOARD'});
          });
        return deferred.promise;
      }

      exports.clipboard = {copy: copy};
      exports.camera = {
          getPicture : getPicture,
          scan: function(n){
            console.warn('Deprecated use of Device.camera.scan(). Use Device.barcode.scan() instead');
            return scan(n);
          }
        };
      exports.barcode = {
        enable : false,
        scan: scan
      };
      exports.keyboard = {
        enable: false,
        close: function() {
          if (!exports.keyboard.enable) return;
          cordova.plugins.Keyboard.close();
        }
      };

      function getLastIntent() {
        var deferred = $q.defer();
        window.plugins.launchmyapp.getLastIntent(
          deferred.resolve,
          deferred.reject);
        return deferred.promise;
      }

    // WARN: Need by cordova-plugin-customurlscheme
    window.handleOpenURL = function(intent) {
      if (intent) {
        console.info('[device] Received new intent: ', intent);
        cache.lastIntent = intent; // Remember, for last()
        api.intent.raise.new(intent);
      }
    };

    exports.intent = {
        enable: false,
        last: function() {
          return $q.when(cache.lastIntent);
        },
        clear: function() {
          cache.lastIntent = undefined;
        }
      };

      // Numerical keyboard - fix #30
      exports.keyboard.digit = {
        settings: {
          bindModel: function(modelScope, modelPath, settings) {
            settings = settings || {};
            modelScope = modelScope || $rootScope;
            var getModelValue = function() {
              return (modelPath||'').split('.').reduce(function(res, path) {
                return res ? res[path] : undefined;
              }, modelScope);
            };
            var setModelValue = function(value) {
              var paths = (modelPath||'').split('.');
              var property = paths.length && paths[paths.length-1];
              paths.reduce(function(res, path) {
                if (path == property) {
                  res[property] = value;
                  return;
                }
                return res[path];
              }, modelScope);
            };

            settings.animation = settings.animation || 'pop';
            settings.action = settings.action || function(number) {
                setModelValue((getModelValue() ||'') + number);
              };
            if (settings.decimal) {
              settings.decimalSeparator = settings.decimalSeparator || '.';
              settings.leftButton = {
                html: '<span>.</span>',
                action: function () {
                  var text = getModelValue() || '';
                  // only one '.' allowed
                  if (text.indexOf(settings.decimalSeparator) >= 0) return;
                  // Auto add zero when started with '.'
                  if (!text.trim().length) {
                    text = '0';
                  }
                  setModelValue(text + settings.decimalSeparator);
                }
              };
            }
            settings.rightButton = settings.rightButton || {
                html: '<i class="icon ion-backspace-outline"></i>',
                action: function() {
                  var text = getModelValue();
                  if (text && text.length) {
                    text = text.slice(0, -1);
                    setModelValue(text);
                  }
                }
              };
            return settings;
          }
        }
      };

      exports.isOSX = function() {
        return !!navigator.userAgent.match(/Macintosh/i) || ionic.Platform.is("osx");
      };

      exports.isIOS = function() {
        return !!navigator.userAgent.match(/iPhone | iPad | iPod/i) || (!!navigator.userAgent.match(/Mobile/i) && !!navigator.userAgent.match(/Macintosh/i)) || ionic.Platform.isIOS();
      };

      exports.isDesktop = function() {
        if (!angular.isDefined(cache.isDesktop)) {
          try {
            // Should have NodeJs and NW
            cache.isDesktop = !exports.enable && !!process && !!nw && !!nw.App;
          } catch (err) {
            cache.isDesktop = false;
          }
        }
        return cache.isDesktop;
      };

      exports.isWeb = function() {
        return !exports.enable && !exports.isDesktop();
      };

      exports.ready = function() {
        if (started) return $q.when();
        return startPromise || exports.start();
      };

      exports.start = function() {

        startPromise = ionicReady()
          .then(function(){

            exports.enable = window.cordova && cordova && cordova.plugins;

            if (exports.enable){
              exports.camera.enable = !!navigator.camera;
              exports.keyboard.enable = cordova && cordova.plugins && !!cordova.plugins.Keyboard;
              exports.barcode.enable = cordova && cordova.plugins && !!cordova.plugins.barcodeScanner && (!exports.isOSX() || exports.isIOS());
              exports.clipboard.enable = cordova && cordova.plugins && !!cordova.plugins.clipboard;
              exports.intent.enable = window && !!window.plugins.launchmyapp;

              if (exports.keyboard.enable) {
                angular.extend(exports.keyboard, cordova.plugins.Keyboard);
              }

              console.debug('[device] Ionic platform ready, with {camera: {0}, barcode: {1}, keyboard: {2}, clipboard: {3}, intent: {4}}'
                .format(exports.camera.enable, exports.barcode.enable, exports.keyboard.enable, exports.clipboard.enable, exports.intent.enable));

              if (cordova.InAppBrowser) {
                console.debug('[device] Enabling InAppBrowser');
                window.open = cordova.InAppBrowser.open;
              }
            }
            else {
              console.debug('[device] Ionic platform ready - no device detected.');
            }

            started = true;
            startPromise = null;
          });

        return startPromise;
      };

      api.registerEvent('intent', 'new');

      // Export the event api (see ngApi)
      exports.api = api;

      return exports;
    })

  ;
