
angular.module('cesium.currency.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csCurrency', function($q, BMA, Api, $rootScope) {
  'ngInject';

  factory = function(id) {

    var
      constants = {
        // Avoid to many call on well known currencies
        WELL_KNOWN_CURRENCIES: {
          g1: {
            firstBlockTime: 1488987127
          }
        }
      },

      data = {
        loaded: false,
        currencies: null,
        cache: {
          loadPromise: null
        }
      },
      api = new Api(this, "csCurrency-" + id),

      loadData = function() {
        if (data.loaded) { // load only once
          return $q.when(data);
        }

        // Previous load not finished: return the existing promise - fix #452
        if (data.cache.loadPromise) { // load only once
          return $q.when(data.cache.loadPromise);
        }

        data.currencies = [];

        var now = new Date().getTime();

        // Load currency from default node
        var promise = BMA.blockchain.parameters()
          .then(function(res){
            var currency = {
                name: res.currency,
                peer: {
                  host: BMA.host,
                  port: BMA.port,
                  server: BMA.server
                },
                parameters: res
              };
            // Add to data
            data.currencies.push(currency);

            // Well known currencies
            if (constants.WELL_KNOWN_CURRENCIES[res.currency]){
              angular.merge(currency, constants.WELL_KNOWN_CURRENCIES[res.currency]);
            }

            // Load some default values
            else {
              return BMA.blockchain.block({block:0})
                .then(function(json) {
                  // Need by graph plugin
                  currency.firstBlockTime = json.medianTime;
                })
                .catch(function(err) {
                  // Special case, when currency not started yet
                  if (err && err.ucode === BMA.errorCodes.BLOCK_NOT_FOUND) {
                    currency.firstBlockTime = 0;
                    return;
                  }
                  throw err;
                })
                ;
            }
          })
          .then(function() {
            // API extension point
            return api.data.raisePromise.load(data);
          })
          .then(function() {
            console.debug('[currency] Loaded in ' + (new Date().getTime() - now) + 'ms');
            data.loaded = true;
            delete data.cache.loadPromise;
            return data;
          })
          .catch(function(err) {
            data.loaded = false;
            data.currencies = [];
            delete data.cache.loadPromise;
            throw err;
          });

        data.cache.loadPromise = promise;
        return promise;
      },

      getAll = function() {
        return loadData()
        .then(function(data){
          return data.currencies;
        });
      },

      getDefault = function() {
        return loadData()
          .then(function(data){
            if (!data || !data.currencies || !data.currencies.length) throw new Error('No default currency');
            return data.currencies[0];
          });
      },

      searchByName = function(name) {
        return loadData()
          .then(function(data){
            return _.findWhere(data.currencies, {name: name});
          });
      };

    // Register extension points
    api.registerEvent('data', 'load');

    return {
      id: id,
      load: loadData,
      all: getAll,
      default: getDefault,
      searchByName: searchByName,
      // api extension
      api: api
    };
  };

  var service = factory('default');

  service.instance = factory;
  return service;
});
