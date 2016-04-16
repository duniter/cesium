//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils', function($ionicLoading, $ionicPopup, $translate, $q, ionicMaterialInk, ionicMaterialMotion) {

  var loadingTextCache=null;

  function alertError(err, subtitle) {
    $translate([err, subtitle, 'ERROR.POPUP_TITLE', 'ERROR.UNKNOWN_ERROR', 'COMMON.BTN_OK'])
    .then(function (translations) {
      var message = err.message || translations[err];
      return $ionicPopup.show({
        template: '<p>' + (message || translations['ERROR.UNKNOWN_ERROR']) + '</p>',
        title: translations['ERROR.POPUP_TITLE'],
        subTitle: translations[subtitle],
        buttons: [
          {
            text: '<b>'+translations['COMMON.BTN_OK']+'</b>',
            type: 'button-assertive'
          }
        ]
      });
    });
  }

  function alertInfo(message, subtitle) {
    return $q(function(resolve, reject) {
      $translate([message, subtitle, 'INFO.POPUP_TITLE', 'COMMON.BTN_OK'])
      .then(function (translations) {
        return $ionicPopup.show({
          template: '<p>' + translations[message] + '</p>',
          title: translations['INFO.POPUP_TITLE'],
          subTitle: translations[subtitle],
          buttons: [
            {
              text: '<b>'+translations['COMMON.BTN_OK']+'</b>',
              type: 'button-positive',
              onTap: function(e) {
                resolve(e);
              }
            }
          ]
        });
      });
    });
  }

  function hideLoading(){
    $ionicLoading.hide();
  }

  function showLoading() {
    if (!loadingTextCache) {
      $translate(['COMMON.LOADING'])
      .then(function(translations){
        loadingTextCache = translations['COMMON.LOADING'];
        showLoading();
      });
      return;
    }

    $ionicLoading.show({
      template: loadingTextCache
    });
  }

  function onError(msg, reject/*optional*/) {
    return function(err) {
      var fullMsg = msg;
      if (!!err && !!err.message) {
        fullMsg = msg + ': ' + err.message;
      }
      // If reject has been given, use it
      if (!!reject) {
        reject(fullMsg);
      }
      // Otherwise, log to console and display error
      else {
        console.error('>>>>>>>' , err);
        hideLoading();
        alertError(fullMsg);
      }
    };
  }

  return {
    alert: {
      error: alertError,
      info: alertInfo
    },
    loading: {
      show: showLoading,
      hide: hideLoading
    },
    onError: onError,
    ink: ionicMaterialInk.displayEffect,
    motion: ionicMaterialMotion
  };
})

.factory('$localstorage', ['$window', 'CryptoUtils', '$q', function($window, CryptoUtils, $q) {
  return {
    set: function(key, value) {
      $window.localStorage[key] = value;
    },
    get: function(key, defaultValue) {
      return $window.localStorage[key] || defaultValue;
    },
    setObject: function(key, value) {
      $window.localStorage[key] = JSON.stringify(value);
    },
    getObject: function(key) {
      return JSON.parse($window.localStorage[key] || '{}');
    }
  };
}])

// See http://plnkr.co/edit/vJQXtsZiX4EJ6Uvw9xtG?p=preview
.factory('$focus', function($timeout, $window) {
  return function(id) {
    // timeout makes sure that it is invoked after any other event has been triggered.
    // e.g. click events that need to run before the focus or
    // inputs elements that are in a disabled state but are enabled when those events
    // are triggered.
    $timeout(function() {
      var element = $window.document.getElementById(id);
      if(element)
        element.focus();
    });
  };
})

.factory('System', function($timeout, $window, UIUtils, $translate, $ionicPopup, $cordovaClipboard, $cordovaBarcodeScanner) {

  var camera = {};
  var scan = {};
  var clipboard = {};

  ionic.Platform.ready(function() {
    // Check if camera is enable
	  if (!navigator.camera) {
	    camera.enable = false;
	  }
	  else {
      camera.handle = navigator.camera;
	  }

    // Check if scan is enable
	  scan.enable = !(!$cordovaBarcodeScanner || !$cordovaBarcodeScanner.scan);

    // Check if clipboard is enable
	  clipboard.enable = !(!$cordovaClipboard || !$cordovaClipboard.copy);
  });

  camera.takePicture = function(sourceType) {
    return $q(function (resolve, reject) {
      if (!camera.enable) {
        reject('Camera not enable. Please check [system.camera.enable] before use.');
        return;
      }
      if (!sourceType) {
        $translate(['SYSTEM.PICTURE_CHOOSE_TYPE'])
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
            camera.takePicture(sourceType);
          });
        });
      }
      else {
        var options = {
            quality: 50,
            destinationType: navigator.camera.DestinationType.DATA_URL,
            sourceType: sourceType,
            encodingType: navigator.camera.EncodingType.PNG,
            targetWidth : 400,
            targetHeight : 400
        };
        camera.handle.camera.getPicture(
          function (imageData) {resolve(imageData);},
          function(err){reject(err);},
          options
        );
      }
    });
  };

  camera.scan = function () {
    return $q(function(resolve,reject){
      if (!scan.enable) {
        reject('Camera not enable. Please check [system.camera.enable] before use.');
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

  clipboard.copy = function (text, callback) {
    $cordovaClipboard
      .copy(text)
      .then(function () {
        // success
        console.log("Copied text");
        if (callback) {
          callback();
        }
      }, function () {
        // error
        UIUtils.alert.error('ERROR.COPY_CLIPBOARD');
      });
  };

  return {
      clipboard: {
        enable: clipboard.enable,
        copy: clipboard.copy
      },
      camera: {
        enable: camera.enable && scan.enable,
        take: camera.takePicture,
        scan: camera.scan
      },
    };
})

.directive('eventFocus', function(focus) {
  return function(scope, elem, attr) {
    elem.on(attr.eventFocus, function() {
      focus(attr.eventFocusId);
    });

    // Removes bound events in the element itself
    // when the scope is destroyed
    scope.$on('$destroy', function() {
      elem.off(attr.eventFocus);
    });
  };
})


;
