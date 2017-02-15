
angular.module('cesium.device.services', ['ngResource', 'cesium.utils.services'])

  .factory('Device',
    function(UIUtils, $translate, $ionicPopup, $q,
      // removeIf(no-device)
      $cordovaClipboard, $cordovaBarcodeScanner, $cordovaCamera,
      // endRemoveIf(no-device)
      $ionicPlatform) {
      'ngInject';

      var
        CONST = {
          MAX_HEIGHT: 400,
          MAX_WIDTH: 400
        },
        readyPromise,
        exports = {
          // workaround to quickly no is device or not (even before the ready() event)
          enable: true
        };

      // removeIf(device)
      // workaround to quickly no is device or not (even before the ready() event)
      exports.enable = false;
      console.log("TOTOTOTOT - should have been removed on DEVICE !!!");
      // endRemoveIf(device)

      // Replace the '$ionicPlatform.ready()', to enable multiple calls
      function ready() {
        if (!readyPromise) {
          readyPromise = $ionicPlatform.ready().then(function(){
            console.debug('[ionic] Platform is ready');
          });
        }
        return readyPromise;
      }

      function getPicture(options) {
        if (!exports.enable) {
          return $q.reject("Camera not enable. Please call 'Device.ready()' once before use (e.g in app.js).");
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
          return $q.reject("Barcode scanner not enable. Please call 'Device.ready()' once before use (e.g in app.js).");
        }
        var deferred = $q.defer();
        cordova.plugins.barcodeScanner.scan(
          function(result) {
            //console.log('bar code result');
            //console.log(result);
            if (!result.cancelled) {
              deferred.resolve(result.text); // make sure to convert into String
            }
            else {
              deferred.resolve();
            }
          },
          function(err) {deferred.reject(err);},
          n);
        return deferred.promise;
      }

      function copy(text, callback) {
        if (!exports.enable) {
          return; // do nothing if not available
        }
        $cordovaClipboard
          .copy(text)
          .then(function () {
            // success
            if (callback) {
              callback();
            }
            else {
              UIUtils.toast.show('INFO.COPY_TO_CLIPBOARD_DONE');
            }
          }, function () {
            // error
            UIUtils.alert.error('ERROR.COPY_CLIPBOARD');
          });
      }

      // On platform ready: check if device could be used
      ready().then(function() {
        var enableCamera = !!navigator.camera;

        exports.enable = enableCamera;

        if (exports.enable){
          var enableBarcodeScanner = cordova && cordova.plugins && !!cordova.plugins.barcodeScanner;
          console.debug('[device] Ready with [barcodescanner={0}] [camera={1}]'.format(enableBarcodeScanner, enableCamera));
        }
        else {
          console.debug('[device] No device detected');
        }
      });

      exports.ready = ready;
      exports.clipboard = {copy: copy};
      exports.camera = {
          getPicture : getPicture,
          scan: scan
        };
      return exports;
    })

  ;
