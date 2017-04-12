// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate',
  'ngApi', 'angular-cache', 'angular.screenmatch', 'angular.bind.notifier','ImageCropper', 'ngFileSaver',
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  // removeIf(no-plugin)
  'cesium.plugins',
  // endRemoveIf(no-plugin)
  'cesium.controllers', 'cesium.templates', 'cesium.translations'
  ])

  .filter('formatInteger', function() {
    return function(input) {
      return !input ? '0' : (input < 10000000 ? numeral(input).format('0,0') : numeral(input).format('0,0.000 a'));
    };
  })

  .filter('formatAmount', function(csConfig, csSettings, csWallet, $filter) {
    var minValue = 1 / Math.pow(10, csConfig.decimalCount || 4);
    var format = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');

    function formatRelative(input, options) {
      var currentUD = options && options.currentUD ? options.currentUD : csWallet.data.currentUD;
      if (!currentUD) {
        console.warn("formatAmount: currentUD not defined");
        return;
      }
      var amount = input / currentUD;
      if (Math.abs(amount) < minValue && input !== 0) {
        amount = '~ 0';
      }
      else {
        amount = numeral(amount).format(format);
      }
      if (options && options.currency) {
        return amount + ' ' + $filter('currencySymbol')(options.currency, true);
      }
      return amount;
    }

    function formatQuantitative(input, options) {
      var amount = numeral(input/100).format((input > -1000000000 && input < 1000000000) ? '0,0.00' : '0,0.000 a');
      if (options && options.currency) {
        return amount + ' ' + $filter('currencySymbol')(options.currency, false);
      }
      return amount;
    }

    return function(input, options) {
      if (input === undefined) return;
      return (options && angular.isDefined(options.useRelative) ? options.useRelative : csSettings.data.useRelative) ?
        formatRelative(input, options) :
        formatQuantitative(input, options);
    };
  })

  .filter('currencySymbol', function($rootScope, $filter, csSettings) {
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        ($rootScope.translations.UD + '<sub>' + $filter('abbreviate')(input) + '</sub>') :
        $filter('abbreviate')(input);
    };
  })

  .filter('currencySymbolNoHtml', function($rootScope, $filter, csSettings) {
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        ($rootScope.translations.UD + ' ' + $filter('abbreviate')(input)) :
        $filter('abbreviate')(input);
    };
  })


  .filter('formatDecimal', function(csConfig, $rootScope) {
    var minValue = 1 / Math.pow(10, csConfig.decimalCount || 4);
    var format = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');

    return function(input) {
      if (input === undefined) return '0';
      if (input === Infinity || input === -Infinity) {
        console.warn("formatDecimal: division by zero ? (is currentUD defined ?) = "  + $rootScope.walletData.currentUD);
        return 'error';
      }
      if (Math.abs(input) < minValue) return '~ 0';
      return numeral(input/*-0.00005*/).format(format);
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
      return input ? moment(parseInt(input)*1000).local().format($rootScope.translations.DATE_PATTERN || 'YYYY-MM-DD HH:mm') : '';
    };
  })

  .filter('formatDateShort', function($rootScope) {
    return function(input) {
      return input ? moment(parseInt(input)*1000).local().format($rootScope.translations.DATE_SHORT_PATTERN || 'YYYY-MM-DD') : '';
    };
  })

  .filter('formatTime', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).local().format('HH:mm') : '';
    };
  })

  .filter('formatFromNow', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).startOf('minute').fromNow() : '';
    };
  })


  .filter('formatDurationTo', function() {
    return function(input) {
      return input ? moment(moment().utc().valueOf() + parseInt(input)*1000).startOf('minute').fromNow() : '';
    };
  })

  .filter('formatDuration', function() {
    return function(input) {
      return input ? moment(0).startOf('minute').from(moment(parseInt(input)*1000), true) : '';
    };
  })

  .filter('formatDurationMs', function() {
    return function(input) {
      return input ? (
        (input < 1000) ?
          (input + 'ms') :
          (input/1000 + 's')
      ) : '';
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

  .filter('capitalize', function() {
    return function(input) {
      if (!input) return '';
      input = input.toLowerCase();
      return input.substring(0,1).toUpperCase()+input.substring(1);
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

.filter('upper', function() {
    return function(input) {
      if (!input) return '';
      return input.toUpperCase();
    };
  })

  .filter('formatPubkey', function() {
    return function(input) {
      return input ? input.substr(0,8) : '';
    };
  })

  .filter('formatHash', function() {
    return function(input) {
      return input ? input.substr(0,4) + input.substr(input.length-4) : '';
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
        .replace(/<[^>]+>/g,'') // Remove tag (like HTML tag)
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

    // removeIf(no-device)
    // Group http request response processing (better performance when many request)
    $httpProvider.useApplyAsync(true);
    // endRemoveIf(no-device)
  })

  .config(function($compileProvider, csConfig) {
    'ngInject';

    $compileProvider.debugInfoEnabled(!!csConfig.DEBUG);
  })

  .config(function($animateProvider) {
    'ngInject';
    $animateProvider.classNameFilter( /\banimate-/ );
  })

  // Configure cache (used by HTTP requests) default max age
  .config(function (CacheFactoryProvider) {
    angular.extend(CacheFactoryProvider.defaults, { maxAge: 60 * 1000 /*1min*/});
  })

  // Configure screen size detection
  .config(function(screenmatchConfigProvider) {
    screenmatchConfigProvider.config.rules = 'bootstrap';
  })

  .config(function($ionicConfigProvider) {
    'ngInject';
    // JS scrolling need for iOs (see http://blog.ionic.io/native-scrolling-in-ionic-a-tale-in-rhyme/)
    var enableJsScrolling = ionic.Platform.isIOS();
    $ionicConfigProvider.scrolling.jsScrolling(enableJsScrolling);

    // Configure the view cache
    $ionicConfigProvider.views.maxCache(5);
  })

.run(function($rootScope, $translate, $state, $window, ionicReady, Device, UIUtils, $ionicConfig, PluginService, csWallet, csSettings, csConfig) {
  'ngInject';

  $rootScope.config = csConfig;
  $rootScope.settings = csSettings.data;
  $rootScope.walletData = csWallet.data;
  $rootScope.device = Device;

  // Compute the root path
  var hashIndex = $window.location.href.indexOf('#');
  $rootScope.rootPath = (hashIndex != -1) ? $window.location.href.substr(0, hashIndex) : $window.location.href;
  console.debug('[app] Root path is [' + $rootScope.rootPath + ']');

  // removeIf(android)
  // removeIf(ios)
  // removeIf(firefoxos)
  // Automatic redirection to large state (if define) (keep this code for platforms web and ubuntu build)
  $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if (next.data.large && !UIUtils.screen.isSmall()) {
      var redirect = !$rootScope.tour && !event.currentScope.tour; // disabled for help tour
      if (redirect) {
        event.preventDefault();
        $state.go(next.data.large, nextParams);
      }
    }
  });
  // endRemoveIf(firefoxos)
  // endRemoveIf(ios)
  // endRemoveIf(android)

  // removeIf(device)
  // Automatic redirection to HTTPS
  if ((csConfig.httpsMode === true || csConfig.httpsMode == 'true' ||csConfig.httpsMode === 'force') &&
    $window.location.protocol != 'https:') {
    $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
      var path = 'https' + $rootScope.rootPath.substr(4) + $state.href(next, nextParams);
      if (csConfig.httpsModeDebug) {
        console.debug('[app] [httpsMode] --- Should redirect to: ' + path);
        // continue
      }
      else {
        $window.location.href = path;
      }
    });
  }
  // endRemoveIf(device)

  // Update some translations, when locale changed
  function onLocaleChange() {
    console.debug('[app] Loading cached translations for locale [{0}]'.format($translate.use()));
    $translate(['COMMON.DATE_PATTERN', 'COMMON.DATE_SHORT_PATTERN', 'COMMON.UD'])
      .then(function(translations) {
        $rootScope.translations = $rootScope.translations || {};
        $rootScope.translations.DATE_PATTERN = translations['COMMON.DATE_PATTERN'];
        if ($rootScope.translations.DATE_PATTERN === 'COMMON.DATE_PATTERN') {
          $rootScope.translations.DATE_PATTERN = 'YYYY-MM-DD HH:mm';
        }
        $rootScope.translations.DATE_SHORT_PATTERN = translations['COMMON.DATE_SHORT_PATTERN'];
        if ($rootScope.translations.DATE_SHORT_PATTERN === 'COMMON.DATE_SHORT_PATTERN') {
          $rootScope.translations.DATE_SHORT_PATTERN = 'YYYY-MM-DD';
        }
        $rootScope.translations.UD = translations['COMMON.UD'];
        if ($rootScope.translations.UD === 'COMMON.UD') {
          $rootScope.translations.UD = 'UD';
        }
      });
  }
  csSettings.api.locale.on.changed($rootScope, onLocaleChange, this);

  // Start plugins eager services
  PluginService.start();

  // Force at least on call
  onLocaleChange();

  // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
  ionicReady()
    .then(function() {

      // Keyboard
      if (Device.keyboard.enable) {
        // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
        // for form inputs)
        Device.keyboard.hideKeyboardAccessoryBar(true);

        // iOS: do not push header up when opening keyboard
        // (see http://ionicframework.com/docs/api/page/keyboard/)
        if (ionic.Platform.isIOS()) {
          Device.keyboard.disableScroll(true);
        }
      }

      // Ionic Platform Grade is not A, disabling views transitions
      if (ionic.Platform.grade.toLowerCase()!='a') {
        console.log('[app] Disabling UI effects, because plateform\'s grade is [' + ionic.Platform.grade + ']');
        UIUtils.setEffects(false);
      }

      // Status bar style
      if (window.StatusBar) {
        // org.apache.cordova.statusbar required
        StatusBar.styleDefault();
      }

      // Force to start settings
      return csSettings.ready();
    })

    // Trying to restore default wallet
    .then(csWallet.restore)

    // Storing wallet to root scope
    .then(function(walletData){
      $rootScope.walletData = walletData;
    });


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
