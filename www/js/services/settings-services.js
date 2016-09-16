
angular.module('cesium.settings.services', ['ngResource', 'ngApi', 'cesium.config', 'cesium.device.services'])

.factory('csSettings', function($q, Api, localStorage, $translate, csConfig, Device) {
  'ngInject';

  var defaultLocale = $translate.use(); // browser default
  defaultLocale = defaultLocale.startsWith('fr') ? 'fr-FR' : browserDefaultLocale; // convert in app locale (fix #140)

  CSSettings = function(id) {

    var
      constants = {
        STORAGE_KEY: 'CESIUM_SETTINGS'
      },

      defaultSettings = angular.merge({
        timeout : 4000,
        cacheTimeMs: 60000, /*1 min*/
        useRelative: true,
        timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
        timeWarningExpire: 2592000 * 3 /*=3 mois*/,
        useLocalStorage: Device.enable, // on mobile device, use local storage by default
        walletHistoryTimeSecond: 30 * 24 * 60 * 60 /*30 days*/,
        walletHistorySliceSecond: 5 * 24 * 60 * 60 /*download using 5 days slice*/,
        rememberMe: Device.enable, // on mobile device, remember me by default
        showUDHistory: true,
        locale: {
          id: defaultLocale
        }
      }, csConfig),

      data = angular.copy(defaultSettings),

      api = new Api(this, "csSettings-" + id),

      reset = function() {
        angular.merge(data, defaultSettings);
      },

      store = function() {
        if (data.useLocalStorage) {
          localStorage.setObject(constants.STORAGE_KEY, data);
        }
        else {
          localStorage.setObject(constants.STORAGE_KEY, null);
        }

        // Emit event on changed
        api.data.raise.changed(data);

      },

      restore = function(first) {
        return $q(function(resolve, reject){
          var storedData = localStorage.getObject(constants.STORAGE_KEY);

          // No settings stored
          if (!storedData) {
            if (defaultLocale !== $translate.use()) {
              $translate.use(defaultLocale);
              // Emit event on changed
              api.data.raise.changed(data);
            }
            resolve();
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

          var localeChanged = storedData.locale && storedData.locale.id &&
            (storedData.locale.id !== data.locale.id || storedData.locale.id !== $translate.use());

          // Apply stored settings
          angular.merge(data, storedData);

          // Always force the usage of deffault settings
          // This is a workaround for DEV (TODO: implement edition in settings)
          data.timeWarningExpire = defaultSettings.timeWarningExpire;
          data.timeWarningExpireMembership = defaultSettings.timeWarningExpireMembership;
          data.cacheTimeMs = defaultSettings.cacheTimeMs;

          // Set the new locale
          if (localeChanged) {
            $translate.use(data.locale.id);
          }

          console.debug("[settings] Restored");

          // Emit event on changed
          api.data.raise.changed(data);
          resolve();
        });
      };

    api.registerEvent('data', 'changed');

    return {
      id: id,
      data: data,
      reset: reset,
      store: store,
      restore: restore,
      defaultSettings: defaultSettings,
      // api extension
      api: api
    };
  };

  var service = CSSettings('default');

  service.restore();

  service.instance = CSSettings;
  return service;
});
