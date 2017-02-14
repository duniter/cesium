
angular.module('cesium.device.services', ['ngResource', 'cesium.utils.services'])

.factory('Device',
  function(UIUtils, $translate, $ionicPopup, $q,
    // removeIf(no-device)
    $cordovaClipboard, $cordovaBarcodeScanner, $cordovaCamera,
    // endRemoveIf(no-device)
    $ionicPlatform
  ) {
  'ngInject';

  var CONST = {
    MAX_HEIGHT: 400,
    MAX_WIDTH: 400
  },
  readyPromise,

  // workaround to quickly no is device or not (even before the ready() event)
  enable = true;
  // removeIf(device)
  enable = false;
  // endRemoveIf(device)

  // Replace the '$ionicPlatform.ready()', to enable multiple calls
  ready = function () {
    if (!readyPromise) {
      readyPromise = $ionicPlatform.ready().then(function(){
        console.debug('[ionic] Platform is ready');
      });
    }
    return readyPromise;
  };

  /*isEnable = function() {
    return enable;
  };*/

  getPicture = function(sourceType) {
    return $q(function (resolve, reject) {
      if (!enable) {
        reject("Camera scanner not enable. Please call 'Device.ready()' once before use (e.g in app.js).");
        return;
      }
      if (!sourceType) {
        $translate(['SYSTEM.PICTURE_CHOOSE_TYPE', 'SYSTEM.BTN_PICTURE_GALLERY', 'SYSTEM.BTN_PICTURE_CAMERA'])
        .then(function(translations){
          $ionicPopup.show({
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
            getPicture(sourceType);
          });
        });
      }
      else {
        var options = {
            quality: 50,
            destinationType: navigator.camera.DestinationType.DATA_URL,
            sourceType: sourceType,
            encodingType: navigator.camera.EncodingType.PNG,
            targetWidth : CONST.MAX_WIDTH,
            targetHeight : CONST.MAX_HEIGHT
        };
        $cordovaCamera.getPicture(
          function (imageData) {resolve(imageData);},
          function(err){reject(err);},
          options
        );
      }
    });
  };

  scan = function (n) {
    return $q(function(resolve,reject){
      if (!enable) {
        reject("Barcode scanner not enable. Please call 'Device.ready()' once before use (e.g in app.js).");
        return;
      }
      cordova.plugins.barcodeScanner.scan(
      function(result) {
        //console.log('bar code result');
        //console.log(result);
        if (!result.cancelled) {
          resolve(result.text); // make sure to convert into String
        }
        else {
          resolve();
        }
      },
      function(err) {reject(err);},
      n);
    });
  };

  copy = function (text, callback) {
    if (!enable) {
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
  };

  // On platform ready: check if device could be used
  ready().then(function() {
    enable = !!navigator.camera;

    if (enable){
      var enableBarcodeScanner = cordova && cordova.plugins && cordova.plugins.barcodeScanner;
      console.debug(' barcodescanner: {0}'.format(enableBarcodeScanner));
      console.debug(' camera: {0}'.format(enable));
    }
    if (!enable) {
      console.debug('[device] No device detected');
    }
    else {
      console.debug('[device] Ready');
    }
  });

  return {
    ready: ready,
    enable: enable,
    clipboard: {
      copy: copy
    },
    camera: {
      getPicture : getPicture,
      scan: scan
    }
  };
})

;
