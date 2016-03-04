//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils', function($ionicLoading, $ionicPopup, $translate) {
  function alertError(err, subtitle) {
    $translate([err, 'ERROR.POPUP_TITLE', 'ERROR.UNKNOWN_ERROR', 'COMMON.BTN_OK'])
    .then(function (translations) {
      var message = err.message || translations[err];
      return $ionicPopup.show({
        template: '<p>' + (message || translations['ERROR.UNKNOWN_ERROR']) + '</p>',
        title: translations['ERROR.POPUP_TITLE'],
        subTitle: subtitle,
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
    $translate([message, 'INFO.POPUP_TITLE', 'COMMON.BTN_OK'])
    .then(function (translations) {
      var message = translations[message];
      return $ionicPopup.show({
        template: '<p>' + message + '</p>',
        title: translations['INFO.POPUP_TITLE'],
        subTitle: subtitle,
        buttons: [
          {
            text: '<b>'+translations['COMMON.BTN_OK']+'</b>',
            type: 'button-positive'
          }
        ]
      });
    });
  }

  function hideLoading(){
    $ionicLoading.hide();
  }

  function showLoading() {
    $ionicLoading.show({
      template: 'Loading...'
    });
  }

  function onError(msg) {
    return function(err) {
      console.error('>>>>>>>' , err);
      hideLoading();
      alertError(msg + ': ' + err);
    }
  }

  return {
    alert: {
      error: alertError
    },
    loading: {
      show: showLoading,
      hide: hideLoading
    },
    onError: onError
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
  }
}])

;
