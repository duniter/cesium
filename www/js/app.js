// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate',
  'ngApi', 'angular-cache', 'angular.screenmatch',
  // removeIf(device)
  // endRemoveIf(device)
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  // removeIf(no-plugin)
  'cesium.plugins',
  // endRemoveIf(no-plugin)
  'cesium.directives', 'cesium.controllers', 'cesium.templates', 'cesium.translations'
  ])

  .filter('formatInteger', function() {
    return function(input) {
      return !input ? '0' : (input < 10000000 ? numeral(input).format('0,0') : numeral(input).format('0,0.000 a'));
    };
  })

  .filter('formatDecimal', function() {
    return function(input) {
      if (input === undefined) return '0';
      if (input === Infinity || input === -Infinity) {
        console.warn("formatDecimal: division by zero ? (is currentUD defined ?)");
        return 'error';
      }
      if (Math.abs(input) < 0.0001) return '~ 0';
      return numeral(input/*-0.00005*/).format('0,0.0000');
    };
  })

  .filter('formatNumeral', function() {
    return function(input, pattern) {
      if (input === undefined) return '0';
      // for DEBUG only
      //if (isNaN(input)) {
      //    return 'NaN';
      //}
      if (Math.abs(input) < 0.0001) return '~ 0';
      return numeral(input).format(pattern);
    };
  })

  .filter('formatDate', function($rootScope) {
    return function(input) {
      return input ? moment(parseInt(input)*1000).local().format($rootScope.datePattern || 'YYYY-MM-DD HH:mm') : '';
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

  .filter('formatPeriod', function() {
    return function(input) {
      if (!input) {return null;}
      var duration = moment(0).startOf('minute').from(moment(parseInt(input)*1000), true);
      return duration.split(' ').slice(-1)[0]; // keep only last words (e.g. remove "un" "a"...)
    };
  })

  .filter('formatFromNowShort', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).startOf('minute').fromNow(true) : '';
    };
  })

  .filter('abbreviate', function() {
    return function(input) {
      var currency = input || '';
      if (currency.length > 3) {
        var unit = '', sepChars = ['-', '_', ' '];
        for (var i = 0; i < currency.length; i++) {
          var c = currency[i];
          if (i === 0 || (i > 0 && sepChars.indexOf(currency[i-1]) != -1)) {
            unit += c;
          }
        }
        return unit.toUpperCase();
      }
      else {
        return currency.toUpperCase();
      }
    };
  })

  .filter('capitalize', function() {
    return function(input) {
      if (!input) return '';
      input = input.toLowerCase();
      return input.substring(0,1).toUpperCase()+input.substring(1);
    };
  })

  .filter('formatPubkey', function() {
    return function(input) {
      return input ? input.substr(0,8) : '';
    };
  })

  .filter('formatHash', function() {
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

  // Convert a URI into parameter (e.g. "http://hos/path" -> "http%3A%2F%2Fhost%2Fpath")
  .filter('formatEncodeURI', function() {
    return function(input) {
      return input ? encodeURIComponent(input): '';
    };
  })

  .filter('truncText', function() {
    return function(input, size) {
      size = size || 500;
      return !input || input.length <= size ? input : (input.substr(0, size) + '...');
    };
  })

  // Translation i18n
  .config(function ($translateProvider, csConfig) {
    'ngInject';

    $translateProvider
    .uniformLanguageTag('bcp47')
    .determinePreferredLanguage()
    // Cela fait bugger les placeholder (pb d'affichage des accents en FR)
    //.useSanitizeValueStrategy('sanitize')
    .useSanitizeValueStrategy(null)
    .fallbackLanguage([csConfig.fallbackLanguage ? csConfig.fallbackLanguage : 'en'])
    .useLoaderCache(true);
  })

  .config(function($httpProvider, csConfig) {
    'ngInject';
    // Set default timeout
    $httpProvider.defaults.timeout = !!csConfig.TIMEOUT ? csConfig.TIMEOUT : 4000 /* default timeout */;

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .config(function($compileProvider, csConfig) {
    'ngInject';

    $compileProvider.debugInfoEnabled(!!csConfig.DEBUG);
  })

  .config(function($animateProvider) {
    'ngInject';
    $animateProvider.classNameFilter( /\banimate-/ );
  })

  .config(function (CacheFactoryProvider) {
    angular.extend(CacheFactoryProvider.defaults, { maxAge: 60 * 1000 /*1min*/});
  })

  .config(function(screenmatchConfigProvider) {
    screenmatchConfigProvider.config.rules = 'bootstrap';
  })

  .config(function($ionicConfigProvider) {
    'ngInject';
    // JS scrolling need for iOs (see http://blog.ionic.io/native-scrolling-in-ionic-a-tale-in-rhyme/)
    var enableJsScrolling = ionic.Platform.isIOS();
    $ionicConfigProvider.scrolling.jsScrolling(enableJsScrolling);
    $ionicConfigProvider.views.maxCache(5);
  })

.run(function($rootScope, $translate, Device, UIUtils, $ionicConfig, PluginService, $http
) {
  'ngInject';

  // We use 'Device.ready()' instead of '$ionicPlatform.ready()', because it could be call many times
  Device.ready()
  .then(function() {

    // Keyboard
    if (window.cordova && window.cordova.plugins.Keyboard) {
      // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
      // for form inputs)
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);

      // iOS: do not push header up when opening keyboard
      // (see http://ionicframework.com/docs/api/page/keyboard/)
      if (ionic.Platform.isIOS()) {
        cordova.plugins.Keyboard.disableScroll(true);
      }
    }

    // Status bar
    if (window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }

    // Ionic Platform Grade is not A, disabling views transitions
    if (ionic.Platform.grade.toLowerCase()!='a') {
      console.log('Disable visual effects because plateform grade is not [a] but [' + ionic.Platform.grade + ']');
      $ionicConfig.views.transition('none');
      UIUtils.disableEffects();
    }
  });

  var onLanguageChange = function() {
    var lang = $translate.use();
    console.debug('[app] Locale ['+lang+']');

    // config moment lib
    try {
      moment.locale(lang.substr(0,2));
    }
    catch(err) {
      moment.locale('en');
      console.warn('[app] Unknown local for moment lib. Using default');
    }

    // config numeral lib
    try {
      numeral.language(lang.substr(0,2));
    }
    catch(err) {
      numeral.language('en');
      console.warn('[app] Unknown local for numeral lib. Using default');
    }

    // Set date pattern (see 'formatDate' filter)
    $translate('COMMON.DATE_PATTERN')
      .then(function(datePattern) {
        $rootScope.datePattern = datePattern || 'YYYY-MM-DD HH:mm';
      });

  };

  // Set up moment translation
  $rootScope.$on('$translateChangeSuccess', onLanguageChange);

  // start plugin
  PluginService.start();

  // set locale to vendor lib
  onLanguageChange();
})
;

// Workaround to add "".startsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.debug("Adding String.prototype.startsWith() -> was missing on this platform");
  String.prototype.startsWith = function(prefix) {
      return this.indexOf(prefix) === 0;
  };
}

// Workaround to add Math.trunc() if not present - fix #144
if (Math && typeof Math.trunc !== 'function') {
  console.debug("Adding Math.trunc() -> was missing on this platform");
  Math.trunc = function(number) {
    return (number - 0.5).toFixed();
  };
}

// Workaround to add "".format() if not present
if (typeof String.prototype.format !== 'function') {
  console.debug("Adding String.prototype.format() -> was missing on this platform");
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined' ? args[number] : match;
    });
  };
}
