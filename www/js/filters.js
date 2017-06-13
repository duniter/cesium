// Cesium filters
angular.module('cesium.filters', ['cesium.config', 'cesium.platform', 'pascalprecht.translate', 'cesium.translations'
])

  .service('filterTranslations', function($rootScope, csPlatform, csSettings, $translate) {
    'ngInject';

    var
      started = false,
      startPromise,
      that = this;

    // Update some translations, when locale changed
    function onLocaleChange() {
      console.debug('[filter] Loading translations for locale [{0}]'.format($translate.use()));
      return $translate(['COMMON.DATE_PATTERN', 'COMMON.DATE_SHORT_PATTERN', 'COMMON.UD'])
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

          that.UD = translations['COMMON.UD'];
          if (that.UD === 'COMMON.UD') {
            that.UD = 'UD';
          }
        });
    }

    that.ready = function() {
      if (started) return $q.when(data);
      return startPromise || that.start();
    };

    that.start = function() {
      startPromise = csPlatform.ready()
        .then(onLocaleChange)
        .then(function() {
          started = true;

          csSettings.api.locale.on.changed($rootScope, onLocaleChange, this);
        });
      return startPromise;
    };

    // Default action
    that.start();

    return that;
  })

  .filter('formatInteger', function() {
    return function(input) {
      return !input ? '0' : (input < 10000000 ? numeral(input).format('0,0') : numeral(input).format('0,0.000 a'));
    };
  })

  .filter('formatAmount', function(csConfig, csSettings, csCurrency, $filter) {
    var minValue = 1 / Math.pow(10, csConfig.decimalCount || 4);
    var format = '0,0.0' + Array(csConfig.decimalCount || 4).join('0');
    var currencySymbol = $filter('currencySymbol');

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

  .filter('formatAmountNoHtml', function(csConfig, csSettings, csCurrency, $filter) {
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
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        (filterTranslations.UD + '<sub>' + $filter('abbreviate')(input) + '</sub>') :
        $filter('abbreviate')(input);
    };
  })

  .filter('currencySymbolNoHtml', function(filterTranslations, $filter, csSettings) {
    return function(input, useRelative) {
      if (!input) return '';
      return (angular.isDefined(useRelative) ? useRelative : csSettings.data.useRelative) ?
        (filterTranslations.UD + ' ' + $filter('abbreviate')(input)) :
        $filter('abbreviate')(input);
    };
  })


  .filter('formatDecimal', function(csConfig, csCurrency) {
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
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_PATTERN || 'YYYY-MM-DD HH:mm') : '';
    };
  })

  .filter('formatDateShort', function(filterTranslations) {
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_SHORT_PATTERN || 'YYYY-MM-DD') : '';
    };
  })

  .filter('formatDateMonth', function(filterTranslations) {
    return function(input) {
      return input ? moment.unix(parseInt(input)).local().format(filterTranslations.DATE_MONTH_YEAR_PATTERN || 'MMM YY') : '';
    };
  })

  .filter('formatDateForFile', function(filterTranslations) {
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
      return input ? moment.unix(parseInt(input)).fromNow(true) : '';
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

;
