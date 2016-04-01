//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils', function($ionicLoading, $ionicPopup, $translate, $q) {
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
    return $q(function(resolve, reject) {
      $translate([message, 'INFO.POPUP_TITLE', 'COMMON.BTN_OK'])
      .then(function (translations) {
        return $ionicPopup.show({
          template: '<p>' + translations[message] + '</p>',
          title: translations['INFO.POPUP_TITLE'],
          subTitle: subtitle,
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
    $ionicLoading.show({
      template: 'Loading...'
    });
  }

  function onError(msg) {
    return function(err) {
      console.error('>>>>>>>' , err);
      hideLoading();
      if (!!err && !!err.message) {
        alertError(msg + ': ' + err.message);
      }
      else {
        alertError(msg);
      }
    }
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
