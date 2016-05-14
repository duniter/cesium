// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ngCordova', 'ionic-material', 'ngMessages', 'pascalprecht.translate', 'angularMoment', 'cesium.controllers'])

  .filter('formatInteger', function() {
    return function(input) {
      return input ? numeral(input).format('0,0').replace(',', ' ') : '0';
    };
  })

  .filter('formatDecimal', function() {
      return function(input) {
        if (!input) return '0';
        if (Math.abs(input) < 0.0001) return '~ 0';
        return numeral(input).format('0,0.0000').replace(',', ' ');
      };
    })

  .filter('formatDate', function() {
    return function(input) {
      // TODO: use local format
      return input ? moment(parseInt(input)*1000).local().format('YYYY-MM-DD HH:mm') : '';
    };
  })

  .filter('formatFromNow', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).startOf('minute').fromNow() : '';
    };
  })

  .filter('formatDuration', function() {
    return function(input) {
      return input ? moment(moment().utc().valueOf() + parseInt(input)*1000).startOf('minute').fromNow() : '';
    };
  })

  .filter('abbreviate', function() {
    return function(input) {
      var unit = '', sepChars = ['-', '_', ' '], currency = input || '';
      for (var i = 0; i < currency.length; i++) {
        var c = currency[i];
        if (i === 0 || (i > 0 && sepChars.indexOf(currency[i-1]) != -1)) {
          unit += c;
        }
      }
      return unit.toUpperCase();
    };
  })

  .filter('formatPubkey', function() {
    return function(input) {
      return input ? input.substr(0,8) : '';
    };
  })

  .filter('formatCategory', function() {
    return function(input) {
      return input && input.length > 28 ? input.substr(0,25)+'...' : input;
    };
  })

  // Convert to user friendly URL (e.g. "Like - This" -> "like-this")
  .filter('formatSlug', function() {
    return function(input) {
      return input ? encodeURIComponent(input
        .toLowerCase()
        .replace(/[^\w ]+/g,'')
        .replace(/ +/g,'-'))
        : '';
    };
  })

  // Translation i18n
  .config(function ($translateProvider) {
    $translateProvider.useStaticFilesLoader({
        prefix: 'i18n/locale-',
        suffix: '.json'
    })
    .uniformLanguageTag('bcp47')
    .determinePreferredLanguage()
    // Cela fait bugger les placeholder (pb d'affichage des accents en FR)
    //.useSanitizeValueStrategy('sanitize')
    .useSanitizeValueStrategy(null)
    .fallbackLanguage(['en'])
    .useLoaderCache(true)
    .useStorage('localStorage');
  })

  .config(['$httpProvider', 'APP_CONFIG', function($httpProvider, APP_CONFIG) {
    if (APP_CONFIG.TIMEOUT) {
      $httpProvider.defaults.timeout = APP_CONFIG.TIMEOUT;
    }
    else {
      $httpProvider.defaults.timeout = 4000; // default timeout
    }
  }])

  // Add new compare-to directive (need for form validation)
  .directive("compareTo", function() {
      return {
          require: "ngModel",
          scope: {
              otherModelValue: "=compareTo"
          },
          link: function(scope, element, attributes, ngModel) {

              ngModel.$validators.compareTo = function(modelValue) {
                  return modelValue == scope.otherModelValue;
              };

              scope.$watch("otherModelValue", function() {
                  ngModel.$validate();
              });
          }
      };
  })

  // Add a copy-on-click directive
  .directive('copyOnClick', ['$window', 'System', function ($window, System) {
      return {
          restrict: 'A',
          link: function (scope, element, attrs) {
              element.bind('click', function () {
                if (!System.clipboard.enable) {
                  if ($window.getSelection && !$window.getSelection().toString() && this.value) {
                    this.setSelectionRange(0, this.value.length);
                  }
                }
              });
              element.bind('hold', function () {
                if (System.clipboard.enable && this.value) {
                  System.clipboard.copy(this.value);
                }
              });
          }
      };
  }])

  // Add a select-on-click directive
  .directive('selectOnClick', ['$window', 'System', function ($window, System) {
      return {
          restrict: 'A',
          link: function (scope, element, attrs) {
              element.bind('click', function () {
                if ($window.getSelection && !$window.getSelection().toString() && this.value) {
                  this.setSelectionRange(0, this.value.length);
                }
              });
          }
      };
  }])

.run(function($ionicPlatform, $rootScope, amMoment, $translate) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }
  });

  $rootScope.onLanguageChange = function() {
    var lang = $translate.use();
    moment.locale(lang.substring(0,2));
  };

  // Set up moment translation
  $rootScope.$on('$translateChangeSuccess', $rootScope.onLanguageChange);

})
;
