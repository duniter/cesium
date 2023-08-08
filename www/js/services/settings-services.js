
angular.module('cesium.settings.services', ['ngApi', 'cesium.config'])

.factory('csSettings', function($rootScope, $q, $window, Api, localStorage, $translate, csConfig) {
  'ngInject';

  // Define app locales
  var
    locales = [
      {id:'en',    label:'English', flag: 'us'},
      {id:'en-GB', label:'English (UK)', flag: 'gb'},
      {id:'eo-EO', label:'Esperanto', flag: 'eo'},
      {id:'fr-FR', label:'Français', flag: 'fr'},
      {id:'nl-NL', label:'Nederlands', flag: 'nl'},
      {id:'es-ES', label:'Español', flag: 'es'},
      {id:'ca',    label:'Català', flag: 'ca'},
      {id:'it-IT', label:'Italiano', flag: 'it'},
      {id:'pt-PT', label:'Português', flag: 'pt'},
      {id:'de-DE', label:'Deutsch', flag: 'de'}
    ],
    timeouts = [
      -1,
      500,
      1000,
      5000,
      10000,
      30000,
      60000,
      300000
    ],
    fallbackLocale = csConfig.fallbackLanguage ? fixLocale(csConfig.fallbackLanguage) : 'en'
  ;

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
    if (locale !== fixedLocale) {
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
    cacheTimeMs: 60000, /*1 min*/
    timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
    timeWarningExpire: 2592000 * 3 /*=3 mois*/,
    minVersion: '1.1.0', // TODO change into 1.8.7
    sourceUrl: 'https://git.duniter.org/clients/cesium-grp/cesium',
    sourceLicenseUrl: 'https://git.duniter.org/clients/cesium-grp/cesium/-/raw/master/LICENSE',
    newIssueUrl: "https://git.duniter.org/clients/cesium-grp/cesium/issues/new",
    userForumUrl: "https://forum.monnaie-libre.fr",
    latestReleaseUrl: "https://api.github.com/repos/duniter/cesium/releases/latest",
    duniterLatestReleaseUrl: "https://api.github.com/repos/duniter/duniter/releases/latest",
    httpsMode: false
  },
  defaultSettings = angular.merge({
    timeout: -1, // -1 = auto
    useRelative: false,
    useLocalStorage: !!$window.localStorage, // override to false if no device
    useLocalStorageEncryption: false,
    persistCache: false, // disable by default (waiting resolution of issue #885)
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
    network: {
      // Synchronized BMA peers found
      peers: []
    },
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
      wallets: 0,
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
    },
    license: {
      "en": "license/license_g1-en",
      "fr-FR": "license/license_g1-fr-FR",
      "es-ES": "license/license_g1-es-ES",
      "es-CT": "license/license_g1-es-CT",
      "eo-EO": "license/license_g1-eo-EO",
      "pt-PT": "license/license_g1-pt-PT",
      "it-IT": "license/license_g1-it-IT",
      "de-DE": "license/license_g1-de-DE"
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

  function reset() {
    _.keys(data).forEach(function(key){
      delete data[key];
    });

    applyData(defaultSettings);

    return api.data.raisePromise.reset(data)
      .then(store);
  }

  function getByPath(path, defaultValue) {
    var obj = data;
    _.each(path.split('.'), function(key) {
      obj = obj[key];
      if (angular.isUndefined(obj)) {
        obj = defaultValue;
        return; // stop
      }
    });

    return obj;
  }

  function emitChangedEvent() {
    var hasChanged = angular.isUndefined(previousData) || !angular.equals(previousData, data);
    if (hasChanged) {
      previousData = angular.copy(data);
      return api.data.raise.changed(data);
    }
  }

  function store() {
    if (!started) {
      console.debug('[settings] Waiting start finished...');
      return (startPromise || start()).then(store);
    }

    var promise;
    if (data.useLocalStorage) {
      // When node is temporary (fallback node): keep previous node address - issue #476
      if (data.node && data.node.temporary === true) {
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
          console.debug('[settings] Saved locally');
        }

        // Emit event on store
        return api.data.raisePromise.store(data);
      })

      // Emit event on store
      .then(emitChangedEvent);
  }

  /**
   * Apply new settings (can be partial)
   * @param newData
   */
  function applyData(newData) {
    if (!newData) return; // skip empty

    // DEBUG
    //console.debug('[settings] Applying data', newData);

    var localeChanged = false;
    if (newData.locale && newData.locale.id) {
      // Fix previously stored locale (could use bad format)
      var localeId = fixLocale(newData.locale.id);
      newData.locale = _.findWhere(locales, {id: localeId});
      localeChanged = !data.locale || newData.locale.id !== data.locale.id || newData.locale.id !== $translate.use();
    }

    // Force some fixed settings, before merging
    _.keys(fixedSettings).forEach(function(key) {
      newData[key] = defaultSettings[key]; // This will apply fixed value (override by config.js file)
    });

    // Force using an existing timeout (e.g. for version < 1.7.4)
    newData.timeout = newData.timeout && timeouts.includes(newData.timeout) ? newData.timeout : -1 /* auto */;

    // If need select a random peer, from the config
    if (!data.node && !newData.node && _.size(csConfig.fallbackNodes) > 0) {
      newData.node = _.sample(csConfig.fallbackNodes);
      console.info('[settings] Random selected peer [{0}]'.format(newData.node.host));
      newData.node.temporary = true;
    }

    // Apply new settings
    angular.merge(data, newData);

    // Delete temporary properties, if false
    if ((newData && newData.node && !newData.node.temporary) || (data.node && !data.node.temporary)) {
      delete data.node.temporary;
    }

    // Apply the new locale (only if need)
    // will produce an event cached by onLocaleChange();
    if (localeChanged) {
      $translate.use(data.locale.id);
    }
  }

  function restore() {
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

          console.debug('[settings] Loaded from local storage in {0}ms'.format(Date.now()-now));

          // Apply stored data
          applyData(storedData);

          emitChangedEvent();
        });
  }

  function getLicenseUrl() {
    var locale = data.locale && data.locale.id || csConfig.defaultLanguage || 'en';
    return (csConfig.license) ?
      (csConfig.license[locale] ? csConfig.license[locale] : defaultSettings.license[csConfig.defaultLanguage || 'en'] || csConfig.license) : undefined;
  }

  function getFeedUrl() {
    var locale = data.locale && data.locale.id || csConfig.defaultLanguage || 'en';
    return (csConfig.feed && csConfig.feed.jsonFeed) ?
      (csConfig.feed.jsonFeed[locale] ? csConfig.feed.jsonFeed[locale] : defaultSettings.feed.jsonFeed[csConfig.defaultLanguage || 'en'] || csConfig.feed) : undefined;
  }

  // Detect locale successful changes, then apply to vendor libs
  function onLocaleChange() {
    var locale = $translate.use();
    console.debug('[settings] Locale ['+locale+']');

    // config moment lib
    try {
      moment.locale(locale.toLowerCase());
    }
    catch(err) {
      try {
        moment.locale(locale.substr(0,2));
      }
      catch(err) {
        moment.locale('en-gb');
        console.warn('[settings] Unknown local for moment lib. Using default [en]');
      }
    }

    // config numeral lib
    try {
      numeral.language(locale.toLowerCase());
    }
    catch(err) {
      try {
        numeral.language(locale.substring(0, 2));
      }
      catch(err) {
        numeral.language('en-gb');
        console.warn('[settings] Unknown local for numeral lib. Using default [en]');
      }
    }

    // Emit event
    api.locale.raise.changed(locale);
  }

  function isStarted() {
    return started;
  }

  function ready() {
    if (started) return $q.when();
    return startPromise || start();
  }

  function start() {
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

        return data;
      });

    return startPromise;
  }

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
    isStarted: isStarted,
    ready: ready,
    start: start,
    data: data,
    apply: applyData,
    getByPath: getByPath,
    reset: reset,
    store: store,
    restore: restore,
    getLicenseUrl: getLicenseUrl,
    getFeedUrl: getFeedUrl,
    defaultSettings: defaultSettings,
    // api extension
    api: api,
    locales: locales,
    timeouts: timeouts,
    constants: constants
  };
});
