
angular.module('cesium.settings.services', ['ngResource', 'ngApi', 'cesium.config', 'cesium.device.services'])

.factory('csSettings', function($rootScope, $q, Api, localStorage, $translate, csConfig, Device) {
  'ngInject';

    function CsSettings() {

      // Define app locales
      var locales = [
        {id:'en',    label:'English'},
        {id:'en-GB', label:'English (UK)'},
        {id:'fr-FR', label:'Français'},
        {id:'nl-NL', label:'Nederlands'}
      ];
      var fallbackLocale = csConfig.fallbackLanguage ? fixLocale(csConfig.fallbackLanguage) : 'en';

      // Convert browser locale to app locale (fix #140)
      function fixLocale (locale) {
        if (!locale) return fallbackLocale;

        // exists in app locales: use it
        if (_.findWhere(locales, {id: locale})) return locale;

        // not exists: reiterate with the root(e.g. 'fr-XX' -> 'fr')
        var localeParts = locale.split('-');
        if (localeParts.length > 1) {
          return fixLocale(localeParts[0]);
        }

        // If another locale exists with the same root: use it
        var similarLocale = _.find(locales, function(l) {
          return String.prototype.startsWith.call(l.id, locale);
        });
        if (similarLocale) return similarLocale.id;

        return fallbackLocale;
      }

      // Convert browser locale to app locale (fix #140)
      function fixLocaleWithLog (locale) {
        var fixedLocale = fixLocale(locale);
        if (locale != fixedLocale) {
          console.debug('[settings] Fix locale [{0}] -> [{1}]'.format(locale, fixedLocale));
        }
        return fixedLocale;
      }

      var
      constants = {
        STORAGE_KEY: 'CESIUM_SETTINGS'
      },
      defaultSettings = angular.merge({
        timeout : 4000,
        cacheTimeMs: 60000, /*1 min*/
        useRelative: false,
        timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
        timeWarningExpire: 2592000 * 3 /*=3 mois*/,
        useLocalStorage: Device.enable, // on mobile device, use local storage by default
        walletHistoryTimeSecond: 30 * 24 * 60 * 60 /*30 days*/,
        walletHistorySliceSecond: 5 * 24 * 60 * 60 /*download using 5 days slice*/,
        rememberMe: Device.enable, // on mobile device, remember me by default
        showUDHistory: true,
        showLoginSalt: false,
        initPhase: false, // For currency start (when block #0 not written)
        expertMode: false,
        decimalCount: 4,
        forceNetworkViewToHttp: false,
        uiEffects: true,
        minVersion: csConfig.compatProtocol_0_80 ? '0.80.0' : '0.90.0', // TODO update this if need
        newIssueUrl: "https://github.com/duniter/cesium/issues/new?labels=bug",
        helptip: {
          enable: true,
          installDocUrl: "https://github.com/duniter/duniter/blob/master/doc/install-a-node.md",
          currency: 0,
          wot: 0,
          wotCerts: 0,
          wallet: 0,
          walletCerts: 0,
          header: 0,
          settings: 0
        },
        wallet: {
          showPubkey: true,
          alertIfUnusedWallet: true,
          notificationReadTime: 0
        },
        locale: {
          id: fixLocaleWithLog(csConfig.defaultLanguage || $translate.use()) // use config locale if set, or browser default
        }
      }, csConfig),

      data = {},
      previousData,

      api = new Api(this, "csSettings"),

      reset = function() {
        _.keys(data).forEach(function(key){
          delete data[key];
        });

        applyData(defaultSettings);

        return api.data.raisePromise.reset(data)
          .then(store);
      },

      getByPath = function(path, defaultValue) {
        var obj = data;
        _.each(path.split('.'), function(key) {
          obj = obj[key];
          if (angular.isUndefined(obj)) {
            obj = defaultValue;
            return; // stop
          }
        });

        return obj;
      },

      emitChangedEvent = function() {
        var hasChanged = previousData && !angular.equals(previousData, data);
        previousData = angular.copy(data);
        if (hasChanged) {
          api.data.raise.changed(data);
        }
      },

      store = function() {
        if (data.useLocalStorage) {
          localStorage.setObject(constants.STORAGE_KEY, data);
        }
        else {
          localStorage.setObject(constants.STORAGE_KEY, null);
        }

        // Emit event on store
        return api.data.raisePromise.store(data)
          .then(emitChangedEvent);
      },

      applyData = function(newData) {
        var localeChanged = false;
        if (newData.locale && newData.locale.id) {
          // Fix previously stored locale (could use bad format)
          newData.locale.id = fixLocale(newData.locale.id);
          localeChanged = !data.locale || newData.locale.id !== data.locale.id || newData.locale.id !== $translate.use();
        }

        // Apply stored settings
        angular.merge(data, newData);

        // Always force the usage of deffault settings
        // This is a workaround for DEV (TODO: implement edition in settings ?)
        data.timeWarningExpire = defaultSettings.timeWarningExpire;
        data.timeWarningExpireMembership = defaultSettings.timeWarningExpireMembership;
        data.cacheTimeMs = defaultSettings.cacheTimeMs;
        data.timeout = defaultSettings.timeout;

        // Apply the new locale (only if need)
        if (localeChanged) {
          $translate.use(fixLocale(data.locale.id)); // will produce an event cached by onLocaleChange();
        }

      },

      restore = function() {
        var now = new Date().getTime();
        return $q(function(resolve, reject){
          console.debug("[settings] Loading from local storage...");
          var storedData = localStorage.getObject(constants.STORAGE_KEY);

          var finishRestore = function() {
            emitChangedEvent();
            resolve();
          };

          // No settings stored
          if (!storedData) {
            console.debug("[settings] No settings in local storage. Using defaults.");
            applyData(defaultSettings);
            finishRestore();
            return;
          }

          // Workaround to get node info from Cesium < 0.2.0
          if (storedData.DUNITER_NODE) {
            var nodePart = storedData.DUNITER_NODE.split(':');
            if (nodePart.length == 1 || nodePart.length == 2) {
              storedData.node = {
                host: nodePart[0],
                port: nodePart[1] // could be undefined, but that's fine
              };
            }
            delete storedData.DUNITER_NODE;
          }
          if (storedData.DUNITER_NODE_ES) {
            var esNodePart = storedData.DUNITER_NODE_ES.split(':');
            if (esNodePart.length == 1 || esNodePart.length == 2) {
              storedData.plugins = {
                es: {
                  enable: true,
                  host: esNodePart[0],
                  port: esNodePart[1] // could be undefined, but that's fine
                }
              };
            }
            delete storedData.DUNITER_NODE_ES;
          }

          // Apply stored data
          applyData(storedData);

          console.debug('[settings] Loaded from local storage in '+(new Date().getTime()-now)+'ms');
          finishRestore();
        });
      },

        // Detect locale sucessuf changes, then apply to vendor libs
      onLocaleChange = function() {
        var locale = $translate.use();
        console.debug('[settings] Locale ['+locale+']');

        // config moment lib
        try {
          moment.locale(locale.substr(0,2));
        }
        catch(err) {
          moment.locale('en');
          console.warn('[settings] Unknown local for moment lib. Using default [en]');
        }

        // config numeral lib
        try {
          numeral.language(locale.substr(0,2));
        }
        catch(err) {
          numeral.language('en');
          console.warn('[settings] Unknown local for numeral lib. Using default [en]');
        }

        // Emit event
        api.locale.raise.changed(locale);
      };
      $rootScope.$on('$translateChangeSuccess', onLocaleChange);


    api.registerEvent('data', 'reset');
    api.registerEvent('data', 'changed');
    api.registerEvent('data', 'store');
    api.registerEvent('data', 'ready');
    api.registerEvent('locale', 'changed');

    // Apply default settings. This is required on some browser (web or mobile - see #361)
    applyData(defaultSettings);

    return {
      data: data,
      getByPath: getByPath,
      reset: reset,
      store: store,
      restore: restore,
      defaultSettings: defaultSettings,
      // api extension
      api: api,
      locales: locales
    };
  }

  var service = CsSettings();

  service.restore()
    .then(function() {
      service.api.data.raise.ready();
    });

  return service;
});
