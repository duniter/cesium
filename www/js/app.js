// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ngCordova', 'ionic-material', 'ngMessages', 'pascalprecht.translate', 'cesium.controllers'])

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

  /*moment.locale('fr', {
      months : "janvier_février_mars_avril_mai_juin_juillet_août_septembre_octobre_novembre_décembre".split("_"),
      monthsShort : "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_"),
      weekdays : "dimanche_lundi_mardi_mercredi_jeudi_vendredi_samedi".split("_"),
      weekdaysShort : "dim._lun._mar._mer._jeu._ven._sam.".split("_"),
      weekdaysMin : "Di_Lu_Ma_Me_Je_Ve_Sa".split("_"),
      longDateFormat : {
          LT : "HH:mm",
          LTS : "HH:mm:ss",
          L : "DD/MM/YYYY",
          LL : "D MMMM YYYY",
          LLL : "D MMMM YYYY LT",
          LLLL : "dddd D MMMM YYYY LT"
      },
      calendar : {
          sameDay: "[Aujourd'hui à] LT",
          nextDay: '[Demain à] LT',
          nextWeek: 'dddd [à] LT',
          lastDay: '[Hier à] LT',
          lastWeek: 'dddd [dernier à] LT',
          sameElse: 'L'
      },
      relativeTime : {
          future : "dans %s",
          past : "il y a %s",
          s : "quelques secondes",
          m : "une minute",
          mm : "%d minutes",
          h : "une heure",
          hh : "%d heures",
          d : "un jour",
          dd : "%d jours",
          M : "un mois",
          MM : "%d mois",
          y : "une année",
          yy : "%d années"
      },
      ordinalParse : /\d{1,2}(er|ème)/,
      ordinal : function (number) {
          return number + (number === 1 ? 'er' : 'ème');
      },
      meridiemParse: /PD|MD/,
      isPM: function (input) {
          return input.charAt(0) === 'M';
      },
      // in case the meridiem units are not separated around 12, then implement
      // this function (look at locale/id.js for an example)
      // meridiemHour : function (hour, meridiem) {
      //     return *//* 0-23 hour, given meridiem token and hour 1-12 *//*
      // },
      meridiem : function (hours, minutes, isLower) {
          return hours < 12 ? 'PD' : 'MD';
      },
      week : {
          dow : 1, // Monday is the first day of the week.
          doy : 4  // The week that contains Jan 4th is the first week of the year.
      }
  });*/
})
;
