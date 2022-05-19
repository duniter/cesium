// Cesium filters
angular.module('cesium.filters', ['cesium.config', 'cesium.platform', 'pascalprecht.translate', 'cesium.translations'
])

  .factory('filterTranslations', function($rootScope, $q, csPlatform, csSettings, csCurrency, $translate, $timeout) {
    'ngInject';

    var
      started = false,
      startPromise,
      that = this;

    that.MEDIAN_TIME_OFFSET = 3600  /*G1 default value*/;

    // Update some translations, when locale changed
    function onLocaleChange() {
      console.debug('[filter] Loading translations for locale [{0}]'.format($translate.use()));
      return $translate(['COMMON.DATE_PATTERN', 'COMMON.DATE_SHORT_PATTERN', 'COMMON.UD', 'COMMON.DAYS'])
        .then(function(translations) {
          that.DATE_PATTERN = translations['COMMON.DATE_PATTERN'];
          if (that.DATE_PATTERN === 'COMMON.DATE_PATTERN') {
            that.DATE_PATTERN = 'YYYY-MM-DD HH:mm';
          }
          that.DATE_SHORT_PATTERN = translations['COMMON.DATE_SHORT_PATTERN'];
          if (that.DATE_SHORT_PATTERN === 'COMMON.DATE_SHORT_PATTERN') {
            that.DATE_SHORT_PATTERN = 'YYYY-MM-DD';
          }
          that.DATE_MONTH_YEAR_PATTERN = translations['COMMON.DATE_MONTH_YEAR_PATTERN'];
          if (that.DATE_MONTH_YEAR_PATTERN === 'COMMON.DATE_MONTH_YEAR_PATTERN') {
            that.DATE_MONTH_YEAR_PATTERN = 'MMM YY';
          }
          that.DAYS = translations['COMMON.DAYS'];
          if (that.DAYS === 'COMMON.DAYS') {
            that.DAYS = 'days';
          }
          that.UD = translations['COMMON.UD'];
          if (that.UD === 'COMMON.UD') {
            that.UD = 'UD';
          }
        });
    }

    // Update some translations, when locale changed
    function onCurrencyChange() {
      console.debug('[filter] Computing constants from currency parameters');
      that.MEDIAN_TIME_OFFSET = csCurrency.data.medianTimeOffset || that.MEDIAN_TIME_OFFSET;
    }

    that.ready = function() {
      if (started) return $q.when();
      return startPromise || that.start();
    };

    that.start = function() {
      startPromise = csPlatform.ready()
        .then(onLocaleChange)
        .then(function() {
          onCurrencyChange();
          started = true;

          csSettings.api.locale.on.changed($rootScope, onLocaleChange, this);
          csCurrency.api.data.on.ready($rootScope, onCurrencyChange, this);
        });
      return startPromise;
    };

    // Default action
    // Must be started with a delay, to allow settings override, before starting platform (need by Cesium API)
    $timeout(function() {
      that.start();
    });

    return that;
  })

  .filter('formatInteger', function() {
    return function(input) {
      return !input ? '0' : (input < 10000000 ? numeral(input).format('0,0') : numeral(input).format('0,0.000 a'));
    };
  })

  .filter('formatAmount', function(csConfig, csSettings, csCurrency, $filter) {
    'ngInject';
    var pattern = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');
    var patternBigNumber = '0,0.000 a';
    var currencySymbol = $filter('currencySymbol');

    // Always add one decimal for relative unit
    var patternRelative = pattern + '0';
    var minValueRelative = 1 / Math.pow(10, (csConfig.decimalCount || 4) + 1 /*add one decimal in relative*/);

    function formatRelative(input, options) {
      var currentUD = options && options.currentUD ? options.currentUD : csCurrency.data.currentUD;
      if (!currentUD) {
        console.warn("formatAmount: currentUD not defined");
        return;
      }
      var amount = input / currentUD;
      if (Math.abs(input) < minValueRelative && input !== 0) {
        amount = '~ 0';
      }
      else {
        amount = numeral(amount).format(patternRelative);
      }
      if (options && options.currency) {
        return amount + ' ' + currencySymbol(options.currency, true);
      }
      return amount;
    }

    function formatQuantitative(input, options) {
      var amount = numeral(input/100).format((input < -1000000000 || input > 1000000000) ? patternBigNumber : pattern);
      if (options && options.currency) {
        return amount + ' ' + currencySymbol(options.currency, false);
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

  .filter('formatAmountNoHtml', function(csConfig, csSettings, csCurrency, $filter) {
    'ngInject';
    var minValue = 1 / Math.pow(10, csConfig.decimalCount || 4);
    var format = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');
    var currencySymbol = $filter('currencySymbolNoHtml');

    function formatRelative(input, options) {
      var currentUD = options && options.currentUD ? options.currentUD : csCurrency.data.currentUD;
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
        return amount + ' ' + currencySymbol(options.currency, true);
      }
      return amount;
    }

    function formatQuantitative(input, options) {
      var amount = numeral(input/100).format((input > -1000000000 && input < 1000000000) ? '0,0.00' : '0,0.000 a');
      if (options && options.currency) {
        return amount + ' ' + currencySymbol(options.currency, false);
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

  .filter('currencySymbol', function(filterTranslations, $filter, csSettings) {
    'ngInject';
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        (filterTranslations.UD + '<sub>' + $filter('abbreviate')(input) + '</sub>') :
        $filter('abbreviate')(input);
    };
  })

  .filter('currencySymbolNoHtml', function(filterTranslations, $filter, csSettings) {
    'ngInject';
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        (filterTranslations.UD + ' ' + $filter('abbreviate')(input)) :
        $filter('abbreviate')(input);
    };
  })

  .filter('formatDecimal', function(csConfig, csCurrency) {
    'ngInject';
    var minValue = 1 / Math.pow(10, csConfig.decimalCount || 4);
    var format = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');

    return function(input) {
      if (input === undefined) return '0';
      if (input === Infinity || input === -Infinity) {
        console.warn("formatDecimal: division by zero ? (is currentUD defined ?) = "  + csCurrency.data.currentUD);
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

  .filter('formatDate', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_PATTERN || 'YYYY-MM-DD HH:mm') : '';
    };
  })

  .filter('formatDateShort', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_SHORT_PATTERN || 'YYYY-MM-DD') : '';
    };
  })

  .filter('formatDateMonth', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_MONTH_YEAR_PATTERN || 'MMM YY') : '';
    };
  })

  .filter('formatDateForFile', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_FILE_PATTERN || 'YYYY-MM-DD') : '';
    };
  })

  .filter('formatTime', function() {
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format('HH:mm') : '';
    };
  })

  .filter('formatFromNow', function() {
    return function(input) {
      return input ? moment.unix(parseInt(input)).fromNow() : '';
    };
  })

  .filter('formatFromNowAndDate', function(filterTranslations) {
    'ngInject';
    return function(input, options) {
      var m = input && moment.unix(parseInt(input));
      return m && (m.fromNow() + (options && options.separator || ' | ') + m.local().format(filterTranslations.DATE_PATTERN || 'YYYY-MM-DD HH:mm')) || '';
    };
  })

  .filter('formatDurationTo', function() {
    return function(input) {
      return input ? moment.unix(moment().utc().unix() + parseInt(input)).fromNow() : '';
    };
  })

  .filter('formatDuration', function() {
    return function(input) {
      return input ? moment(0).from(moment.unix(parseInt(input)), true) : '';
    };
  })


  .filter('formatDurationTime', function(filterTranslations) {
    'ngInject';
    return function(input) {
      if (!input) return '';
      var sign = input && input < 0 ? '-' : '+';
      input = Math.abs(input);
      var day = Math.trunc(input/3600/24);
      var hour = Math.trunc(input/3600 - day*24);
      var min = Math.trunc(input/60 - day*24*60 - hour*60);
      return day > 0 ? (sign + day + ' ' + filterTranslations.DAYS + ' ' + hour + 'h ' + min + 'm') :
        (hour > 0 ? (sign + hour + 'h ' + min + 'm') : (sign + min + 'm')) ;
    };
  })

  // Display time in ms or seconds (see i18n label 'COMMON.EXECUTION_TIME')
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
      var duration = moment(0).from(moment.unix(parseInt(input)), true);
      return duration.split(' ').slice(-1)[0]; // keep only last words (e.g. remove "un" "a"...)
    };
  })

  .filter('formatFromNowShort', function() {
    return function(input) {
      return input ? moment.unix(parseInt(input)+offset).fromNow(true) : '';
    };
  })

  /* -- median time (apply currency offset)-- */

  .filter('medianDate', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input) + filterTranslations.MEDIAN_TIME_OFFSET).local().format(filterTranslations.DATE_PATTERN || 'YYYY-MM-DD HH:mm') : '';
    };
  })

  .filter('medianDateShort', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input) + filterTranslations.MEDIAN_TIME_OFFSET).local().format(filterTranslations.DATE_SHORT_PATTERN || 'YYYY-MM-DD') : '';
    };
  })


  .filter('medianTime', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)+filterTranslations.MEDIAN_TIME_OFFSET).local().format('HH:mm') : '';
    };
  })

  .filter('medianFromNow', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input) + filterTranslations.MEDIAN_TIME_OFFSET).fromNow() : '';
    };
  })

  .filter('medianFromNowShort', function(filterTranslations) {
    'ngInject';
    return function(input) {
      return input ? moment.unix(parseInt(input)+filterTranslations.MEDIAN_TIME_OFFSET).fromNow(true) : '';
    };
  })

  .filter('medianFromNowAndDate', function(filterTranslations) {
    'ngInject';
    return function(input, options) {
      var m = input && moment.unix(parseInt(input)+filterTranslations.MEDIAN_TIME_OFFSET);
      return m && (m.fromNow() + (options && options.separator || ' | ')  + m.local().format(filterTranslations.DATE_PATTERN || 'YYYY-MM-DD HH:mm')) || '';
    };
  })


  /* -- text filter -- */

  .filter('capitalize', function() {
    return function(input) {
      if (!input) return '';
      input = input.toLowerCase();
      return input.length > 1 ? (input.substring(0,1).toUpperCase()+input.substring(1)) : input;
    };
  })

  .filter('abbreviate', function() {
    var _cache = {};
    return function(input) {
      var currency = input || '';
      if (_cache[currency]) return _cache[currency];
      if (currency.length > 3) {
        var unit = '', sepChars = ['-', '_', ' '];
        for (var i = 0; i < currency.length; i++) {
          var c = currency[i];
          if (i === 0) {
            unit = (c === 'g' || c === 'G') ? 'Ğ' : c ;
          }
          else if (i > 0 && sepChars.indexOf(currency[i-1]) != -1) {
            unit += c;
          }
        }
        currency = unit.toUpperCase();
      }
      else {
        currency = currency.toUpperCase();
        if (currency.charAt(0) === 'G') {
          currency = 'Ğ' + (currency.length > 1 ? currency.substr(1) : '');
        }
      }

      _cache[input] = currency;
      return currency;
    };
  })

  .filter('upper', function() {
    return function(input) {
      if (!input) return '';
      return input.toUpperCase();
    };
  })

  .filter('formatPubkey', function(csCrypto) {
    'ngInject';
    return function(input, opts) {
      if (!input || input.length < 43) return '';
      var result = (!opts || opts.full !== true) ?
        // See RFC0016
        (input.substr(0,4)  + '…' + input.substr(input.length - 4)) : input;
      // If given (e.g. already computed) use the existing CHK
      if (opts && opts.checksum) {
        result += ':' + opts.checksum;
      }
      // Crypto libs can be not loaded yet
      else if (csCrypto.isStarted()){
        result += ':' + csCrypto.util.pkChecksum(input);
      }
      return result;
    };
  })

  .filter('pkChecksum', function(csCrypto) {
    'ngInject';
    return function(input, opts) {
      if (!input || input.length < 43) return '';
      if (opts && opts.prefix) {
        return ':' + csCrypto.util.pkChecksum(input);
      }
      return csCrypto.util.pkChecksum(input);
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

  .filter('truncUrl', function() {
    return function(input, size) {
      size = size || 25;
      var startIndex = input.startsWith('http://') ? 7 : (input.startsWith('https://') ? 8 : 0);
      startIndex = input.startsWith('www.', startIndex) ? startIndex + 4 : startIndex; // Remove sequence 'www.'
      return !input || (input.length-startIndex) <= size ? input.substr(startIndex) : (input.substr(startIndex, size) + '...');
    };
  })

  .filter('trustAsHtml', function($sce) {
    'ngInject';
    return function(html) {
      return $sce.trustAsHtml(html);
    };
  })
;
