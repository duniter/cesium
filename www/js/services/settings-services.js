
angular.module('cesium.settings.services', ['ngApi', 'cesium.config'])

.factory('csSettings', function($rootScope, $q, Api, localStorage, $translate, csConfig) {
  'ngInject';

  // Define app locales
  var locales = [
    {id:'en',    label:'English'},
    {id:'en-GB', label:'English (UK)'},
    {id:'fr-FR', label:'Français'},
    {id:'nl-NL', label:'Nederlands'},
    {id:'es-ES', label:'Spanish'},
    {id:'it-IT', label:'Italiano'}
  ];
  var fallbackLocale = csConfig.fallbackLanguage ? fixLocale(csConfig.fallbackLanguage) : 'en';

  // Convert browser locale to app locale (fix #140)
  function fixLocale (locale) {
    if (!locale) return fallbackLocale;

    // exists in app locales: use it
    if (_.findWhere(locales, {id: locale})) return locale;

    // not exists: reiterate with the root (e.g. 'fr-XX' -> 'fr')
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
    OLD_STORAGE_KEY: 'CESIUM_SETTINGS',
    STORAGE_KEY: 'settings',
    KEEP_AUTH_IDLE_SESSION: 9999
  },
  defaultSettings = angular.merge({
    timeout : 4000,
    cacheTimeMs: 60000, /*1 min*/
    useRelative: false,
    timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
    timeWarningExpire: 2592000 * 3 /*=3 mois*/,
    useLocalStorage: true, // override to false if no device
    walletHistoryTimeSecond: 30 * 24 * 60 * 60 /*30 days*/,
    walletHistorySliceSecond: 5 * 24 * 60 * 60 /*download using 5 days slice*/,
    walletHistoryAutoRefresh: true, // override to false if device
    rememberMe: true,
    keepAuthIdle: 10 * 60,
    showUDHistory: true,
    httpsMode: false,
    expertMode: false,
    decimalCount: 4,
    uiEffects: true,
    minVersion: '1.1.0',
    newIssueUrl: "https://git.duniter.org/clients/cesium/cesium/issues/new",
    userForumUrl: "https://forum.monnaie-libre.fr",
    latestReleaseUrl: "https://api.github.com/repos/duniter/cesium/releases/latest",
    duniterLatestReleaseUrl: "https://api.github.com/repos/duniter/duniter/releases/latest",
    blockValidityWindow: 6,
    helptip: {
      enable: true,
      installDocUrl: "https://duniter.org/en/wiki/duniter/install/",
      currency: 0,
      network: 0,
      wotLookup: 0,
      wot: 0,
      wotCerts: 0,
      wallet: 0,
      walletCerts: 0,
      header: 0,
      settings: 0
    },
    currency: {
      allRules: false,
      allWotRules: false
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
  started = false,
  startPromise,
  api = new Api(this, "csSettings");

  // removeIf(no-device)
  // set defaults for device
  defaultSettings.walletHistoryAutoRefresh = false;
  // endRemoveIf(no-device)

  var
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
    if (!started) {
      console.debug('[setting] Waiting start finished...');
      return (startPromise || start()).then(store);
    }

    var promise;
    if (data.useLocalStorage) {
      // When node is temporary (fallback node): keep previous node address - issue #476
      if (data.node.temporary === true) {
        promise = localStorage.getObject(constants.STORAGE_KEY)
          .then(function(previousSettings) {
            var savedData = angular.copy(data);
            savedData.node = previousSettings && previousSettings.node || {};
            delete savedData.temporary; // never store temporary flag
            return localStorage.setObject(constants.STORAGE_KEY, savedData);
          });
      }
      else {
        promise = localStorage.setObject(constants.STORAGE_KEY, data);
      }
    }
    else {
      promise  = localStorage.setObject(constants.STORAGE_KEY, null);
    }

    return promise
      .then(function() {
        if (data.useLocalStorage) {
          console.debug('[setting] Saved locally');
        }

        // Emit event on store
        return api.data.raisePromise.store(data);
      })

      // Emit event on store
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

    // Always force the usage of default settings
    // This is a workaround for DEV (TODO: implement edition in settings ?)
    data.timeWarningExpire = defaultSettings.timeWarningExpire;
    data.timeWarningExpireMembership = defaultSettings.timeWarningExpireMembership;
    data.cacheTimeMs = defaultSettings.cacheTimeMs;
    data.timeout = defaultSettings.timeout;
    data.minVersion = defaultSettings.minVersion;
    data.latestReleaseUrl = defaultSettings.latestReleaseUrl;
    data.duniterLatestReleaseUrl = defaultSettings.duniterLatestReleaseUrl;
    data.newIssueUrl = defaultSettings.newIssueUrl;
    data.userForumUrl = defaultSettings.userForumUrl;

    // Apply the new locale (only if need)
    if (localeChanged) {
      $translate.use(fixLocale(data.locale.id)); // will produce an event cached by onLocaleChange();
    }

  },

  restore = function() {
    var now = new Date().getTime();

    return $q.all([
        localStorage.getObject(constants.OLD_STORAGE_KEY),
        localStorage.getObject(constants.STORAGE_KEY)
      ])
        .then(function(res) {
          // Clean old storage
          localStorage.put(constants.OLD_STORAGE_KEY, null);
          var storedData = res[1] || res[0];
          // No settings stored
          if (!storedData) {
            console.debug("[settings] No settings in local storage. Using defaults.");
            applyData(defaultSettings);
            emitChangedEvent();
            return;
          }

          // Apply stored data
          applyData(storedData);

          console.debug('[settings] Loaded from local storage in '+(new Date().getTime()-now)+'ms');
          emitChangedEvent();
        });
  },

  getLicenseUrl = function() {
    var locale = data.locale && data.locale.id || csConfig.defaultLanguage || 'en';
    return (csConfig.license) ?
      (csConfig.license[locale] ? csConfig.license[locale] : csConfig.license[csConfig.defaultLanguage || 'en'] || csConfig.license) : undefined;
  },

  // Detect locale successful changes, then apply to vendor libs
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
  },


  ready = function() {
    if (started) return $q.when();
    return startPromise || start();
  },

  start = function() {
    console.debug('[settings] Starting...');

    startPromise = localStorage.ready()

      // Restore
      .then(restore)

      // Emit ready event
      .then(function() {
        console.debug('[settings] Started');
        started = true;
        startPromise = null;
        // Emit event (used by plugins)
        api.data.raise.ready(data);
      });

    return startPromise;
  };

  $rootScope.$on('$translateChangeSuccess', onLocaleChange);

  api.registerEvent('data', 'reset');
  api.registerEvent('data', 'changed');
  api.registerEvent('data', 'store');
  api.registerEvent('data', 'ready');
  api.registerEvent('locale', 'changed');

  // Apply default settings. This is required on some browser (web or mobile - see #361)
  applyData(defaultSettings);

  // Default action
  //start();

  return {
    ready: ready,
    start: start,
    data: data,
    getByPath: getByPath,
    reset: reset,
    store: store,
    restore: restore,
    getLicenseUrl: getLicenseUrl,
    defaultSettings: defaultSettings,
    // api extension
    api: api,
    locales: locales,
    constants: constants
  };
});
