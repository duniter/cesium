
angular.module('cesium.currency.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csCurrency', function($q, BMA, Api) {
  'ngInject';

  function factory(id, BMA) {
    var
      constants = {
        // Avoid to many call on well known currencies
        WELL_KNOWN_CURRENCIES: {
          g1: {
            firstBlockTime: 1488987127
          }
        }
      },

      data = {},
      api = new Api(this, "csCurrency-" + id);

    function powBase(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    }

    function resetData() {
      data.loaded = false;
      data.name = null;
      data.parameters = null;
      data.firstBlockTime = null;
      data.membersCount = null;
      data.cache = {};
      data.node = BMA;
      data.currentUD = null;
      api.data.raise.reset(data);
    }

    function loadData() {

      console.debug('[currency] Starting...');
      var now = new Date().getTime();

      // Load currency from default node
      data.cache.loadPromise = $q.all([

        // get parameters
        loadParameters()
          .then(function(parameters) {
            // load first block info
            return loadFirstBlock(parameters.currency);
          }),

        // get current data (e.g. UD, members count)
        loadCurrentData(),

        // call extensions
        api.data.raisePromise.load(data)
      ])
        .then(function() {
          console.debug('[currency] Loaded in ' + (new Date().getTime() - now) + 'ms');
          data.loaded = true;
          delete data.cache.loadPromise;
          return data;
        })
        .catch(function(err) {
          resetData();
          throw err;
        });

      return data.cache.loadPromise;
    }

    function loadParameters() {
      return BMA.blockchain.parameters()
        .then(function(res){
          data.name = res.currency;
          data.parameters = res;
          return res;
        });
    }

    function loadFirstBlock(currencyName) {
      // Well known currencies
      if (constants.WELL_KNOWN_CURRENCIES[currencyName]){
        angular.merge(data, constants.WELL_KNOWN_CURRENCIES[currencyName]);
        return $q.when();
      }

      return BMA.blockchain.block({block:0})
        .then(function(json) {
          // Need by graph plugin
          data.firstBlockTime = json.medianTime;
        })
        .catch(function(err) {
          // Special case, when currency not started yet
          if (err && err.ucode === BMA.errorCodes.BLOCK_NOT_FOUND) {
            data.firstBlockTime = 0;
            return;
          }
          throw err;
        });
    }

    function loadCurrentData() {
      return BMA.blockchain.stats.ud()
        .then(function(res){
          // Special case for currency init
          if (!res.result.blocks.length) {
            data.currentUD = data.parameters ? data.parameters.ud0 : -1;
            return data.currentUD ;
          }
          else {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return BMA.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                data.currentUD = powBase(block.dividend, block.unitbase);
                data.membersCount = block.membersCount;
                return data.currentUD;
              })
              .catch(function(err) {
                data.currentUD = null;
                throw err;
              });
          }
        })
        .catch(function(err) {
          data.currentUD = null;
          throw err;
        });
    }

    function getData() {
      if (data.loaded) { // load only once
        return $q.when(data);
      }

      // Previous load not finished: return the existing promise - fix #452
      if (data.cache.loadPromise) { // load only once
        return $q.when(data.cache.loadPromise);
      }

      return loadData();
    }

    function getDataField(field) {
      return function() {
        if (data.loaded) { // load only once
          return $q.when(data[field]);
        }

        // Previous load not finished: return the existing promise - fix #452
        if (data.cache.loadPromise) { // load only once
          return $q.when(data.cache.loadPromise)
            .then(function(){
              return data[field];
            });
        }

        return loadData().then(function(){
          return data[field];
        });
      };
    }

    // TODO register new block event, to get new UD value

    // Register extension points
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'reset');

    // init data
    resetData();

    return {
      get: getData,
      parameters: getDataField('parameters'),
      currentUD: getDataField('currentUD'),
      // api extension
      api: api,
      // deprecated methods
      default: function() {
        console.warn('[currency] \'csCurrency.default()\' has been DEPRECATED - Please use \'csCurrency.get()\' instead.');
        return getData();
      }
    };
  }

  var service = factory('default', BMA);
  service.instance = factory;
  return service;
});
