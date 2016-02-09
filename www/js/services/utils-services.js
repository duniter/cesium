//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils', function($ionicLoading, $ionicPopup) {
  function alertError(err, subtitle) {
    var message = err.message || err;
    return $ionicPopup.show({
      template: '<p>' + (message || 'Unknown error') + '</p>',
      title: 'Application error',
      subTitle: subtitle,
      buttons: [
        {
          text: '<b>OK</b>',
          type: 'button-assertive'
        }
      ]
    });
  }

  function alertInfo(message, subtitle) {
      var message = err.message || err;
      return $ionicPopup.show({
        template: '<p>' + message + '</p>',
        title: 'Information',
        subTitle: subtitle,
        buttons: [
          {
            text: '<b>OK</b>',
            type: 'button-positive'
          }
        ]
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
      alertError(msg + ': ' + err);
      hideLoading();
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
