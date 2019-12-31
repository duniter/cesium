
angular.module('cesium.tx.services', ['ngApi', 'cesium.bma.services',
  'cesium.settings.services', 'cesium.wot.services' ])

.factory('csTx', function($q, $timeout, $filter, $translate, FileSaver, UIUtils, BMA, Api,
                          csConfig, csSettings, csWot, csCurrency) {
  'ngInject';

  var defaultBMA = BMA;

  function CsTx(id, BMA) {

    BMA = BMA || defaultBMA;
    var
      api = new Api(this, "csTx-" + id),

      _reduceTxAndPush = function(pubkey, txArray, result, processedTxMap, allowPendings) {
        if (!txArray || !txArray.length) return; // Skip if empty

        _.forEach(txArray, function(tx) {
          if (tx.block_number !== null || allowPendings) {
            var walletIsIssuer = false;
            var otherIssuer = tx.issuers.reduce(function(issuer, res) {
              walletIsIssuer = walletIsIssuer || (res === pubkey);
              return issuer + ((res !== pubkey) ? ', ' + res : '');
            }, '');
            if (otherIssuer.length > 0) {
              otherIssuer = otherIssuer.substring(2);
            }
            var otherReceiver;
            var outputBase;
            var sources = [];
            let lockedOutputs;
            var amount = tx.outputs.reduce(function(sum, output, noffset) {
              // FIXME duniter v1.4.13
              var outputArray = (typeof output == 'string') ? output.split(':',3) : [output.amount,output.base,output.conditions];
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
                else { // output is for someone else
                  if (outputPubkey !== '' && outputPubkey != otherIssuer) {
                    otherReceiver = outputPubkey;
                  }
                  if (walletIsIssuer) {
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

            var txPubkey = amount > 0 ? otherIssuer : otherReceiver;
            var time = tx.time || tx.blockstampTime;

            // Avoid duplicated tx, or tx to him self
            var txKey = amount + ':' + tx.hash + ':' + time;
            if (!processedTxMap[txKey]) {
              processedTxMap[txKey] = true; // Mark as processed
              var newTx = {
                time: time,
                amount: amount,
                pubkey: txPubkey,
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
      },

      loadTx = function(pubkey, fromTime) {
        return $q(function(resolve, reject) {

          var nowInSec = moment().utc().unix();
          fromTime = fromTime || (nowInSec - csSettings.data.walletHistoryTimeSecond);
          var tx = {
            pendings: [],
            validating: [],
            history: [],
            errors: []
          };

          const processedTxMap = {};
          const _reducePendingTx = function (res) {
            _reduceTxAndPush(pubkey, res.history.sending, tx.pendings, processedTxMap, true /*allow pendings*/);
            _reduceTxAndPush(pubkey, res.history.pending, tx.pendings, processedTxMap, true /*allow pendings*/);
          };

          var jobs = [
            // get current block
            csCurrency.blockchain.current(true),

            // get pending tx
            BMA.tx.history.pending({pubkey: pubkey})
              .then(_reducePendingTx)
          ];

          // get TX history since
          if (fromTime !== 'pending') {
            const _reduceTx = function (res) {
              _reduceTxAndPush(pubkey, res.history.sent, tx.history, processedTxMap, false);
              _reduceTxAndPush(pubkey, res.history.received, tx.history, processedTxMap, false);
            };

            // get TX from a given time
            if (fromTime > 0) {
              // Use slice, to be able to cache requests result
              const sliceTime = csSettings.data.walletHistorySliceSecond;
              fromTime = fromTime - (fromTime % sliceTime);
              for(var i = fromTime; i - sliceTime < nowInSec; i += sliceTime)  {
                jobs.push(BMA.tx.history.times({pubkey: pubkey, from: i, to: i+sliceTime-1}, true /*with cache*/)
                  .then(_reduceTx)
                );
              }

              // Last slide: no cache
              jobs.push(BMA.tx.history.times({pubkey: pubkey, from: nowInSec - (nowInSec % sliceTime), to: nowInSec+999999999}, false/*no cache*/)
                .then(_reduceTx));
            }

            // get all TX
            else {
              jobs.push(BMA.tx.history.all({pubkey: pubkey})
                .then(_reduceTx)
              );
            }

            // get UD history
            if (csSettings.data.showUDHistory && fromTime > 0) {
              /*jobs.push(
                BMA.ud.history({pubkey: pubkey})
                  .then(function(res){
                    udHistory = !res.history || !res.history.history ? [] :
                      _.forEach(res.history.history, function(ud){
                        if (ud.time < fromTime) return res; // skip to old UD
                        var amount = powBase(ud.amount, ud.base);
                        udHistory.push({
                          time: ud.time,
                          amount: amount,
                          isUD: true,
                          block_number: ud.block_number
                        });
                      });
                  }));*/
              // API extension
              jobs.push(
                api.data.raisePromise.loadUDs({
                  pubkey: pubkey,
                  fromTime: fromTime
                })
                  .then(function(res) {
                    if (!res || !res.length) return;
                    _.forEach(res, function(hits) {
                      tx.history.push(hits);
                    });
                  })

                  .catch(function(err) {
                    console.debug('Error while loading UDs history, on extension point.');
                    console.error(err);
                  })
                );
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
              const firstValidatedTxIndex = tx.history.findIndex((tx) => {
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
      },

      powBase = function(amount, base) {
        return base <= 0 ? amount : amount * Math.pow(10, base);
      },

      addSource = function(src, sources, sourcesIndexByKey) {
        var srcKey = src.type+':'+src.identifier+':'+src.noffset;
        if (angular.isUndefined(sourcesIndexByKey[srcKey])) {
          sources.push(src);
          sourcesIndexByKey[srcKey] = sources.length - 1;
        }
      },

      addSources = function(result, sources) {
        _(sources).forEach(function(src) {
          addSource(src, result.sources, result.sourcesIndexByKey);
        });
      },

      loadSourcesAndBalance = function(pubkey) {
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
      },

      loadData = function(pubkey, fromTime) {
        var now = Date.now();

        return $q.all([

            // Load Sources
            loadSourcesAndBalance(pubkey),

            // Load Tx
            loadTx(pubkey, fromTime)
          ])

          .then(function(res) {
            // Copy sources and balance
            var data = res[0];
            data.tx = res[1];

            var txPendings = [];
            var txErrors = [];
            var balanceFromSource = data.balance;
            var balanceWithPending = data.balance;

            function _processPendingTx(tx) {
              var consumedSources = [];
              var valid = true;
              if (tx.amount > 0) { // do not check sources from received TX
                valid = false;
                // TODO get sources from the issuer ?
              }
              else {
                _.find(tx.inputs, function(input) {
                  var inputKey = input.split(':').slice(2).join(':');
                  var srcIndex = data.sourcesIndexByKey[inputKey];
                  if (angular.isDefined(srcIndex)) {
                    consumedSources.push(data.sources[srcIndex]);
                  }
                  else {
                    valid = false;
                    return true; // break
                  }
                });
                if (tx.sources) { // add source output
                  addSources(data, tx.sources);
                }
                delete tx.sources;
                delete tx.inputs;
              }
              if (valid) {
                balanceWithPending += tx.amount; // update balance
                txPendings.push(tx);
                _.forEach(consumedSources, function(src) {
                  src.consumed=true;
                });
              }
              else {
                txErrors.push(tx);
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
                console.debug('[tx] TX and sources loaded in '+ (Date.now()-now) +'ms');
                return data;
              });
          })
          .catch(function(err) {
            console.warn("[tx] Error while getting sources and tx...", err);
            throw err;
          });
    },

    loadSources = function(pubkey) {
      console.debug("[tx] Loading sources for " + pubkey.substring(0,8));
      return loadData(pubkey, 'pending');
    };

    // Download TX history file
    downloadHistoryFile = function(pubkey, options) {

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
                  ].join(';') + '\n');
              }, [headers.join(';') + '\n']);

              var file = new Blob(content, {type: 'text/plain; charset=utf-8'});
              FileSaver.saveAs(file, filename);
            });
        });
    };

    // Register extension points
    api.registerEvent('data', 'loadUDs');

    return {
      id: id,
      load: loadData,
      loadSources: loadSources,
      downloadHistoryFile: downloadHistoryFile,
      // api extension
      api: api
    };
  }

  var service = new CsTx('default');

  service.instance = function(id, bma) {
    return new CsTx(id, bma);
  };
  return service;
});
