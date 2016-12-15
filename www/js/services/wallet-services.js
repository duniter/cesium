
angular.module('cesium.wallet.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('csWallet', function($q, $rootScope, $timeout, $translate, $filter, Api, localStorage, CryptoUtils, BMA, csSettings) {
  'ngInject';

  factory = function(id) {

    var
    constants = {
      STORAGE_KEY: "CESIUM_DATA"
    },
    data = {},

    api = new Api(this, 'csWallet-' + id),

    resetData = function(init) {
      data.pubkey= null;
      data.keypair = {
          signSk: null,
          signPk: null
        };
      data.uid = null;
      data.balance = 0;
      data.sources = null;
      data.sourcesIndexByKey = null;
      data.currency= null;
      data.parameters = null;
      data.currentUD = null;
      data.medianTime = null;
      data.tx = data.tx || {};
      data.tx.history = [];
      data.tx.pendings = [];
      data.tx.errors = [];
      data.requirements = {};
      data.blockUid = null;
      data.sigDate = null;
      data.isMember = false;
      data.events = [];
      data.loaded = false;
      if (init) {
        api.data.raise.init(data);
      }
      else {
        if (!csSettings.data.useLocalStorage) {
          csSettings.reset();
        }
        api.data.raise.reset(data);
      }
    },

    reduceTxAndPush = function(txArray, result, processedTxMap, excludePending) {
      if (!txArray || txArray.length === 0) {
        return;
      }
      var txPendingsTimeByKey = excludePending ? [] : data.tx.pendings.reduce(function(res, tx) {
        if (tx.time) {
          res[tx.amount+':'+tx.hash] = tx.time;
        }
        return res;
      }, []);

      _.forEach(txArray, function(tx) {
        if (!excludePending || tx.block_number !== null) {
          var walletIsIssuer = false;
          var otherIssuer = tx.issuers.reduce(function(issuer, res, index) {
              walletIsIssuer = (res === data.pubkey) ? true : walletIsIssuer;
              return issuer + ((res !== data.pubkey) ? ', ' + res : '');
          }, '');
          if (otherIssuer.length > 0) {
            otherIssuer = otherIssuer.substring(2);
          }
          var otherReceiver;
          var outputBase;
          var sources;
          var amount = tx.outputs.reduce(function(sum, output, noffset) {
              var outputArray = output.split(':',3);
              outputBase = parseInt(outputArray[1]);
              var outputAmount = powBase(parseInt(outputArray[0]), outputBase);
              var outputCondArray = outputArray[2].split('(', 3);
              var outputPubkey = (outputCondArray.length == 2 && outputCondArray[0] == 'SIG') ?
                   outputCondArray[1].substring(0,outputCondArray[1].length-1) : '';
              if (outputPubkey == data.pubkey) { // output is for the wallet
                if (!walletIsIssuer) {
                  return sum + outputAmount;
                }
                // If pending: use output as new sources
                else if (!excludePending && tx.block_number === null){
                  sources = sources || [];
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
              return sum;
            }, 0);

          var pubkey = amount > 0 ? otherIssuer : otherReceiver;
          var time = tx.time;
          if (tx.block_number === null) {
            time = tx.blockstampTime || txPendingsTimeByKey[amount + ':' + tx.hash];
          }

          // Avoid duplicated tx, or tx to him self
          var txKey = amount + ':' + tx.hash + ':' + time;
          if (!processedTxMap[txKey] && amount !== 0) {
            processedTxMap[txKey] = true;
            result.push({
               time: time,
               amount: amount,
               pubkey: pubkey,
               comment: tx.comment,
               isUD: false,
               hash: tx.hash,
               locktime: tx.locktime,
               block_number: tx.block_number,
               inputs: (tx.block_number === null ? tx.inputs.slice(0) : null),
               sources: sources
            });
          }
        }
      });
    },

    resetSources = function(){
      data.sources = [];
      data.sourcesIndexByKey = {};
    },

    addSource = function(src, sources, sourcesIndexByKey) {
      var srcKey = src.type+':'+src.identifier+':'+src.noffset;
      if (angular.isUndefined(sourcesIndexByKey[srcKey])) {
        sources.push(src);
        sourcesIndexByKey[srcKey] = sources.length - 1;
      }
    },

    addSources = function(sources) {
      _(sources).forEach(function(src) {
        addSource(src, data.sources, data.sourcesIndexByKey);
      });
    },

    login = function(salt, password) {
      return CryptoUtils.connect(salt, password)
        .then(function(keypair) {
          // Copy result to properties
          data.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
          data.keypair = keypair;

          // Call extend api
          return api.data.raisePromise.login(data);
        })
        // store if need
        .then(function() {
          if (csSettings.data.useLocalStorage) {
            store();
          }
          return data;
        });
    },

    logout = function() {
      return $q(function(resolve, reject) {

        resetData(); // will reset keypair
        store(); // store (if local storage enable)

        // Send logout event
        api.data.raise.logout();

        resolve();
      });
    },

    isLogin = function() {
      return !!data.pubkey;
    },

    isNeverUsed = function() {
      return !data.pubkey ||
        (!data.isMember &&
        (!data.requirements || !data.requirements.pendingMembership) &&
         !data.tx.history.length &&
         !data.tx.pendings.length);
    },

    // If connected and same pubkey
    isUserPubkey = function(pubkey) {
      return isLogin() && data.pubkey === pubkey;
    },

    store = function() {
      if (csSettings.data.useLocalStorage) {

        if (isLogin() && csSettings.data.rememberMe) {
          var dataToStore = {
            keypair: data.keypair,
            pubkey: data.pubkey
          };

          if (data.tx && data.tx.pendings && data.tx.pendings.length>0) {
            var pendings = data.tx.pendings.reduce(function(res, tx){
              return tx.time ? res.concat({
                amount: tx.amount,
                time: tx.time,
                hash: tx.hash
              }) : res;
            }, []);
            if (pendings.length) {
              dataToStore.tx = {
                pendings: pendings
              };
            }
          }

          localStorage.setObject(constants.STORAGE_KEY, dataToStore);
        }
        else {
          localStorage.setObject(constants.STORAGE_KEY, null);
        }
      }
      else {
        localStorage.setObject(constants.STORAGE_KEY, null);
      }
    },

    restore = function() {
      return $q(function(resolve, reject){
        var dataStr = localStorage.get(constants.STORAGE_KEY);
        if (!dataStr) {
          resolve();
          return;
        }
        fromJson(dataStr, false)
        .then(function(storedData){
          if (storedData && storedData.keypair && storedData.pubkey) {
            data.keypair = storedData.keypair;
            data.pubkey = storedData.pubkey;
            if (storedData.tx && storedData.tx.pendings) {
              data.tx.pendings = storedData.tx.pendings;
            }
            data.loaded = false;

            return $q.all([
              // Call extend api
              api.data.raisePromise.login(data),

              // Load parameters
              // This prevent timeout error, when loading a market record after a browser refresh (e.g. F5)
              loadParameters(),

              // Load current UD is need by features tour
              loadCurrentUD()
            ]);
          }
          else {
            // Load parameters
            // This prevent timeout error, when loading a market record after a browser refresh (e.g. F5)
            return loadParameters();
          }
        })
        .then(function(){
          resolve(data);
        })
        .catch(function(err){reject(err);});
      });
    },

    getData = function() {
      return data;
    },

    resetRequirements = function() {
      data.requirements = {
        needSelf: true,
        needMembership: true,
        canMembershipOut: false,
        needRenew: false,
        pendingMembership: false,
        certificationCount: 0,
        needCertifications: false,
        needCertificationCount: 0,
        willNeedCertificationCount: 0
      };
      data.blockUid = null;
      data.isMember = false;
      data.sigDate = null;
      data.events = data.events.reduce(function(res, event) {
        if (event.message.startsWith('ACCOUNT.')) return res;
        return res.concat(event);
      },[]);
    },

    loadRequirements = function() {
      return $q(function(resolve, reject) {
        // Get requirements
        BMA.wot.requirements({pubkey: data.pubkey})
        .then(function(res){
          if (!res.identities || res.identities.length === 0) {
            resetRequirements();
            resolve();
            return;
          }
          if (res.identities.length > 0) {
            res.identities = _.sortBy(res.identities, function(idty) {
                  var score = 1;
                  score += (100000000000 * ((!data.uid && idty.uid === data.uid) ? 1 : 0));
                  score += (1000000      * idty.membershipExpiresIn);
                  score += (10           * idty.membershipPendingExpiresIn);
                  return -score;
                });
          }
          var idty = res.identities[0];
          data.requirements = idty;
          data.uid = idty.uid;
          data.blockUid = idty.meta.timestamp;
          // Add useful custom fields
          data.requirements.needSelf = false;
          data.requirements.needMembership = (data.requirements.membershipExpiresIn <= 0 &&
                                              data.requirements.membershipPendingExpiresIn <= 0 );
          data.requirements.needRenew = (!data.requirements.needMembership &&
                                         data.requirements.membershipExpiresIn <= csSettings.data.timeWarningExpireMembership &&
                                         data.requirements.membershipPendingExpiresIn <= 0);
          data.requirements.canMembershipOut = (data.requirements.membershipExpiresIn > 0);
          data.requirements.pendingMembership = (data.requirements.membershipPendingExpiresIn > 0);
          data.requirements.certificationCount = (idty.certifications) ? idty.certifications.length : 0;
          data.requirements.willExpireCertificationCount = idty.certifications ? idty.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= csSettings.data.timeWarningExpire) {
              return count + 1;
            }
            return count;
          }, 0) : 0;
          data.isMember = (data.requirements.membershipExpiresIn > 0);

          var blockParts = idty.meta.timestamp.split('-', 2);
          var blockNumber = parseInt(blockParts[0]);
          var blockHash = blockParts[1];
          // Retrieve registration date
          return BMA.blockchain.block({block: blockNumber})
            .then(function(block) {
              data.sigDate = block.time;

              // Check if self has been done on a valid block
              if (!data.isMember && blockNumber !== 0 && blockHash !== block.hash) {
                addEvent({type: 'error', message: 'ERROR.WALLET_INVALID_BLOCK_HASH'});
                console.debug("Invalid membership for uid={0}: block hash changed".format(data.uid));
              }
              resolve();
            })
            .catch(function(err){
              // Special case for currency init (root block not exists): use now
              if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && blockParts.number === '0') {
                data.sigDate = Math.trunc(new Date().getTime() / 1000);
                resolve();
              }
              else {
                reject(err);
              }
            });
        })
        .catch(function(err) {
          resetRequirements();
          // If not a member: continue
          if (!!err &&
              (err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER ||
               err.ucode == BMA.errorCodes.NO_IDTY_MATCHING_PUB_OR_UID)) {
            resolve();
          }
          else {
            reject(err);
          }
        });
      });
    },

    loadSources = function() {
      return $q(function(resolve, reject) {
        // Get transactions
        BMA.tx.sources({pubkey: data.pubkey})
        .then(function(res){
          resetSources();
          var balance = 0;
          if (res.sources) {
            _.forEach(res.sources, function(src) {
              src.consumed = false;
              balance += powBase(src.amount, src.base);
            });
            addSources(res.sources);
          }
          data.balance = balance;
          resolve();
        })
        .catch(function(err) {
          resetSources();
          reject(err);
        });
      });
    },

    loadTransactions = function(fromTime) {
      return $q(function(resolve, reject) {
        var txHistory = [];
        var udHistory = [];
        var txPendings = [];

        var now = new Date().getTime();
        var nowInSec = Math.trunc(now / 1000);
        fromTime = fromTime || (nowInSec - csSettings.data.walletHistoryTimeSecond);
        var processedTxMap = {};

        var reduceTx = function(res){
          reduceTxAndPush(res.history.sent, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.received, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.sending, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.pending, txPendings, processedTxMap, false/*include pending*/);
        };

        var jobs = [
          // get pendings history
          BMA.tx.history.pending({pubkey: data.pubkey})
            .then(reduceTx)
        ];

        // get TX history since
        if (fromTime !== -1) {
          var sliceTime = csSettings.data.walletHistorySliceSecond;
          for(var i = fromTime - (fromTime % sliceTime); i - sliceTime < nowInSec; i += sliceTime)  {
            jobs.push(BMA.tx.history.times({pubkey: data.pubkey, from: i, to: i+sliceTime-1})
              .then(reduceTx)
            );
          }

          jobs.push(BMA.tx.history.timesNoCache({pubkey: data.pubkey, from: nowInSec - (nowInSec % sliceTime), to: nowInSec+999999999})
            .then(reduceTx));
        }

        // get all TX
        else {
          jobs.push(BMA.tx.history.all({pubkey: data.pubkey})
            .then(reduceTx)
          );
        }

        // get UD history
        if (csSettings.data.showUDHistory) {
          jobs.push(
            BMA.ud.history({pubkey: data.pubkey})
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

        // Execute jobs
        $q.all(jobs)
        .then(function(){
          // sort by time desc
          data.tx.history  = txHistory.concat(udHistory).sort(function(tx1, tx2) {
             return (tx2.time - tx1.time);
          });
          data.tx.pendings = txPendings;
          data.tx.fromTime = fromTime;
          data.tx.toTime = data.tx.history.length ? data.tx.history[0].time /*=max(tx.time)*/: fromTime;
          console.debug('[wallet] TX history loaded in '+ (new Date().getTime()-now) +'ms');
          resolve();
        })
        .catch(function(err) {
          data.tx.history = [];
          data.tx.pendings = [];
          data.tx.errors = [];
          delete data.tx.fromTime;
          delete data.tx.toTime;
          reject(err);
        });
      });
    },

    processTransactionsAndSources = function() {
      return BMA.wot.member.uids()
        .then(function(uids){
          var txPendings = [];
          var txErrors = [];
          var balance = data.balance;

          // process TX history
          _.forEach(data.tx.history, function(tx) {
             tx.uid = uids[tx.pubkey] || null;
          });

          var processPendingTx = function(tx) {
            tx.uid = uids[tx.pubkey] || null;

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
                addSources(tx.sources);
                delete tx.sources;
              }
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
          };

          var txs = data.tx.pendings;
          var retry = true;
          while(txs && txs.length > 0) {
            // process TX pendings
            _.forEach(txs, processPendingTx);

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
        });
    },

    loadParameters = function() {
      return $q(function(resolve, reject) {
        if (data.parameters && data.currency) {
          resolve();
          return;
        }
        BMA.blockchain.parameters()
        .then(function(json){
          data.currency = json.currency;
          data.parameters = json;
          resolve();
        })
        .catch(function(err) {
          data.currency = null;
          data.parameters = null;
          reject(err);
        });
      });
    },

    loadCurrentUD = function() {
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
    },

    // Must be call after loadParameters() and loadRequirements()
    finishLoadRequirements = function() {
      data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.parameters.sigQty)) ?
          (data.parameters.sigQty - data.requirements.certificationCount) : 0;
      data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
          data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < data.parameters.sigQty) ?
          (data.parameters.sigQty - data.requirements.certificationCount - willExpireCertificationCount) : 0;

      // Add user events
      data.events = data.events.reduce(function(res, event) {
        if (event.message.startsWith('ACCOUNT.')) return res;
        return res.concat(event);
      },[]);
      if (data.requirements.pendingMembership) {
        data.events.push({type:'pending',message: 'ACCOUNT.WAITING_MEMBERSHIP'});
      }
      if (data.requirements.needCertificationCount > 0) {
        data.events.push({type:'warn', message: 'ACCOUNT.WAITING_CERTIFICATIONS', messageParams: data.requirements});
      }
      if (data.requirements.willNeedCertificationCount > 0) {
        data.events.push({type:'warn', message: 'ACCOUNT.WILL_MISSING_CERTIFICATIONS', messageParams: data.requirements});
      }
      if (data.requirements.needRenew) {
        data.events.push({type:'warn', message: 'ACCOUNT.WILL_NEED_RENEW_MEMBERSHIP', messageParams: data.requirements});
      }
    },

    loadSigStock = function() {
      return $q(function(resolve, reject) {
        // Get certified by, then count written certification
        BMA.wot.certifiedBy({pubkey: data.pubkey})
          .then(function(res){
            data.sigStock = !res.certifications ? 0 : res.certifications.reduce(function(res, cert) {
              return cert.written === null ? res : res+1;
            }, 0);
            resolve();
          })
          .catch(function(err) {
            if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) {
              data.sigStock = 0;
              resolve(); // not found
            }
            else {
              reject(err);
            }
          });
      });
    },

    loadData = function(options) {
      if (data.loaded) {
        return refreshData(options);
      }

      return $q(function(resolve, reject){
        data.loaded = false;

        $q.all([

          // Get currency parameters
          loadParameters(),

          // Get current UD
          loadCurrentUD(),

          // Get requirements
          loadRequirements(),

          // Get sources
          loadSources(),

          // Get transactions
          loadTransactions(),

          // Load sigStock
          loadSigStock(),

          // API extension
          api.data.raisePromise.load(data, null)
            .catch(function(err) {
              console.debug('Error while loading wallet data, on extension point.');
              console.error(err);
            })
        ])
        .then(function() {
          // Process transactions and sources
          processTransactionsAndSources()
          .then(function() {
            finishLoadRequirements(); // must be call after loadParameters() and loadRequirements()

            api.data.raisePromise.finishLoad(data)
              .then(function() {
                data.loaded = true;
                resolve(data);
              });
          })
          .catch(function(err) {
            data.loaded = false;
            reject(err);
          });
        })
        .catch(function(err) {
          data.loaded = false;
          reject(err);
        });
      });
    },

    refreshData = function(options) {
      if (!options) {
        options = {
          currentUd: true,
          requirements: true,
          sources: true,
          tx: {
            enable: true,
            fromTime: data.tx ? data.tx.fromTime : undefined // keep previous time
          },
          sigStock: true,
          api: true
        };
      }

      var jobs = [];

      // Reset events
      data.events = [];

      // Get current UD
      if (options.currentUd) jobs.push(loadCurrentUD());

      // Get requirements
      if (options.requirements) {
        jobs.push(loadRequirements()
          .then(function() {
            finishLoadRequirements();
          }));
      }

      if (options.sources || (options.tx && options.tx.enable)) {
        // Get sources
        jobs.push(loadSources());

        // Get transactions
        jobs.push(loadTransactions(options.tx.fromTime));
      }

      // Load sigStock
      if (options.sigStock) jobs.push(loadSigStock());

      // API extension (force if no other jobs)
      if (!jobs.length || options.api) jobs.push(api.data.raisePromise.load(data, options));

      return $q.all(jobs)
      .then(function() {
        if (options.sources || (options.tx && options.tx.enable)) {
          // Process transactions and sources
          return processTransactionsAndSources();
        }
      })
      .then(function(){
        return api.data.raisePromise.finishLoad(data);
      })
      .then(function(){
        return data;
      });
    },

    isBase = function(amount, base) {
      if (!base) return true; // no base
      if (amount < Math.pow(10, base)) return false; // too small
      var rest = '00000000' + amount;
      var lastDigits = parseInt(rest.substring(rest.length-base));
      return lastDigits === 0; // no rest
    },

    truncBase = function(amount, base) {
      var pow = Math.pow(10, base);
      if (amount < pow) return pow; // min value = 1*10^base
      return Math.trunc(amount / pow ) * pow;
    },

    powBase = function(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    },

    getInputs = function(amount, outputBase, filterBase) {
      if (angular.isUndefined(filterBase)) {
        filterBase = outputBase;
      }
      var sourcesAmount = 0;
      var sources = [];
      var minBase = filterBase;
      var maxBase = filterBase;
      _.find(data.sources, function(source) {
        if (!source.consumed && source.base == filterBase){
          sourcesAmount += powBase(source.amount, source.base);
          sources.push(source);
        }
        // Stop if enough sources
        return (sourcesAmount >= amount);
      });

      // IF not enough sources, get add inputs from lower base (recursively)
      if (sourcesAmount < amount && filterBase > 0) {
        filterBase -= 1;
        var missingAmount = amount - sourcesAmount;
        var lowerInputs = getInputs(missingAmount, outputBase, filterBase);

        // Add lower base inputs to result
        if (lowerInputs.amount > 0) {
          minBase = lowerInputs.minBase;
          sourcesAmount += lowerInputs.amount;
          [].push.apply(sources, lowerInputs.sources);
        }
      }

      return {
        minBase: minBase,
        maxBase: maxBase,
        amount: sourcesAmount,
        sources: sources
      };
    },

    /**
    * Send a new transaction
    */
    transfer = function(destPub, amount, comments, useRelative) {
      return $q(function(resolve, reject) {
        BMA.blockchain.current(true/*cache*/)
        .then(function(block) {
          if (!BMA.regex.PUBKEY.test(destPub)){
            reject({message:'ERROR.INVALID_PUBKEY'}); return;
          }
          if (!BMA.regex.COMMENT.test(comments)){
            reject({message:'ERROR.INVALID_COMMENT'}); return;
          }
          if (!isLogin()){
            reject({message:'ERROR.NEED_LOGIN_FIRST'}); return;
          }
          if (!amount) {
            reject({message:'ERROR.AMOUNT_REQUIRED'}); return;
          }
          if (amount <= 0) {
            reject({message:'ERROR.AMOUNT_NEGATIVE'}); return;
          }
          amount = Math.floor(amount); // remove decimals

          var inputs = {
            amount: 0,
            minBase: block.unitbase,
            maxBase: block.unitbase + 1,
            sources : []
          };

          // Get inputs, starting to use current base sources
          var amountBase = 0;
          while (inputs.amount < amount && amountBase <= block.unitbase) {
            inputs = getInputs(amount, block.unitbase);

            if (inputs.amount < amount) {
              // try to reduce amount (replace last digits to zero)
              amountBase++;
              if (amountBase <= block.unitbase) {
                amount = truncBase(amount, amountBase);
              }
            }
          }

          if (inputs.amount < amount) {
            if (data.balance < amount) {
              reject({message:'ERROR.NOT_ENOUGH_CREDIT'}); return;
            }
            else if (inputs.amount === 0) {
              reject({message:'ERROR.ALL_SOURCES_USED'}); return;
            }
            else {
              $translate('COMMON.UD')
              .then(function(UD) {
                var params;
                if(useRelative) {
                  params = {
                    amount: ($filter('formatDecimal')(inputs.amount / data.currentUD)),
                    unit: UD,
                    subUnit: $filter('abbreviate')(data.currency)
                  };
                }
                else {
                  params = {
                    amount: ($filter('formatInteger')(inputs.amount)),
                    unit: $filter('abbreviate')(data.currency),
                    subUnit: ''
                  };
                }
                $translate('ERROR.NOT_ENOUGH_SOURCES', params)
                .then(function(message) {
                  reject({message: message});
                });
              });
            }
            return;
          }
          // Avoid to get outputs on lower base
          if (amountBase < inputs.minBase && !isBase(amount, inputs.minBase)) {
            amount = truncBase(amount, inputs.minBase);
            console.debug("[wallet] Amount has been truncate to " + amount);
          }
          else if (amountBase > 0) {
            console.debug("[wallet] Amount has been truncate to " + amount);
          }

          // Send tx
          createAndSendTx(block, destPub, amount, inputs, comments)
            .then(function(res) {
              data.balance -= amount;
              _.forEach(inputs.sources, function(source) {
                source.consumed=true;
              });

              // Add new sources
              if (res && res.sources.length) {
                addSources(res.sources);
              }

              // Add TX to pendings
              BMA.wot.member.get(destPub)
                .then(function(member) {
                  data.tx.pendings.unshift({
                    time: (Math.floor(moment().utc().valueOf() / 1000)),
                    amount: -amount,
                    pubkey: destPub,
                    uid: member ? member.uid : null,
                    comment: comments,
                    isUD: false,
                    hash: res.hash,
                    locktime: 0,
                    block_number: null
                  });
                  store(); // save pendings in local storage
                  resolve();
                }).catch(function(err){reject(err);});
            }).catch(function(err){reject(err);});
        });
      });
    },

    /**
     * Create TX doc and send it
     * @param block the current block
     * @param destPub
     * @param amount
     * @param inputs
     * @param comments
     * @return the hash of the sent TX
     */
    createAndSendTx = function(block, destPub, amount, inputs, comments) {

      // Make sure a TX in compact mode has no more than 100 lines (fix #118)
      if (inputs.sources.length > 40) {
        console.debug("[Wallet] TX has to many sources. Will chain TX...");

        var firstSlice = {
          minBase: block.unitbase,
          maxBase: 0,
          amount: 0,
          sources: inputs.sources.slice(0, 39)
        };
        _.forEach(firstSlice.sources, function(source) {
          if (source.base < minBase) firstSlice.minBase = source.base;
            if (source.base > maxBase) firstSlice.maxBase = source.base;
          firstSlice.amount += source.amount;
        });

        // Send inputs first slice
        return createAndSendTx(block, data.pubkey/*to himself*/, firstSlice.amount, firstSlice) // comment ot need
          .then(function(res) {
            _.forEach(firstSlice.sources, function(source) {
              source.consumed=true;
            });
            data.sources.push(res.sources);

            var secondSlice = {
              minBase: block.unitbase,
              maxBase: 0,
              amount: 0,
              sources: inputs.sources.slice(40).concat(res.sources)
            };
            _.forEach(secondSlice.sources, function(source) {
              if (source.base < minBase) secondSlice.minBase = source.base;
              if (source.base > maxBase) secondSlice.maxBase = source.base;
              secondSlice.amount += source.amount;
            });

            // Send inputs second slice (recursive call)
            return createAndSendTx(block, destPub, amount, secondSlice, comments);
          });
      }

      var tx = 'Version: 3\n' +
        'Type: Transaction\n' +
        'Currency: ' + data.currency + '\n' +
        'Blockstamp: ' + block.number + '-' + block.hash + '\n' +
        'Locktime: 0\n' + // no lock
        'Issuers:\n' +
        data.pubkey + '\n' +
        'Inputs:\n';

      _.forEach(inputs.sources, function(source) {
        // if D : AMOUNT:BASE:D:PUBLIC_KEY:BLOCK_ID
        // if T : AMOUNT:BASE:T:T_HASH:T_INDEX
        tx += [source.amount, source.base, source.type, source.identifier,source.noffset].join(':')+"\n";
      });

      tx += 'Unlocks:\n';
      for (i=0; i<inputs.sources.length; i++) {
        // INPUT_INDEX:UNLOCK_CONDITION
        tx += i + ':SIG(0)\n';
      }

      tx += 'Outputs:\n';
      // AMOUNT:BASE:CONDITIONS
      var rest = amount;
      var outputBase = inputs.maxBase;
      var outputAmount;
      var outputOffset = 0;
      while(rest > 0) {
        outputAmount = truncBase(rest, outputBase);
        rest -= outputAmount;
        if (outputAmount > 0) {
          outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
          tx += outputAmount + ':' + outputBase + ':SIG(' + destPub + ')\n';
          outputOffset++;
        }
        outputBase--;
      }
      rest = inputs.amount - amount;
      outputBase = inputs.maxBase;
      var sources = [];
      while(rest > 0) {
        outputAmount = truncBase(rest, outputBase);
        rest -= outputAmount;
        if (outputAmount > 0) {
          outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
          tx += outputAmount +':'+outputBase+':SIG('+data.pubkey+')\n';
          sources.push({
            type: 'T',
            noffset: outputOffset++,
            amount: outputAmount,
            base: outputBase
          });
          outputOffset++;
        }
        outputBase--;
      }

      tx += "Comment: "+ (comments||"") + "\n";

      return CryptoUtils.sign(tx, data.keypair)
        .then(function(signature) {
          var signedTx = tx + signature + "\n";
          return BMA.tx.process({transaction: signedTx})
            .then(function() {
              return CryptoUtils.util.hash(signedTx);
            })
            .then(function(txHash) {
              _.forEach(sources, function(output) {
                output.identifier= txHash;
                output.consumed = false;
                output.pending = true;
              });
              return {
                hash: txHash,
                sources: sources
              };
            });
        });
    },

    checkUidNotExists = function(uid, pubkey) {
      return $q(function(resolve, reject) {
        BMA.wot.lookup({ search: uid }) // search on uid
          .then(function(res) {
            var found = res.results &&
              res.results.length > 0 &&
              res.results.some(function(pub){
                return pub.uids && pub.uids.length > 0 &&
                  pub.uids.some(function(idty) {
                    return ((idty.uid === uid) && // check Uid
                    (pub.pubkey !== pubkey || !idty.revoked)); // check pubkey
                  });
              });
            if (found) { // uid is already used : display a message and call failed callback
              reject({message: 'ACCOUNT.NEW.MSG_UID_ALREADY_USED'});
            }
            else {
              resolve(uid);
            }
          })
          .catch(function() {
            resolve(uid); // not found, so OK
          });
      });
    },

    checkPubkeyNotExists = function(uid, pubkey) {
      return $q(function(resolve, reject) {
        BMA.wot.lookup({ search: pubkey }) // search on pubkey
          .then(function(res) {
            var found = res.results &&
              res.results.length > 0 &&
              res.results.some(function(pub){
                return pub.pubkey === pubkey &&
                  pub.uids && pub.uids.length > 0 &&
                  pub.uids.some(function(idty) {
                    return (!idty.revoked); // excluded revoked uid
                  });
              });
            if (found) { // uid is already used : display a message and reopen the popup
              reject('ACCOUNT.NEW.MSG_PUBKEY_ALREADY_USED');
            }
            else {
              resolve(uid);
            }
          })
          .catch(function() {
            resolve(uid); // not found, so OK
          });
      });
    },

    /**
    * Send self identity
    */
    self = function(uid, needToLoadRequirements) {

      return $q(function(resolve, reject) {
        if (!BMA.regex.USER_ID.test(uid)){
          reject({message:'ERROR.INVALID_USER_ID'}); return;
        }
        var block;
        var identity;
        $q.all([
          // check uid used by another pubkey
          checkUidNotExists(uid, data.pubkey),

          // Load parameters (need to known the currency)
          loadParameters(),

          // Get th current block
          BMA.blockchain.current()
            .then(function(current) {
              block = current;
            })
            .catch(function(err) {
              // Special case for currency init (root block not exists): use fixed values
              if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                block = {number: 0, hash: BMA.constants.ROOT_BLOCK_HASH};
              }
              else {
                throw err;
              }
            })
        ])
        // Create identity document to sign
        .then(function() {
          identity = 'Version: 2\n' +
            'Type: Identity\n' +
            'Currency: ' + data.currency + '\n' +
            'Issuer: ' + data.pubkey + '\n' +
            'UniqueID: ' + uid + '\n' +
            'Timestamp: ' + block.number + '-' + block.hash + '\n';

          return CryptoUtils.sign(identity, data.keypair);
        })
        // Add signature
        .then(function (signature) {
          var signedIdentity = identity + signature + '\n';
          // Send to node
          return BMA.wot.add({identity: signedIdentity})
          .then(function (result) {
            if (!!needToLoadRequirements) {
              // Refresh membership data (if need)
              loadRequirements()
                .then(function () {
                  resolve();
                }).catch(function (err) {
                reject(err);
              });
            }
            else {
              data.uid = uid;
              data.blockUid = block.number + '-' + block.hash;
              resolve();
            }
          })
          .catch(function (err) {
            if (err && err.ucode === BMA.errorCodes.IDENTITY_SANDBOX_FULL) {
              reject({ucode: BMA.errorCodes.IDENTITY_SANDBOX_FULL, message: 'ERROR.IDENTITY_SANDBOX_FULL'});
              return;
            }
            reject(err);
          });
        }).catch(function (err) {
          reject(err);
        });
      });
    },

   /**
    * Send membership (in)
    */
    membership = function(sideIn) {
      return function() {
        var membership;
        return BMA.blockchain.current()
            .catch(function(err){
              // Special case for currency init (root block not exists): use fixed values
              if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                return {number: 0, hash: BMA.constants.ROOT_BLOCK_HASH};
              }
              throw err;
            })
          .then(function(block) {
            // Create membership to sign
            membership = 'Version: 2\n' +
              'Type: Membership\n' +
              'Currency: ' + data.currency + '\n' +
              'Issuer: ' + data.pubkey + '\n' +
              'Block: ' + block.number + '-' + block.hash + '\n' +
              'Membership: ' + (!!sideIn ? "IN" : "OUT" ) + '\n' +
              'UserID: ' + data.uid + '\n' +
              'CertTS: ' + data.blockUid + '\n';

            return CryptoUtils.sign(membership, data.keypair);
          })
          .then(function(signature) {
            var signedMembership = membership + signature + '\n';
            // Send signed membership
            return BMA.blockchain.membership({membership: signedMembership});
          })
          .then(function() {
            return $timeout(function() {
              return loadRequirements();
            }, 1000); // waiting for node to process membership doc
          })
          .then(function() {
            finishLoadRequirements();
          });
      };
    },

    /**
    * Send identity certification
    */
    certify = function(uid, pubkey, timestamp, signature, isMember, wasMember) {
      var current;
      var cert;

      return BMA.blockchain.current()
        .catch(function(err){
          // Special case for currency init (root block not exists): use fixed values
          if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
            return {number: 0, hash: BMA.constants.ROOT_BLOCK_HASH, medianTime: Math.trunc(new Date().getTime() / 1000)};
          }
          throw err;
        })
        .then(function(block) {
          current = block;
          // Create the self part to sign
          cert = 'Version: 2\n' +
            'Type: Certification\n' +
            'Currency: ' + data.currency + '\n' +
            'Issuer: ' + data.pubkey + '\n' +
            'IdtyIssuer: ' + pubkey + '\n' +
            'IdtyUniqueID: ' + uid + '\n' +
            'IdtyTimestamp: ' + timestamp + '\n' +
            'IdtySignature: ' + signature + '\n' +
            'CertTimestamp: ' + block.number + '-' + block.hash + '\n';

          return CryptoUtils.sign(cert, data.keypair);
        })
        .then(function(signature) {
          var signedCert = cert + signature + '\n';
          return BMA.wot.certify({cert: signedCert});
        })
        .then(function() {
          return {
            pubkey: pubkey,
            uid: uid,
            time: current.medianTime,
            isMember: isMember,
            wasMember: wasMember,
            expiresIn: data.parameters.sigWindow,
            pending: true,
            block: current.number,
            valid: true
          };
        });
    },

    addEvent = function(event) {
      event = event || {};
      event.type = event.type || 'info';
      event.message = event.message || '';
      event.messageParams = event.messageParams || {};
      data.events.push(event);
    },

    /**
    * Serialize to JSON string
    */
    toJson = function() {
      return $q(function(resolve, reject) {
        var json = JSON.stringify(data);
        resolve(json);
      });
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json, failIfInvalid) {
      failIfInvalid = angular.isUndefined(failIfInvalid) ? true : failIfInvalid;
      return $q(function(resolve, reject) {
        var obj = JSON.parse(json || '{}');
        if (obj && obj.keypair && obj.keypair.signPk && obj.keypair.signSk) {
          var keypair = {};
          var i;

          // sign Pk : Convert to Uint8Array type
          var signPk = new Uint8Array(32);
          for (i = 0; i < 32; i++) signPk[i] = obj.keypair.signPk[i];
          keypair.signPk = signPk;

          var signSk = new Uint8Array(64);
          for (i = 0; i < 64; i++) signSk[i] = obj.keypair.signSk[i];
          keypair.signSk = signSk;

          // box Pk : Convert to Uint8Array type
          if (obj.keypair.boxPk) {
            var boxPk = new Uint8Array(32);
            for (i = 0; i < 32; i++) boxPk[i] = obj.keypair.boxPk[i];
            keypair.boxPk = boxPk;
          }

          if (obj.keypair.boxSk) {
            var boxSk = new Uint8Array(32);
            for (i = 0; i < 64; i++) boxSk[i] = obj.keypair.boxSk[i];
            keypair.boxSk = boxSk;
          }

          resolve({
            pubkey: obj.pubkey,
            keypair: keypair,
            tx: obj.tx
          });
        }
        else if (failIfInvalid) {
          reject('Not a valid Wallet.data object');
        }
        else {
          resolve();
        }
      });
    }
    ;

    // Register extension points
    api.registerEvent('data', 'init');
    api.registerEvent('data', 'login');
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'finishLoad');
    api.registerEvent('data', 'logout');
    api.registerEvent('data', 'reset');

    csSettings.api.data.on.changed($rootScope, store);

    // init data
    resetData(true);

    return {
      id: id,
      data: data,
      // auth
      login: login,
      logout: logout,
      isLogin: isLogin,
      isNeverUsed: isNeverUsed,
      isUserPubkey: isUserPubkey,
      getData: getData,
      loadData: loadData,
      refreshData: refreshData,
      // operations
      transfer: transfer,
      self: self,
      membership: {
        inside: membership(true),
        out: membership(false)
      },
      events: {
        add: addEvent
      },
      certify: certify,
      store: store,
      restore: restore,
      // serialization
      toJson: toJson,
      fromJson: fromJson,
      api: api
    };
  };

  var service = factory('default');

  // try to restore wallet
  csSettings.api.data.on.ready($rootScope, function() {
    service.restore()
      .then(function(data) {
        $rootScope.walletData = data;
      });
  });

  service.instance = factory;
  return service;
});
