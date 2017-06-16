
angular.module('cesium.tx.services', ['ngApi', 'cesium.bma.services',
  'cesium.settings.services', 'cesium.wot.services' ])

.factory('csTx', function($q, $timeout, $filter, $translate, BMA, Api, csConfig, csSettings, csWot, FileSaver) {
  'ngInject';

  function factory(id, BMA) {

    var
      api = new Api(this, "csTx-" + id),

      _reduceTxAndPush = function(pubkey, txArray, result, processedTxMap, allowPendings) {
        if (!txArray || txArray.length === 0) {
          return;
        }

        _.forEach(txArray, function(tx) {
          if (tx.block_number || allowPendings) {
            var walletIsIssuer = false;
            var otherIssuer = tx.issuers.reduce(function(issuer, res) {
              walletIsIssuer = (res === pubkey) ? true : walletIsIssuer;
              return issuer + ((res !== pubkey) ? ', ' + res : '');
            }, '');
            if (otherIssuer.length > 0) {
              otherIssuer = otherIssuer.substring(2);
            }
            var otherReceiver;
            var outputBase;
            var sources = [];
            var lockedOutputs;
            var amount = tx.outputs.reduce(function(sum, output, noffset) {
              var outputArray = output.split(':',3);
              outputBase = parseInt(outputArray[1]);
              var outputAmount = powBase(parseInt(outputArray[0]), outputBase);
              var outputCondition = outputArray[2];
              var sigMatches =  BMA.regexp.TX_OUTPUT_SIG.exec(outputCondition);

              // Simple unlock condition
              if (sigMatches) {
                var outputPubkey = sigMatches[1];
                if (outputPubkey == pubkey) { // output is for the wallet
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
                      consumed: false
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
              else if (outputCondition.indexOf('SIG('+pubkey+')') != -1) {
                var lockedOutput = BMA.tx.parseUnlockCondition(outputCondition);
                if (lockedOutput) {
                  // Add a source
                  // FIXME: should be uncomment when filtering source on transfer()
                  /*sources.push(angular.merge({
                   amount: parseInt(outputArray[0]),
                   base: outputBase,
                   type: 'T',
                   identifier: tx.hash,
                   noffset: noffset,
                   consumed: false
                   }, lockedOutput));
                   */
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
            if (!processedTxMap[txKey] && amount !== 0) {
              processedTxMap[txKey] = true;
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

      loadTx = function(pubkey, fromTime, existingPendings) {
        return $q(function(resolve, reject) {
          var txHistory = [];
          var udHistory = [];
          var txPendings = [];

          var nowInSec = Math.trunc(new Date().getTime() / 1000); // TODO test to replace using moment().utc().unix()
          fromTime = fromTime || (nowInSec - csSettings.data.walletHistoryTimeSecond);
          var processedTxMap = {};
          var tx = {
            pendings: []
          };

          var _reduceTx = function(res){
            _reduceTxAndPush(pubkey, res.history.sent, txHistory, processedTxMap);
            _reduceTxAndPush(pubkey, res.history.received, txHistory, processedTxMap);
            _reduceTxAndPush(pubkey, res.history.sending, txHistory, processedTxMap);
            _reduceTxAndPush(pubkey, res.history.pending, txPendings, processedTxMap, true /*allow pendings*/);
          };

          var jobs = [
            // get pendings history
            BMA.tx.history.pending({pubkey: pubkey})
              .then(_reduceTx)
          ];

          // get TX history since
          if (fromTime !== -1) {
            var sliceTime = csSettings.data.walletHistorySliceSecond;
            for(var i = fromTime - (fromTime % sliceTime); i - sliceTime < nowInSec; i += sliceTime)  {
              jobs.push(BMA.tx.history.times({pubkey: pubkey, from: i, to: i+sliceTime-1})
                .then(_reduceTx)
              );
            }

            jobs.push(BMA.tx.history.timesNoCache({pubkey: pubkey, from: nowInSec - (nowInSec % sliceTime), to: nowInSec+999999999})
              .then(_reduceTx));
          }

          // get all TX
          else {
            jobs.push(BMA.tx.history.all({pubkey: pubkey})
              .then(_reduceTx)
            );
          }

          // get UD history
          // FIXME issue#232
          /*
          if (csSettings.data.showUDHistory) {
            jobs.push(
              BMA.ud.history({pubkey: pubkey})
                .then(function(res){
                  udHistory = !res.history || !res.history.history ? [] :
                    res.history.history.reduce(function(res, ud){
                      if (ud.time < fromTime) return res; // skip to old UD
                      var amount = powBase(ud.amount, ud.base);
                      return res.concat({
                        time: ud.time,
                        amount: amount,
                        isUD: true,
                        block_number: ud.block_number
                      });
                    }, []);
                }));
          }
          */

          // Execute jobs
          $q.all(jobs)
            .then(function(){
              // sort by time desc
              tx.history  = txHistory.concat(udHistory).sort(function(tx1, tx2) {
                return (tx2.time - tx1.time);
              });
              tx.pendings = txPendings;

              tx.fromTime = fromTime;
              tx.toTime = tx.history.length ? tx.history[0].time /*=max(tx.time)*/: fromTime;


              resolve(tx);
            })
            .catch(function(err) {
              tx.history = [];
              tx.pendings = [];
              tx.errors = [];
              delete tx.fromTime;
              delete tx.toTime;
              reject(err);
            });
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
            var result = {
              sources: [],
              sourcesIndexByKey: [],
              balance: 0
            };
            if (res.sources && res.sources.length) {
              _.forEach(res.sources, function(src) {
                src.consumed = false;
                result.balance += powBase(src.amount, src.base);
              });
              addSources(result, res.sources);
            }
            return result;
          });
      },

      loadData = function(pubkey, fromTime) {
        var now = new Date().getTime();

        var data = {};
        return $q.all([
            // Load Sources
            loadSourcesAndBalance(pubkey),

            // Load Tx
            loadTx(pubkey, fromTime)
          ])

          .then(function(res) {
            angular.merge(data, res[0]);
            data.tx = res[1];

            var txPendings = [];
            var txErrors = [];
            var balance = data.balance;

            function _processPendingTx(tx) {
              var consumedSources = [];
              var valid = true;
              if (tx.amount > 0) { // do not check sources from received TX
                valid = false;
                // TODO get sources from the issuer ?
              }
              else {
                _.forEach(tx.inputs, function(input) {
                  var inputKey = input.split(':').slice(2).join(':');
                  var srcIndex = data.sourcesIndexByKey[inputKey];
                  if (angular.isDefined(srcIndex)) {
                    consumedSources.push(data.sources[srcIndex]);
                  }
                  else {
                    valid = false;
                    return false; // break
                  }
                });
                if (tx.sources) { // add source output
                  addSources(data, tx.sources);
                }
                delete tx.sources;
                delete tx.inputs;
              }
              if (valid) {
                balance += tx.amount; // update balance
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
            while(txs && txs.length > 0) {
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

            data.tx.pendings = txPendings;
            data.tx.errors = txErrors;
            data.balance = balance;

            // Will add uid (+ plugin will add name, avatar, etc. if enable)
            return csWot.extendAll((data.tx.history || []).concat(data.tx.pendings||[]), 'pubkey');
          })
          .then(function() {
            console.debug('[tx] TX and sources loaded in '+ (new Date().getTime()-now) +'ms');
            return data;
          });
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
          'ACCOUNT.HEADERS.AMOUNT',
          'ACCOUNT.HEADERS.COMMENT']),
        //TODO : Utiliser plutôt csCurency pour avoir le bloc courant
        BMA.blockchain.current(),
        loadData(pubkey, options.fromTime)
      ])
        .then(function(result){

          var translations = result[0];

          var currentBlock = result[1];
          var currentTime = (currentBlock && currentBlock.medianTime) || moment().utc().unix();
          var currency = currentBlock && currentBlock.currency;

          result = result[2];

          if (!result || !result.tx || !result.tx.history) return; // no TX

          var formatDecimal = $filter('formatDecimal');
          var formatPubkey = $filter('formatPubkey');
          var formatDate = $filter('formatDate');
          var formatDateForFile = $filter('formatDateForFile');
          var formatSymbol = $filter('currencySymbolNoHtml');

          var headers = [
            translations['ACCOUNT.HEADERS.TIME'],
            translations['COMMON.UID'],
            translations['COMMON.PUBKEY'],
            translations['ACCOUNT.HEADERS.AMOUNT'] + ' (' + formatSymbol(currency) + ')',
            translations['ACCOUNT.HEADERS.COMMENT']
          ];
          var content = result.tx.history.reduce(function(res, tx){
            return res.concat([
                formatDate(tx.time),
                tx.uid,
                tx.pubkey,
                formatDecimal(tx.amount/100),
                '"' + tx.comment + '"'
              ].join(';') + '\n');
          }, [headers.join(';') + '\n']);

          var file = new Blob(content, {type: 'text/plain; charset=utf-8'});
          $translate('ACCOUNT.FILE_NAME', {currency: currency, pubkey: pubkey, currentTime : currentTime})
            .then(function(result){
              FileSaver.saveAs(file, result);
            })
        });
    };


    return {
      id: id,
      load: loadData,
      downloadHistoryFile: downloadHistoryFile,
      // api extension
      api: api
    };
  }

  var service = factory('default', BMA);

  service.instance = factory;
  return service;
});
