
angular.module('cesium.currency.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csCurrency', function($q, BMA, Api) {
  'ngInject';

  factory = function(id) {

    var
      data = {
        loaded: false,
        currencies: null
      },
      api = new Api(this, "csCurrency-" + id),

      loadData = function() {
        return $q(function (resolve, reject){
          if (data.loaded) { // load only once
            resolve(data);
            return;
          }

          data.currencies = [];
          // Load currency from default node
          BMA.blockchain.parameters()
          .then(function(res){
            data.currencies.push({
                name: res.currency,
                peer: BMA.node,
                parameters: res
              });

            // API extension point
            return api.data.raisePromise.load(data);
          })
          .then(function() {
            data.loaded = true;
            resolve(data);
          })
          .catch(function(err) {
            data.loaded = false;
            data.currencies = [];
            reject(err);
          });
        });
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
      }
    ;

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
