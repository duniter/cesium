
angular.module('cesium.wallet.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('Wallet', function($q, $rootScope, $timeout, $translate, $filter, Api, localStorage, CryptoUtils, BMA, csSettings, csNetwork) {
  'ngInject';

  Wallet = function(id) {

    var
    constants = {
      STORAGE_KEY: "CESIUM_DATA"
    },
    data = {
        pubkey: null,
        keypair: {
            signSk: null,
            signPk: null
        },
        uid: null,
        balance: 0,
        sources: null,
        sourcesIndexByKey: null,
        currency: null,
        parameters: null,
        currentUD: null,
        medianTime: null,
        tx: {
          history: [],
          pendings: [],
          errors: []
        },
        requirements: {},
        isMember: false,
        loaded: false,
        blockUid: null,
        avatar: null,
    },

    api = new Api(this, 'WalletService-' + id),

    resetData = function() {
      data.pubkey= null;
      data.keypair ={
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
      data.tx = {
         history: [],
         pendings: [],
         errors: []
       };
      data.requirements = {};
      data.isMember = false;
      data.loaded = false;
      data.blockUid = null;
      data.avatar = null;
      if (!csSettings.data.useLocalStorage) {
        csSettings.reset();
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
          var amount = tx.outputs.reduce(function(sum, output) {
              var outputArray = output.split(':',3);
              outputBase = parseInt(outputArray[1]);
              var outputAmount = (outputBase > 0) ? parseInt(outputArray[0]) * Math.pow(10, outputBase) : parseInt(outputArray[0]);
              var outputCondArray = outputArray[2].split('(', 3);
              var outputPubkey = (outputCondArray.length == 2 && outputCondArray[0] == 'SIG') ?
                   outputCondArray[1].substring(0,outputCondArray[1].length-1) : '';
              if (outputPubkey == data.pubkey) { // output is for the wallet
                if (!walletIsIssuer) {
                  return sum + outputAmount;
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
            time = txPendingsTimeByKey[amount + ':' + tx.hash];
          }

          // Avoid duplicated tx, oar tx to him self
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
               inputs: (tx.block_number === null ? tx.inputs.slice(0) : null)
            });
          }
        }
      });
    },

    login = function(salt, password) {
        return $q(function(resolve, reject) {
            CryptoUtils.connect(salt, password).then(
                function(keypair) {
                    // Copy result to properties
                    data.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
                    data.keypair = keypair;
                    if (csSettings.data.useLocalStorage) {
                      store();
                    }
                    resolve(data);
                }
            );
        });
    },

    logout = function(username, password) {
      return $q(function(resolve, reject) {

        resetData(); // will reset keypair
        store(); // store (if local storage enable)
        resolve();
      });
    },

    isLogin = function() {
        return !!data.pubkey;
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
          }

          // Load parameters
          // This prevent timeout error, when loading a market record after a browser refresh (e.g. F5)
          return loadParameters();
        })
        .catch(function(err){reject(err);});
      });
    },

    getData = function() {
      return data;
    },

    isSourceEquals = function(arg1, arg2) {
        return arg1.identifier == arg2.identifier &&
               arg1.noffset == arg2.noffset &&
               arg1.type == arg2.type &&
               arg1.base == arg2.base &&
              arg1.amount == arg2.amount;
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
          data.requirements.needMembership = (data.requirements.membershipExpiresIn === 0 &&
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
          data.isMember = !data.requirements.needSelf && !data.requirements.needMembership;
          resolve();
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
          var sources = [];
          var sourcesIndexByKey = [];
          var balance = 0;
          if (res.sources) {
            _.forEach(res.sources, function(src) {
              var srcKey = src.type+':'+src.identifier+':'+src.noffset;
              src.consumed = false;
              balance += (src.base > 0) ? (src.amount * Math.pow(10, src.base)) : src.amount;
              sources.push(src);
              sourcesIndexByKey[srcKey] = sources.length -1 ;
            });
          }
          data.sources = sources;
          data.sourcesIndexByKey = sourcesIndexByKey;
          data.balance = balance;
          resolve();
        })
        .catch(function(err) {
          data.sources = [];
          data.sourcesIndexByKey = [];
          reject(err);
        });
      });
    },

    loadTransactions = function() {
      return $q(function(resolve, reject) {
        var txHistory = [];
        var udHistory = [];
        var txPendings = [];

        var now = new Date().getTime();
        var nowInSec = Math.trunc(now / 1000);
        var fromTime = nowInSec - csSettings.data.walletHistoryTimeSecond;
        var processedTxMap = {};

        var reduceTx = function(res){
          reduceTxAndPush(res.history.sent, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.received, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.sending, txHistory, processedTxMap, true/*exclude pending*/);
          reduceTxAndPush(res.history.pending, txPendings, processedTxMap, false/*exclude pending*/);
        };

        var jobs = [
          // get pendings history
          BMA.tx.history.pending({pubkey: data.pubkey})
            .then(reduceTx)
        ];

        // get TX history since
        var sliceTime = csSettings.data.walletHistorySliceSecond;
        for(var i = fromTime - (fromTime % sliceTime); i - sliceTime < nowInSec; i += sliceTime)  {
          jobs.push(BMA.tx.history.times({pubkey: data.pubkey, from: i, to: i+sliceTime-1})
            .then(reduceTx)
          );
        }

        jobs.push(BMA.tx.history.timesNoCache({pubkey: data.pubkey, from: nowInSec - (nowInSec % sliceTime), to: nowInSec+999999999})
          .then(reduceTx));

        // get UD history
        if (csSettings.data.showUDHistory) {
          jobs.push(
            BMA.ud.history({pubkey: data.pubkey})
            .then(function(res){
              udHistory = !res.history || !res.history.history ? [] :
               res.history.history.reduce(function(res, ud){
                 var amount = (ud.base > 0) ? ud.amount * Math.pow(10, ud.base) : ud.amount;
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
          console.log('[wallet] TX history loaded in '+ (new Date().getTime()-now) +'ms');
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
      return $q(function(resolve, reject){

        BMA.wot.member.uids()
        .then(function(uids){
          var txPendings = [];
          var txErrors = [];
          var balance = data.balance;

          _.forEach(data.tx.history, function(tx) { // process TX history
             tx.uid = uids[tx.pubkey] || null;
          });

          _.forEach(data.tx.pendings, function(tx) { // process TX pendings
            tx.uid = uids[tx.pubkey] || null;

            var sources = [];
            var valid = true;
            if (tx.amount > 0) { // do not check sources from received TX
              valid = false;
              // TODO get sources from the issuer ?
            }
            else {
              _.forEach(tx.inputs, function(input) {
                var inputKey = input.split(':').slice(2).join(':');
                var srcIndex = data.sourcesIndexByKey[inputKey];
                if (!angular.isUndefined(srcIndex)) {
                  sources.push(data.sources[srcIndex]);
                }
                else {
                  valid = false;
                  return false; // break
                }
              });
            }
            if (valid) {
              balance += tx.amount; // update balance
              txPendings.push(tx);
              _.forEach(sources, function(src) {
                src.consumed=true;
              });
            }
            else {
              txErrors.push(tx);
            }
          });

          data.tx.pendings = txPendings;
          data.tx.errors = txErrors;
          data.balance = balance;
          resolve();
        })
        .catch(function(err) {
          reject(err);
        });
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

    loadUDs = function() {
      return $q(function(resolve, reject) {
        BMA.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return BMA.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                data.currentUD = (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
                resolve();
              })
              .catch(function(err) {
                data.currentUD = null;
                reject(err);
              });
            }
        })
        .catch(function(err) {
          data.currentUD = null;
          reject(err);
        });
      });
    },

    // Must be call after loadParameters() and loadRequirements()
    finishLoadRequirements = function() {
      data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.parameters.sigQty)) ?
          (data.parameters.sigQty - data.requirements.certificationCount) : 0;
      data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
          data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < data.parameters.sigQty) ?
          (data.parameters.sigQty - data.requirements.certificationCount - willExpireCertificationCount) : 0;
    },

    loadData = function() {
      if (data.loaded) {
        return refreshData();
      }

      return $q(function(resolve, reject){
        data.loaded = false;

        $q.all([

          // Get currency parameters
          loadParameters(),

          // Get UDs
          loadUDs(),

          // Get requirements
          loadRequirements(),

          // Get sources
          loadSources(),

          // Get transactions
          loadTransactions(),

          // API extension
          api.data.raisePromise.load(data)
        ])
        .then(function() {
          // Process transactions and sources
          processTransactionsAndSources()
          .then(function() {
            finishLoadRequirements(); // must be call after loadParameters() and loadRequirements()
            data.loaded = true;
            resolve(data);
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
          uds: true,
          requirements: true,
          sources: true,
          tx: true
        };
      }
      return $q(function(resolve, reject){
        var jobs = [];
        // Get UDs
        if (options.uds) {
          jobs.push(loadUDs());
        }
        // Get requirements
        if (options.uds) {
          jobs.push(loadRequirements()
            .then(function() {
              finishLoadRequirements();
            }));
        }
        if (options.sources || options.tx) {
          // Get sources
          jobs.push(loadSources());
          // Get transactions
          jobs.push(loadTransactions());
        }
        // API extension
        jobs.push(api.data.raisePromise.load(data));

        $q.all(jobs)
        .then(function() {
          // Process transactions and sources
          processTransactionsAndSources()
          .then(function(){
            resolve(data);
          })
          .catch(function(err){reject(err);});
        })
        .catch(function(err){reject(err);});
      });
    },

    isBase = function(amount, base) {
      if (!base) {
        return true;
      }
      var rest = '00000000' + amount;
      var lastDigits = parseInt(rest.substring(rest.length-base));
      return lastDigits === 0; // no rest
    },

    truncBase = function(amount, base) {
      var pow = Math.pow(10, base);
      return Math.trunc(amount / pow ) * pow;
    },

    getInputs = function(amount, outputBase, filterBase) {
      if (angular.isUndefined(filterBase)) {
        filterBase = outputBase;
      }
      var sourcesAmount = 0;
      var sources = [];
      var minBase = filterBase;
      var maxBase = filterBase;
      var i = 0;
      _.forEach(data.sources, function(source) {
        var skip = source.consumed || (source.base !== filterBase);
        if (!skip){
          sourcesAmount += (source.base > 0) ? (source.amount * Math.pow(10, source.base)) : source.amount;
          sources.push(source);
          // Stop if enough sources
          if (sourcesAmount >= amount) {
            return false;
          }
        }
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
          var amountBase = 0;
          while (inputs.amount < amount && amountBase <= block.unitbase) {

            // Get inputs, starting to use current base sources
            inputs = getInputs(amount, block.unitbase);

            // Reduce amount (remove last digits)
            amountBase++;
            if (inputs.amount < amount && amountBase <= block.unitbase) {
              amount = truncBase(amount, amountBase);
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
          if (amountBase > 0) {
            console.debug("[wallet] Amount has been truncate to " + amount);
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
          while(rest > 0) {
            outputAmount = truncBase(rest, outputBase);
            rest -= outputAmount;
            if (outputAmount > 0) {
              outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
              tx += outputAmount + ':' + outputBase + ':SIG(' + destPub + ')\n';
            }
            outputBase--;
          }
          rest = inputs.amount - amount;
          outputBase = inputs.maxBase;
          while(rest > 0) {
            outputAmount = truncBase(rest, outputBase);
            rest -= outputAmount;
            if (outputAmount > 0) {
              outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
              tx += outputAmount +':'+outputBase+':SIG('+data.pubkey+')\n';
            }
            outputBase--;
          }

          tx += "Comment: "+ (!!comments?comments:"") + "\n";

          CryptoUtils.sign(tx, data.keypair)
          .then(function(signature) {
            var signedTx = tx + signature + "\n";
            BMA.tx.process({transaction: signedTx})
            .then(function(result) {
              data.balance -= amount;
              _.forEach(inputs.sources, function(source) {
                  source.consumed=true;
              });

              // Add TX to pendings
              CryptoUtils.util.hash(signedTx)
              .then(function(hash) {
                BMA.wot.member.get(destPub)
                .then(function(member) {
                  data.tx.pendings.unshift({
                      time: (Math.floor(moment().utc().valueOf() / 1000)),
                      amount: -amount,
                      pubkey: destPub,
                      uid: member ? member.uid : null,
                      comment: comments,
                      isUD: false,
                      hash: hash,
                      locktime: 0,
                      block_number: null
                    });
                  store(); // save pendings in local storage
                  resolve(result);
                }).catch(function(err){reject(err);});
              });
            }).catch(function(err){reject(err);});
          }).catch(function(err){reject(err);});
        });
      });
    },

    /**
    * Send self identity
    */
    self = function(uid, requirements) {

      return $q(function(resolve, reject) {
        if (!BMA.regex.USER_ID.test(uid)){
          reject({message:'ERROR.INVALID_USER_ID'}); return;
        }
        loadParameters()
        .then(function() {
          BMA.blockchain.current()
            .then(function (block) {
              // Create identity to sign
              var identity = 'Version: 2\n' +
                'Type: Identity\n' +
                'Currency: ' + data.currency + '\n' +
                'Issuer: ' + data.pubkey + '\n' +
                'UniqueID: ' + uid + '\n' +
                'Timestamp: ' + block.number + '-' + block.hash + '\n';

              CryptoUtils.sign(identity, data.keypair)
                .then(function (signature) {
                  var signedIdentity = identity + signature + '\n';
                  // Send signed identity
                  BMA.wot.add({identity: signedIdentity})
                  .then(function (result) {
                    if (!!requirements) {
                      // Refresh membership data
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
            }).catch(function (err) {
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
        return $q(function(resolve, reject) {
          BMA.blockchain.current()
          .then(function(block) {
            // Create membership to sign
             var membership = 'Version: 2\n' +
                     'Type: Membership\n' +
                     'Currency: ' + data.currency + '\n' +
                     'Issuer: ' + data.pubkey + '\n' +
                     'Block: ' + block.number + '-' + block.hash + '\n' +
                     'Membership: ' + (!!sideIn ? "IN" : "OUT" ) + '\n' +
                     'UserID: ' + data.uid + '\n' +
                     'CertTS: ' + data.blockUid + '\n';

            CryptoUtils.sign(membership, data.keypair)
            .then(function(signature) {
              var signedMembership = membership + signature + '\n';
              // Send signed membership
              BMA.blockchain.membership({membership: signedMembership})
              .then(function(result) {
                $timeout(function() {
                  loadRequirements()
                    .then(function() {
                      finishLoadRequirements();
                      resolve();
                    })
                    .catch(function(err){reject(err);});
                }, 200);
              }).catch(function(err){reject(err);});
            }).catch(function(err){reject(err);});
          }).catch(function(err){reject(err);});
        });
      };
    },

    /**
    * Send identity certification
    */
    certify = function(uid, pubkey, timestamp, signature) {
      return $q(function(resolve, reject) {

        BMA.blockchain.current()
        .then(function(block) {
          // Create the self part to sign
          var cert = 'Version: 2\n' +
                     'Type: Certification\n' +
                     'Currency: ' + data.currency + '\n' +
                     'Issuer: ' + data.pubkey + '\n' +
                     'IdtyIssuer: '+ pubkey + '\n' +
                     'IdtyUniqueID: '+ uid + '\n' +
                     'IdtyTimestamp: '+ timestamp + '\n' +
                     'IdtySignature: '+ signature + '\n' +
                     'CertTimestamp: '+ block.number + '-' + block.hash + '\n';

          CryptoUtils.sign(cert, data.keypair)
          .then(function(signature) {
            var signedCert = cert + signature + '\n';
            BMA.wot.certify({cert: signedCert})
              .then(function(result) {
                resolve(result);
              }).catch(function(err){reject(err);});
          }).catch(function(err){reject(err);});
        }).catch(function(err){reject(err);});
      });
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
      if (failIfInvalid === "undefined") {
        failIfInvalid = true;
      }
      return $q(function(resolve, reject) {
        var obj = JSON.parse(json || '{}');
        if (obj && obj.keypair && obj.keypair.signPk && obj.keypair.signSk) {
          var keypair = {};
          var i;

          // Convert to Uint8Array type
          var signPk = new Uint8Array(32);
          for (i = 0; i < 32; i++) signPk[i] = obj.keypair.signPk[i];
          keypair.signPk = signPk;

          var signSk = new Uint8Array(64);
          for (i = 0; i < 64; i++) signSk[i] = obj.keypair.signSk[i];
          keypair.signSk = signSk;

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
    api.registerEvent('data', 'load');

    csSettings.api.data.on.changed($rootScope, store);

    return {
      id: id,
      data: data,
      // auth
      login: login,
      logout: logout,
      isLogin: isLogin,
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
      certify: certify,
      store: store,
      restore: restore,
      // serialization
      toJson: toJson,
      fromJson: fromJson,
      api: api
    };
  };

  var service = Wallet('default');

  // try to restore wallet
  service.restore();
  $rootScope.walletData = service.data;

  service.instance = Wallet;
  return service;
});
