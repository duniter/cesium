
angular.module('cesium.device.services', ['ngResource', 'cesium.utils.services'])

.factory('Device', ['UIUtils', '$translate', '$ionicPopup', '$cordovaClipboard', '$cordovaBarcodeScanner', '$q', '$cordovaCamera',
  function(UIUtils, $translate, $ionicPopup, $cordovaClipboard, $cordovaBarcodeScanner, $q, $cordovaCamera) {

  var CONST = {
    MAX_HEIGHT: 400,
    MAX_WIDTH: 400
  },
  enable = false;

  getPicture = function(sourceType) {
    return $q(function (resolve, reject) {
      if (!enable) {
        reject('Camera not enable. Please set [Device.enable] to true before use.');
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

  scan = function () {
    return $q(function(resolve,reject){
      if (!enable) {
        reject('Camera not enable. Please set [Device.enable] to true before use.');
        return;
      }
      $cordovaBarcodeScanner.scan()
      .then(function(result) {
        if (!result.cancelled) {
          resolve(result);
        }
        else {
          resolve();
        }
      },
      function(error) {reject(error);});
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
          console.log("Copy text to clipboard: " + text);
        }
      }, function () {
        // error
        UIUtils.alert.error('ERROR.COPY_CLIPBOARD');
      });
  };

  return {
    enable: enable,
    clipboard: {
      copy: copy
    },
    camera: {
      getPicture : getPicture,
      scan: scan
    }
  };
}])

;
