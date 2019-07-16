
angular.module('cesium.settings.services', ['ngApi', 'cesium.config'])

.factory('csSettings', function($rootScope, $q, Api, localStorage, $translate, csConfig) {
  'ngInject';

  // Define app locales
  var locales = [
    {id:'en',    label:'English'},
    {id:'en-GB', label:'English (UK)'},
    {id:'eo-EO', label:'Esperanto'},
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
    STORAGE_KEY: 'settings', // for version >= v1.1.0
    KEEP_AUTH_IDLE_SESSION: 9999
  },
  // Settings that user cannot change himself (only config can override this values)
  fixedSettings = {
    timeout : 4000,
    cacheTimeMs: 60000, /*1 min*/
    timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
    timeWarningExpire: 2592000 * 3 /*=3 mois*/,
    minVersion: '1.1.0',
    newIssueUrl: "https://git.duniter.org/clients/cesium-grp/cesium/issues/new",
    userForumUrl: "https://forum.monnaie-libre.fr",
    latestReleaseUrl: "https://api.github.com/repos/duniter/cesium/releases/latest",
    duniterLatestReleaseUrl: "https://api.github.com/repos/duniter/duniter/releases/latest",
    httpsMode: false
  },
  defaultSettings = angular.merge({
    useRelative: false,
    useLocalStorage: true, // override to false if no device
    useLocalStorageEncryption: false,
    walletHistoryTimeSecond: 30 * 24 * 60 * 60 /*30 days*/,
    walletHistorySliceSecond: 5 * 24 * 60 * 60 /*download using 5 days slice*/,
    walletHistoryAutoRefresh: true, // override to false if device
    rememberMe: true,
    keepAuthIdle: 10 * 60,
    showUDHistory: true,
    expertMode: false,
    decimalCount: 4,
    uiEffects: true,
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
      alertIfUnusedWallet: true
    },
    locale: {
      id: fixLocaleWithLog(csConfig.defaultLanguage || $translate.use()) // use config locale if set, or browser default
    }
  },
    fixedSettings,
    csConfig),

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
    var hasChanged = angular.isUndefined(previousData) || !angular.equals(previousData, data);
    if (hasChanged) {
      previousData = angular.copy(data);
      return api.data.raise.changed(data);
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

  /**
   * Apply new settings (can be partial)
   * @param newData
   */
  applyData = function(newData) {
    if (!newData) return; // skip empty

    var localeChanged = false;
    if (newData.locale && newData.locale.id) {
      // Fix previously stored locale (could use bad format)
      newData.locale.id = fixLocale(newData.locale.id);
      localeChanged = !data.locale || newData.locale.id !== data.locale.id || newData.locale.id !== $translate.use();
    }

    // Force some fixed settings, before merging
    _.keys(fixedSettings).forEach(function(key) {
      newData[key] = defaultSettings[key]; // This will apply fixed value (override by config.js file)
    });

    // Apply new settings
    angular.merge(data, newData);

    // Delete temporary properties, if false
    if (newData && newData.node && !newData.node.temporary || !data.node.temporary) delete data.node.temporary;

    // Apply the new locale (only if need)
    // will produce an event cached by onLocaleChange();
    if (localeChanged) $translate.use(data.locale.id);

  },

  restore = function() {
    var now = Date.now();

    return localStorage.getObject(constants.STORAGE_KEY)
        .then(function(storedData) {
          // No settings stored
          if (!storedData) {
            console.debug("[settings] No settings in local storage. Using defaults.");
            applyData(defaultSettings);
            emitChangedEvent();
            return;
          }

          // Apply stored data
          applyData(storedData);

          console.debug('[settings] Loaded from local storage in '+(Date.now()-now)+'ms');
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
    apply: applyData,
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
