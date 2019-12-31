
angular.module('cesium.currency.services', ['ngApi', 'cesium.bma.services'])

.factory('csCurrency', function($rootScope, $q, $timeout, BMA, Api, csSettings) {
  'ngInject';

  var defaultBMA = BMA;

  function CsCurrency(id, BMA) {

    BMA = BMA || defaultBMA;

    var
      constants = {
        // Avoid to many call on well known currencies
        WELL_KNOWN_CURRENCIES: {
          g1: {
            firstBlockTime: 1488987127,
            medianTimeOffset: 3600
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
      data.medianTimeOffset = 0;
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
          data.medianTimeOffset = res.avgGenTime * res.medianTimeBlocks / 2;
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
        .then(function(res) {
          // Special case for currency init
          if (!res.result.blocks.length) {
            data.currentUD = data.parameters ? data.parameters.ud0 : -1;
            return data.currentUD ;
          }
          return _safeLoadCurrentUD(res, res.result.blocks.length - 1);
        })
        .catch(function(err) {
          data.currentUD = null;
          throw err;
        });
    }

    /**
     * Load the last UD, with a workaround if last block with UD is not found in the node
     * @param res
     * @param blockIndex
     * @returns {*}
     * @private
     */
    function _safeLoadCurrentUD(res, blockIndex) {
      // Special case for currency init
      if (!res.result.blocks.length || blockIndex < 0) {
        data.currentUD = data.parameters ? data.parameters.ud0 : -1;
        return data.currentUD ;
      }
      else {
        var lastBlockWithUD = res.result.blocks[blockIndex];
        return BMA.blockchain.block({ block: lastBlockWithUD })
          .then(function(block){
            data.currentUD = powBase(block.dividend, block.unitbase);
            return data.currentUD;
          })
          .catch(function(err) {
            console.error("[currency] Unable to load last block with UD, with number {0}".format(lastBlockWithUD));
            if (blockIndex > 0) {
              console.error("[currency] Retrying to load UD from a previous block...");
              return _safeLoadCurrentUD(res, blockIndex-1);
            }
            data.currentUD = null;
            throw err;
          });
      }
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
      block.cleanData(); // Remove unused content (arrays...) and keep items count

      //console.debug('[currency] Received new block', block);
      console.debug('[currency] Received new block {' + block.number + '-' + block.hash + '}');

      data.currentBlock = block;
      data.currentBlock.receivedAt = moment().utc().unix();

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
      listeners = [
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this),
        // open web socket on block
        BMA.websocket.block().onListener(onBlock)
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
      var now = Date.now();

      startPromise = BMA.ready()

        // Load data
        .then(loadData)

        // Emit ready event
        .then(function() {
          addListeners();

          console.debug('[currency] Started in ' + (Date.now() - now) + 'ms');

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

    var currentBlockField = getDataField('currentBlock');

    function getCurrent(cache) {
      // Get field (and make sure service is started)
      return currentBlockField()

        .then(function(currentBlock) {

          var now = moment().utc().unix();

          if (cache) {
            if (currentBlock && currentBlock.receivedAt && (now - currentBlock.receivedAt) < 60/*1min*/) {
              //console.debug('[currency] Use current block #'+ currentBlock.number +' from cache (age='+ (now - currentBlock.receivedAt) + 's)');
              return currentBlock;
            }

            if (!currentBlock) {
              // Should never occur, if websocket /ws/block works !
              console.warn('[currency] No current block in cache: get it from network. Websocket [/ws/block] may not be started ?');
            }
          }

          return BMA.blockchain.current()
            .catch(function(err){
              // Special case for currency init (root block not exists): use fixed values
              if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                return {number: 0, hash: BMA.constants.ROOT_BLOCK_HASH, medianTime: now};
              }
              throw err;
            })
            .then(function(current) {
              data.currentBlock = current;
              data.currentBlock.receivedAt = now;
              return current;
            });
        });
    }

    function getLastValidBlock() {
      if (csSettings.data.blockValidityWindow <= 0) {
        return getCurrent(true);
      }

      return getCurrent(true)
        .then(function(current) {
          var number = current.number - csSettings.data.blockValidityWindow;
          return (number > 0) ? BMA.blockchain.block({block: number}) : current;
        });
    }

    // Get time in second (UTC - medianTimeOffset)
    function getDateNow() {
      return moment().utc().unix() - (data.medianTimeOffset || constants.WELL_KNOWN_CURRENCIES.g1.medianTimeOffset);
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
      name: getDataField('name'),
      parameters: getDataField('parameters'),
      currentUD: getDataField('currentUD'),
      medianTimeOffset: getDataField('medianTimeOffset'),
      blockchain: {
        current: getCurrent,
        lastValid: getLastValidBlock
      },
      date: {
        now: getDateNow
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

  var service = new CsCurrency('default');
  service.instance = function(id, bma) {
    return new CsCurrency(id, bma);
  };
  return service;
});
