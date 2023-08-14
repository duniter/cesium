
angular.module('cesium.tx.services', ['ngApi', 'cesium.bma.services',
  'cesium.settings.services', 'cesium.wot.services' ])

.factory('csTx', function($q, $timeout, $filter, $translate, FileSaver, UIUtils, Device, BMA, Api,
                          csConfig, csSettings, csWot, csCurrency) {
  'ngInject';

  var
    api = new Api(this, "csTx");

  function reduceTxAndPush(pubkey, txArray, result, processedTxMap, allowPendings) {
    if (!txArray || !txArray.length) return; // Skip if empty

    _.forEach(txArray, function(tx) {
      if (tx.block_number !== null || allowPendings) {
        var walletIsIssuer = false;
        var otherIssuers = tx.issuers.reduce(function(res, issuer) {
          walletIsIssuer = walletIsIssuer || (issuer === pubkey);
          return (issuer !== pubkey) ? res.concat(issuer) : res;
        }, []);
        var otherRecipients = [],
          outputBase,
          sources = [],
          lockedOutputs;

        var amount = tx.outputs.reduce(function(sum, output, noffset) {
          // FIXME duniter v1.4.13
          var outputArray = (typeof output === 'string') ? output.split(':',3) : [output.amount,output.base,output.conditions];
          outputBase = parseInt(outputArray[1]);
          var outputAmount = powBase(parseInt(outputArray[0]), outputBase);
          var outputCondition = outputArray[2];
          var sigMatches =  BMA.regexp.TX_OUTPUT_SIG.exec(outputCondition);

          // Simple unlock condition
          if (sigMatches) {
            var outputPubkey = sigMatches[1];
            if (outputPubkey === pubkey) { // output is for the wallet
              if (!walletIsIssuer) {
                return sum + outputAmount;
              }
              // If pending: use output as new sources
              else if (tx.block_number === null) {
                sources.push({
                  amount: parseInt(outputArray[0]),
                  base: outputBase,
                  type: 'T',
                  identifier: tx.hash,
                  noffset: noffset,
                  consumed: false,
                  conditions: outputCondition
                });
              }
            }

            // The output is for someone else
            else {
              // Add into recipients list(if not a issuer)
              if (outputPubkey !== '' && !_.contains(otherIssuers, outputPubkey)) {
                otherRecipients.push(outputPubkey);
              }
              if (walletIsIssuer) {
                // TODO: should be fix, when TX has multiple issuers (need a repartition)
                return sum - outputAmount;
              }
            }

          }

          // Complex unlock condition, on the issuer pubkey
          else if (outputCondition.indexOf('SIG('+pubkey+')') !== -1) {
            var lockedOutput = BMA.tx.parseUnlockCondition(outputCondition);
            if (lockedOutput) {
              // Add a source
              sources.push(angular.merge({
                amount: parseInt(outputArray[0]),
                base: outputBase,
                type: 'T',
                identifier: tx.hash,
                noffset: noffset,
                conditions: outputCondition,
                consumed: false
              }, lockedOutput));
              lockedOutput.amount = outputAmount;
              lockedOutputs = lockedOutputs || [];
              lockedOutputs.push(lockedOutput);
              console.debug('[tx] has locked output:', lockedOutput);

              return sum + outputAmount;
            }
          }
          return sum;
        }, 0);

        var txPubkeys = amount > 0 ? otherIssuers : otherRecipients;
        var time = tx.time || tx.blockstampTime;

        // Avoid duplicated tx, or tx to him self (if amount = 0)
        var txKey = (amount !== 0) ? [amount, tx.hash, time].join(':') : undefined;
        if (txKey && !processedTxMap[txKey]) {
          processedTxMap[txKey] = true; // Mark as processed
          var newTx = {
            id: txKey,
            time: time,
            amount: amount,
            pubkey: txPubkeys.length === 1 ? txPubkeys[0] : undefined,
            pubkeys: txPubkeys.length > 1 ? txPubkeys : undefined,
            comment: tx.comment,
            isUD: false,
            hash: tx.hash,
            locktime: tx.locktime,
            block_number: tx.block_number
          };

            // If pending: store sources and inputs for a later use - see method processTransactionsAndSources()
          if (walletIsIssuer && tx.block_number === null) {
            newTx.inputs = tx.inputs;
            newTx.sources = sources;
          }
          if (lockedOutputs) {
            newTx.lockedOutputs = lockedOutputs;
          }
          result.push(newTx);
        }
      }
    });
  }


  function loadTx(pubkey, fromTime) {
    return $q(function(resolve, reject) {

      var nowInSec = moment().utc().unix();
      fromTime = fromTime || (nowInSec - csSettings.data.walletHistoryTimeSecond);
      var tx = {
        pendings: [],
        validating: [],
        history: [],
        errors: []
      };

      var processedTxMap = {};

      var jobs = [
        // get current block
        csCurrency.blockchain.current(true),

        // get pending tx
        BMA.tx.history.pending({pubkey: pubkey})
          .then(function (res) {
            reduceTxAndPush(pubkey, res.history.sending, tx.pendings, processedTxMap, true /*allow pendings*/);
            reduceTxAndPush(pubkey, res.history.pending, tx.pendings, processedTxMap, true /*allow pendings*/);
          })
      ];

      // get TX history since
      if (fromTime !== 'pending') {
        var slices = [];
        // Fill slices: {params, cache}[]
        {
          var sliceTime = csSettings.data.walletHistorySliceSecond;
          fromTime = fromTime - (fromTime % sliceTime);
          var i;
          for (i = fromTime; i - sliceTime < nowInSec; i += sliceTime)  {
            slices.push({params: {pubkey: pubkey, from: i, to: i+sliceTime-1}, cache: true  /*with cache*/});
          }
          slices.push({params: {pubkey: pubkey, from: i, to: nowInSec+999999999}, cache: false/*no cache for the last slice*/});
        }

        // DEBUG
        // console.debug('[tx] Loading TX using slices: ', slices);

        var reduceTxFn = function (res) {
          reduceTxAndPush(pubkey, res.history.sent, tx.history, processedTxMap, false);
          reduceTxAndPush(pubkey, res.history.received, tx.history, processedTxMap, false);
        };

        // get TX from a given time
        if (fromTime > 0) {
          jobs.push($q.all(slices.map(function(slice) {
            return BMA.tx.history.times(slice.params, slice.cache).then(reduceTxFn);
          })));
        }

        // get all TX
        else {
          jobs.push(BMA.tx.history.all({pubkey: pubkey}).then(reduceTxFn));
        }

        // get UD history
        if (csSettings.data.showUDHistory) {
          var reduceUdFn = function(res) {
            if (!res || !res.history || !res.history.history) return;
            _.forEach(res.history.history, function(ud){
              if (ud.time < fromTime) return res; // skip to old UD
              var amount = powBase(ud.amount, ud.base);
              tx.history.push({
                id: [amount, 'ud', ud.time].join(':'),
                time: ud.time,
                amount: amount,
                isUD: true,
                block_number: ud.block_number
              });
            });
          };

          // get UD from a given time
          if (fromTime > 0) {
            jobs.push($q.all(slices.map(function(slice) {
              return BMA.ud.history.times(slice.params, slice.cache).then(reduceUdFn);
            })));
          }
          // get all UD
          else {
            jobs.push(BMA.ud.history.all({pubkey: pubkey}).then(reduceUdFn));
          }
        }
      }

      // Execute jobs
      $q.all(jobs)
        .then(function(res){
          var current = res[0];

          // sort by time desc
          tx.history.sort(function(tx1, tx2) {
            return (tx2.time - tx1.time);
          });
          var firstValidatedTxIndex = _.findIndex(tx.history, function(tx){
            return (tx.block_number <= current.number - csSettings.data.blockValidityWindow);
          });
          // remove validating from history
          tx.validating = firstValidatedTxIndex > 0 ? tx.history.splice(0, firstValidatedTxIndex) : [];

          tx.fromTime = fromTime !== 'pending' && fromTime || undefined;
          tx.toTime = tx.history.length ? tx.history[0].time /*=max(tx.time)*/: tx.fromTime;

          resolve(tx);
        })
        .catch(reject);
    });
  }

  function powBase(amount, base) {
    return base <= 0 ? amount : amount * Math.pow(10, base);
  }

  function addSource(src, sources, sourcesIndexByKey) {
    var srcKey = src.type+':'+src.identifier+':'+src.noffset;
    if (angular.isUndefined(sourcesIndexByKey[srcKey])) {
      sources.push(src);
      sourcesIndexByKey[srcKey] = sources.length - 1;
    }
  }

  function addSources(result, sources) {
    _.forEach(sources, function(src) {
      addSource(src, result.sources, result.sourcesIndexByKey);
    });
  }

  function loadSourcesAndBalance(pubkey) {
    return BMA.tx.sources({pubkey: pubkey})
      .then(function(res){
        var data = {
          sources: [],
          sourcesIndexByKey: [],
          balance: 0
        };
        if (res.sources && res.sources.length) {
          _.forEach(res.sources, function(src) {
            src.consumed = false;
            data.balance += powBase(src.amount, src.base);
          });
          addSources(data, res.sources);
        }
        return data;
      })
      .catch(function(err) {
        console.warn("[tx] Error while getting sources...", err);
        throw err;
      });
  }

  function loadData(pubkey, fromTime) {
    var now = Date.now();
    var data;

    // Alert user, when request is too long (> 2s)
    $timeout(function() {
      if (!data) UIUtils.loading.update({template: "COMMON.LOADING_WAIT"});
    }, 2000);

    return $q.all([

      // Load Sources
      loadSourcesAndBalance(pubkey),

      // Load Tx
      loadTx(pubkey, fromTime)
    ])

    .then(function(res) {
      // Copy sources and balance
      data = res[0];
      data.tx = res[1];

      var txPendings = [];
      var txErrors = [];
      var balanceFromSource = data.balance;
      var balanceWithPending = data.balance;

      function _processPendingTx(tx) {
        var consumedSources = [];
        // do not check sources from received TX
        // => move this tx in errors (even if not really)
        if (tx.amount > 0) {
          txErrors.push(tx);
        }
        else {
          var validInputs = true;
          _.find(tx.inputs, function(input) {
            var inputKey = input.split(':').slice(2).join(':');
            var srcIndex = data.sourcesIndexByKey[inputKey];

            // The input source not exists: mark as invalid
            if (!angular.isDefined(srcIndex)) {
              validInputs = false;
              return true; // break
            }

            // Mark input source as consumed
            consumedSources.push(data.sources[srcIndex]);
          });

          // Some input source not exist: mark as error
          if (!validInputs) {
            console.error("[tx] Pending TX '{}' use an unknown source as input: mark as error".format(tx.hash));
            txErrors.push(tx);
          }

          // All tx inputs are valid
          else {
            // Add tx outputs has new sources
            if (tx.sources) {
              addSources(data, tx.sources);
            }
            // DO NOT modify a cached data
            //delete tx.sources;
            //delete tx.inputs;

            balanceWithPending += tx.amount; // update balance
            txPendings.push(tx);
            _.forEach(consumedSources, function(src) {
              src.consumed = true;
            });
          }
        }
      }

      var txs = data.tx.pendings;
      var retry = true;
      while(txs && txs.length) {
        // process TX pendings
        _.forEach(txs, _processPendingTx);

        // Retry once (TX could be chained and processed in a wrong order)
        if (txErrors.length > 0 && txPendings.length > 0 && retry) {
          txs = txErrors;
          txErrors = [];
          retry = false;
        }
        else {
          txs = null;
        }
      }

      data.tx = data.tx || {};
      data.tx.pendings = txPendings.sort(function(tx1, tx2) {
        return (tx2.time - tx1.time);
      });
      data.tx.errors = txErrors.sort(function(tx1, tx2) {
        return (tx2.time - tx1.time);
      });
      // Negative balance not allow (use only source's balance) - fix #769
      data.balance = (balanceWithPending < 0) ? balanceFromSource : balanceWithPending;

      // Will add uid (+ plugin will add name, avatar, etc. if enable)
      var allTx = (data.tx.history || []).concat(data.tx.validating||[], data.tx.pendings||[], data.tx.errors||[]);
      return csWot.extendAll(allTx, 'pubkey')
        .then(function() {
          console.debug('[tx] Sources and {0}TX loaded in {1}ms'.format(
            fromTime === 'pending' ? 'pending ' : '',
            Date.now() - now));
          return data;
        });
    })
    .catch(function(err) {
      console.warn('[tx] Error while getting sources and tx: ' + (err && err.message || err), err);
      throw err;
    });
  }

  function loadSources(pubkey) {
    console.debug("[tx] Loading sources for " + pubkey.substring(0,8));
    return loadData(pubkey, 'pending');
  }

  // Download TX history file
  function downloadHistoryFile(pubkey, options) {

    options = options || {};
    options.fromTime = options.fromTime || -1;

    console.debug("[tx] Exporting TX history for pubkey [{0}]".format(pubkey.substr(0,8)));

    return $q.all([
      $translate(['ACCOUNT.HEADERS.TIME',
        'COMMON.UID',
        'COMMON.PUBKEY',
        'COMMON.UNIVERSAL_DIVIDEND',
        'ACCOUNT.HEADERS.AMOUNT',
        'ACCOUNT.HEADERS.COMMENT']),
      csCurrency.blockchain.current(true/*withCache*/),
      loadData(pubkey, options.fromTime)
    ])
      .then(function(result){
        var translations = result[0];
        var currentBlock = result[1];
        var currentTime = (currentBlock && currentBlock.medianTime) || moment().utc().unix();
        var currency = currentBlock && currentBlock.currency;

        var data = result[2];

        // no TX
        if (!data || !data.tx || !data.tx.history) {
          return UIUtils.toast.show('INFO.EMPTY_TX_HISTORY');
        }

        return $translate('ACCOUNT.FILE_NAME', {currency: currency, pubkey: pubkey, currentTime : currentTime})
          .then(function(filename){

            var formatDecimal = $filter('formatDecimal');
            var medianDate = $filter('medianDate');
            var formatSymbol = $filter('currencySymbolNoHtml');

            var headers = [
              translations['ACCOUNT.HEADERS.TIME'],
              translations['COMMON.UID'],
              translations['COMMON.PUBKEY'],
              translations['ACCOUNT.HEADERS.AMOUNT'] + ' (' + formatSymbol(currency) + ')',
              translations['ACCOUNT.HEADERS.COMMENT']
            ];
            var content = data.tx.history.concat(data.tx.validating).reduce(function(res, tx){
              return res.concat([
                medianDate(tx.time),
                tx.uid,
                tx.pubkey,
                formatDecimal(tx.amount/100),
                '"' + (tx.isUD ? translations['COMMON.UNIVERSAL_DIVIDEND'] : tx.comment) + '"'
              ].join(';'));
            }, [headers.join(';')]).join('\n');
            return Device.file.save(content, {filename: filename});
          });
      });
  }

  // Register extension points
  api.registerEvent('data', 'loadUDs');

  return {
    load: loadData,
    loadSources: loadSources,
    downloadHistoryFile: downloadHistoryFile,
    // api extension
    api: api
  };
});
