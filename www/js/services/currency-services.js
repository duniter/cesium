
angular.module('cesium.currency.services', ['ngApi', 'cesium.bma.services'])

.factory('csCurrency', function($rootScope, $q, $timeout, BMA, Api) {
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
      started = false,
      startPromise,
      listeners,
      api = new Api(this, "csCurrency-" + id);

    function powBase(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    }

    function resetData() {
      data.name = null;
      data.parameters = null;
      data.firstBlockTime = null;
      data.membersCount = null;
      data.cache = {};
      data.node = BMA;
      data.currentUD = null;
      started = false;
      startPromise = undefined;
      api.data.raise.reset(data);
    }

    function loadData() {

      // Load currency from default node
      return $q.all([

        // get parameters
        loadParameters()
          .then(function(parameters) {
            // load first block info
            return loadFirstBlock(parameters.currency);
          }),

        // get current UD
        loadCurrentUD(),

        // call extensions
        api.data.raisePromise.load(data)
      ])
      .catch(function(err) {
        resetData();
        throw err;
      });
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
            data.initPhase = true;
            console.warn('[currency] Blockchain not launched: Enable init phase mode');
            return;
          }
          throw err;
        });
    }

    function loadCurrentUD() {
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
      if (started) { // load only once
        return $q.when(data);
      }

      // Previous load not finished: return the existing promise - fix #452
      return startPromise || start();
    }

    function getDataField(field) {
      return function() {
        if (started) { // load only once
          return $q.when(data[field]);
        }

        // Previous load not finished: return the existing promise - fix #452
        return startPromise || start() // load only once
            .then(function(){
              return data[field];
            });
      };
    }

    function onBlock(json) {
      var block = new Block(json);
      block.cleanData(); // keep only count values
      console.debug('[currency] Received new block', block);

      data.currentBlock = block;

      data.medianTime = block.medianTime;
      data.membersCount = block.membersCount;

      // Update UD
      if (block.dividend) {
        data.currentUD = block.dividend;
      }

      // Dispatch to extensions
      api.data.raise.newBlock(block);
    }

    function addListeners() {
      // open web socket on block
      var wsBlock = BMA.websocket.block();
      wsBlock.on(onBlock);

      listeners = [
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this),
        wsBlock.close
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function ready() {
      if (started) return $q.when(data);
      return startPromise || start();
    }

    function stop() {
      console.debug('[currency] Stopping...');
      removeListeners();
      resetData();
    }

    function restart() {
      stop();
      return $timeout(start, 200);
    }

    function start() {
      console.debug('[currency] Starting...');
      var now = new Date().getTime();

      startPromise = BMA.ready()

        // Load data
        .then(loadData)

        // Emit ready event
        .then(function() {
          addListeners();

          console.debug('[currency] Started in ' + (new Date().getTime() - now) + 'ms');

          started = true;
          startPromise = null;

          // Emit event (used by plugins)
          api.data.raise.ready(data);
        })
        .then(function(){
          return data;
        });

      return startPromise;
    }

    // TODO register new block event, to get new UD value

    // Register extension points
    api.registerEvent('data', 'ready');
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'reset');
    api.registerEvent('data', 'newBlock');

    // init data
    resetData();

    // Default action
    //start();

    return {
      ready: ready,
      start: start,
      stop: stop,
      data: data,
      get: getData,
      parameters: getDataField('parameters'),
      currentUD: getDataField('currentUD'),
      blockchain: {
        current: getDataField('currentBlock')
      },
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
