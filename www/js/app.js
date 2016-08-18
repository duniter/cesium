// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ionic-material', 'ngMessages', 'ngAnimate', 'pascalprecht.translate', 'angularMoment', 'ngApi',
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
      return !input ? '0' : numeral(input).format('0,0').replace(',', ' ');
    };
  })

  .filter('formatDecimal', function() {
    return function(input) {
      if (input === undefined) return '0';
      //if (input === Infinity || input === -Infinity) {
      //  return '∞';
      //}
      if (Math.abs(input) < 0.0001) return '~ 0';
      return numeral(input-0.00005).format('0,0.0000').replace(',', ' ');
    };
  })

  .filter('formatNumeral', function() {
    return function(input, pattern) {
      if (input === undefined) return '0';
      //if (isNaN(input)) {
      //    return 'NaN';
      //}
      if (Math.abs(input) < 0.0001) return '~ 0';
      return numeral(input).format(pattern).replace(',', ' ');
    };
  })

  .filter('formatDate', function($translate) {
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

  .filter('formatPeriod', function() {
    return function(input) {
      if (!input) {return null;}
      var duration = moment(0).startOf('minute').from(moment(parseInt(input)*1000), true);
      return duration.split(" ").slice(-1)[0]; // keep only the last word (e.g. remove "un" "a"...)
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
    'ngInject';

    $translateProvider
    .uniformLanguageTag('bcp47')
    .determinePreferredLanguage()
    // Cela fait bugger les placeholder (pb d'affichage des accents en FR)
    //.useSanitizeValueStrategy('sanitize')
    .useSanitizeValueStrategy(null)
    .fallbackLanguage(['en'])
    .useLoaderCache(true);
  })

  .config(function($httpProvider, APP_CONFIG) {
    'ngInject';
    // Set default timeout
    $httpProvider.defaults.timeout = !!APP_CONFIG.TIMEOUT ? APP_CONFIG.TIMEOUT : 4000 /* default timeout */;

    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .config(function($compileProvider, APP_CONFIG) {
    'ngInject';

    $compileProvider.debugInfoEnabled(!!APP_CONFIG.DEBUG);
  })

  .config(function($animateProvider) {
    'ngInject';
    $animateProvider.classNameFilter( /\banimate-/ );
  })

  // removeIf(no-device)
  // FIXME: native transition on a PAD move also move the left menu !
  /*
  .config(function($ionicNativeTransitionsProvider){
    'ngInject';
    // Use native transition
    var enableNativeTransitions = ionic.Platform.isAndroid() || ionic.Platform.isIOS();
    $ionicNativeTransitionsProvider.enable(enableNativeTransitions);
  })
  */
  // endRemoveIf(no-device)

  .config(function($ionicConfigProvider) {
    'ngInject';
    // JS scrolling need for iOs (see http://blog.ionic.io/native-scrolling-in-ionic-a-tale-in-rhyme/)
    var enableJsScrolling = ionic.Platform.isIOS();
    $ionicConfigProvider.scrolling.jsScrolling(enableJsScrolling);
    $ionicConfigProvider.views.maxCache(5);
  })

.run(function($rootScope, amMoment, $translate, Device, UIUtils, $ionicConfig, PluginService
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

  $rootScope.onLanguageChange = function() {
    var lang = $translate.use();
    moment.locale(lang.substring(0,2));
  };

  // Set up moment translation
  $rootScope.$on('$translateChangeSuccess', $rootScope.onLanguageChange);

  // start plugin
  PluginService.start();
})
;

// Workaround to add startsWith() if not present
if (typeof String.prototype.startsWith !== 'function') {
  console.log("Adding String.prototype.startsWith() -> was missing on this platform");
  String.prototype.startsWith = function(prefix) {
      return this.indexOf(prefix) === 0;
  };
}
