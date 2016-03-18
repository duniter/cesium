// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ngMessages', 'pascalprecht.translate', 'cesium.controllers'])

  .filter('formatInteger', function() {
    return function(input) {
      return input ? numeral(input).format('0,0') : '';
    }
  })

  .filter('formatDecimal', function() {
      return function(input) {
        if (Math.abs(input) < 0.0001) return '~ 0';
        return Math.floor(input * 10000) / 10000;
      }
    })

  .filter('formatDate', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).format('YYYY-MM-DD HH:mm') : '';
    }
  })

  .filter('abbreviate', function() {
    return function(input) {
      var unit = '', sepChars = ['-', '_', ' '], currency = input || '';
      for (var i = 0; i < currency.length; i++) {
        var c = currency[i];
        if (i == 0 || (i > 0 && sepChars.indexOf(currency[i-1]) != -1)) {
          unit += c;
        }
      }
      return unit.toUpperCase();
    }
  })

  .filter('formatPubkey', function() {
    return function(input) {
      return input ? input.substr(0,8) : '';
    }
  })

  // Translation i18n
  .config(function ($translateProvider) {
    $translateProvider.useStaticFilesLoader({
        prefix: 'i18n/locale-',
        suffix: '.json'
    })
    .uniformLanguageTag('bcp47')
    .determinePreferredLanguage()
    .useSanitizeValueStrategy('sanitize')
    .fallbackLanguage(['en', 'fr'])
    .useLoaderCache(true);

  })

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

.run(function($ionicPlatform) {
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
})
;
