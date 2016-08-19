
angular.module('cesium.settings.services', ['ngResource', 'ngApi', 'cesium.config'])

.factory('csSettings', function($q, csConfig, Api, localStorage, $translate) {
  'ngInject';

  CSSettings = function(id) {

    var
      constants = {
        STORAGE_KEY: 'CESIUM_SETTINGS'
      },

      defaultSettings = angular.merge({
        useRelative: true,
        timeWarningExpireMembership: 2592000 * 2 /*=2 mois*/,
        timeWarningExpire: 2592000 * 3 /*=3 mois*/,
        useLocalStorage: false,
        rememberMe: false,
        showUDHistory: true,
        locale: {
          id: $translate.use()
        }
      }, csConfig),

      data = angular.copy(defaultSettings),

      api = new Api(this, "csSettings-" + id),

      reset = function() {
        angular.merge(data, defaultSettings);
      },

      store = function(options) {
        if (data.useLocalStorage) {
          localStorage.setObject(constants.STORAGE_KEY, data);
        }
        else {
          localStorage.setObject(constants.STORAGE_KEY, null);
        }

        // Emit event on changed
        api.data.raise.changed(data);

      },

      restore = function() {
        return $q(function(resolve, reject){
          var storedData = localStorage.getObject(constants.STORAGE_KEY);
          if (!storedData) {
            resolve();
            return;
          }

          var localeChanged = storedData.locale && storedData.locale.id && (data.locale.id !== storedData.locale.id);
          angular.merge(data, storedData);

          // Always force the usage of deffault settings
          // This is a workaround for DEV (TODO: implement edition in settings)
          data.timeWarningExpire = defaultSettings.timeWarningExpire;
          data.timeWarningExpireMembership = defaultSettings.timeWarningExpireMembership;
          delete data.DUNITER_NODE;
          delete data.DUNITER_NODE_ES;

          if (localeChanged) {
            $translate.use(data.locale.id);
          }


          // Emit event on changed
          api.data.raisePromise.changed(data);
          //resolve();
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
