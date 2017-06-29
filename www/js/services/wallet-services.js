
angular.module('cesium.wallet.services', ['ngApi', 'ngFileSaver', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('csWallet', function($q, $rootScope, $timeout, $translate, $filter, Api, localStorage,
                              CryptoUtils, BMA, csConfig, csSettings, FileSaver, Blob, csWot, csTx, csCurrency) {
  'ngInject';

  function factory(id, BMA) {

    var
    constants = {
      STORAGE_KEY: 'CESIUM_DATA',
      /* Need for compat with old currencies (test_net and sou) */
      TX_VERSION:   csConfig.compatProtocol_0_80 ? 3 : BMA.constants.PROTOCOL_VERSION,
      IDTY_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      MS_VERSION:   csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      CERT_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      REVOKE_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION
    },
    data = {},
    listeners,
    started,
    startPromise,
    api = new Api(this, 'csWallet-' + id),

    resetData = function(init) {
      data.loaded = false;
      data.pubkey= null;
      data.keypair = {
          signSk: null,
          signPk: null
        };
      data.uid = null;
      data.isNew = null;
      data.sourcesIndexByKey = null;
      data.currency= null;
      data.parameters = null;
      data.currentUD = null;
      data.medianTime = null;
      data.requirements = {};
      data.blockUid = null;
      data.sigDate = null;
      data.isMember = false;
      data.events = [];

      resetTxAndSources();

      started = false;
      startPromise = undefined;

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

    resetTxAndSources = function(){
      // reset sources data
      data.sources = [];
      data.sourcesIndexByKey = {};
      data.balance = 0;
      // reset TX data
      data.tx = data.tx || {};
      data.tx.history = [];
      data.tx.pendings = [];
      data.tx.errors = [];
      delete data.tx.fromTime;
      delete data.tx.toTime;
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

    loginBySalt = function(salt, password) {
      console.warn("[wallet] deprecacted API. use login instead");

      return CryptoUtils.connect(salt, password)
        .then(function (keypair) {
          var pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
          // Call extend api
          return login(pubkey, keypair);
        });
    },

    login = function(pubkey, keypair) {
      data.pubkey = pubkey;

      // FOR DEV ONLY - on crosschain
      //console.error('TODO REMOVE this code - dev only');
      //data.pubkey = '38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE';

      data.keypair = keypair || {
        signSk: null,
        signPk: null
      };

      // Call extend api
      return api.data.raisePromise.login(data)
        // store wallet if need
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

    hasSelf = function() {
      return !!data.pubkey && data.requirements && !data.requirements.needSelf;
    },

    isNeverUsed = function() {
      if (!data.loaded) return undefined; // undefined if not full loaded
      return !data.pubkey ||
        (!data.isMember &&
        (!data.requirements || (!data.requirements.pendingMembership && !data.requirements.wasMember)) &&
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
          // FIXME: #372
          /*var dataToStore = {
            pubkey: data.pubkey,
            uid: data.uid
          };*/

          var dataToStore = {
            keypair: data.keypair,
            pubkey: data.pubkey,
            version: csConfig.version
          };

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
      return localStorage.get(constants.STORAGE_KEY)
        .then(function(dataStr) {
          if (!dataStr) return;
          return fromJson(dataStr, false)
            .then(function(storedData){
              // FIXME: #372
              /*if (storedData && storedData.pubkey) {
                data.pubkey = storedData.pubkey;
                data.uid = storedData.uid;
                data.loaded = false;

                return $q.all([
                  // Call extend api
                  api.data.raisePromise.login(data),

                  // Load currency (e.g parameters)
                  // This prevent timeout error, when loading a market record after a browser refresh (e.g. F5)
                  loadCurrency()
                ]);
              }
              else */if (storedData && storedData.keypair && storedData.pubkey) {
                data.keypair = storedData.keypair;
                data.pubkey = storedData.pubkey;

                // FOR DEV ONLY - on crosschain
                // console.error('TODO REMOVE this code - dev only'); data.pubkey = '36j6pCNzKDPo92m7UXJLFpgDbcLFAZBgThD2TCwTwGrd';
                data.loaded = false;

                return $q.all([
                  // Call extend api
                  api.data.raisePromise.login(data),

                  // Load currency
                  // This prevent timeout error, when loading record after a browser refresh (e.g. F5)
                  loadCurrency()
                ]);
              }
              else {
                // Load currency
                // This prevent timeout error, when loading a market record after a browser refresh (e.g. F5)
                return loadCurrency();
              }
            })
            .then(function(){
              return data;
            });
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
        wasMember: false,
        certificationCount: 0,
        needCertifications: false,
        needCertificationCount: 0,
        willNeedCertificationCount: 0
      };
      data.blockUid = null;
      data.isMember = false;
      data.sigDate = null;
      cleanEventsByContext('requirements');
    },

    loadRequirements = function() {
      return $q(function(resolve, reject) {

        // Clean existing events
        cleanEventsByContext('requirements');

        // Get requirements
        BMA.wot.requirements({pubkey: data.pubkey})
        .then(function(res){
          if (!res.identities || res.identities.length === 0) {
            resetRequirements();
            resolve();
            return;
          }
          // Sort to select the best identity
          if (res.identities.length > 1) {
            // Select the best identity, by sorting using this order
            //  - same wallet uid
            //  - is member
            //  - has a pending membership
            //  - is not expired (in sandbox)
            //  - is not outdistanced
            //  - if has certifications
            //      max(count(certification)
            //    else
            //      max(membershipPendingExpiresIn) = must recent membership
            res.identities = _.sortBy(res.identities, function(idty) {
              var score = 0;
              score += (10000000000 * ((data.uid && idty.uid === data.uid) ? 1 : 0));
              score += (1000000000  * (idty.membershipExpiresIn > 0 ? 1 : 0));
              score += (100000000   * (idty.membershipPendingExpiresIn > 0 ? 1 : 0));
              score += (10000000    * (!idty.expired ? 1 : 0));
              score += (1000000     * (!idty.outdistanced ? 1 : 0));
              score += (100000      * (idty.wasMember ? 1 : 0));
              var certCount = !idty.expired && idty.certifications ? idty.certifications.length : 0;
              score += (1         * (certCount ? certCount : 0));
              score += (1         * (!certCount && idty.membershipPendingExpiresIn > 0 ? idty.membershipPendingExpiresIn/1000 : 0));
              return -score;
            });
            console.debug('Found {0} identities. Will selected the best one'.format(res.identities.length));
          }

          // Select the first identity
          var idty = res.identities[0];

          // Compute useful fields
          idty.needSelf = false;
          idty.wasMember = angular.isDefined(idty.wasMember) ? idty.wasMember : false; // Compat with Duniter 0.9
          idty.needMembership = (idty.membershipExpiresIn <= 0 && idty.membershipPendingExpiresIn <= 0 && !idty.wasMember);
          idty.needRenew = (!idty.needMembership &&
                            idty.membershipExpiresIn <= csSettings.data.timeWarningExpireMembership &&
                            idty.membershipPendingExpiresIn <= 0) ||
                           (idty.wasMember && idty.membershipExpiresIn === 0 &&
                            idty.membershipPendingExpiresIn === 0);
          idty.canMembershipOut = (idty.membershipExpiresIn > 0);
          idty.pendingMembership = (idty.membershipExpiresIn <= 0 && idty.membershipPendingExpiresIn > 0);
          idty.certificationCount = (idty.certifications) ? idty.certifications.length : 0;
          idty.willExpireCertificationCount = idty.certifications ? idty.certifications.reduce(function(count, cert){
            return count + (cert.expiresIn <= csSettings.data.timeWarningExpire ? 1 : 0);
          }, 0) : 0;
          idty.pendingRevocation = !idty.revoked && !!idty.revocation_sig;

          data.requirements = idty;
          data.uid = idty.uid;
          data.blockUid = idty.meta.timestamp;
          data.isMember = (idty.membershipExpiresIn > 0);

          var blockParts = idty.meta.timestamp.split('-', 2);
          var blockNumber = parseInt(blockParts[0]);
          var blockHash = blockParts[1];
          // Retrieve registration date
          return BMA.blockchain.block({block: blockNumber})
            .then(function(block) {
              data.sigDate = block.medianTime;

              // Check if self has been done on a valid block
              if (!data.isMember && blockNumber !== 0 && blockHash !== block.hash) {
                addEvent({type: 'error', message: 'ERROR.WALLET_INVALID_BLOCK_HASH', context: 'requirements'});
                console.debug("Invalid membership for uid={0}: block hash changed".format(data.uid));
              }
              // Check if self expired
              else if (!data.isMember && data.requirements.expired) {
                addEvent({type: 'error', message: 'ERROR.WALLET_IDENTITY_EXPIRED', context: 'requirements'});
                console.debug("Identity expired for uid={0}.".format(data.uid));
              }
              resolve();
            })
            .catch(function(err){
              // Special case for currency init (root block not exists): use now
              if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && blockNumber === 0) {
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

    loadTxAndSources = function(fromTime) {
      return csTx.load(data.pubkey, fromTime)
        .then(function(res){
          angular.merge(data, res);
        })
        .catch(function(err) {
          resetTxAndSources();
          throw err;
        });
    },

    loadCurrency = function() {
      if (data.parameters && data.currency) return $q.when();
      return csCurrency.get()
        .then(function(currency){
          data.currency = currency.name;
          data.parameters = currency.parameters;
          data.currentUD = currency.currentUD;
        })
        .catch(function(err) {
          data.currency = null;
          data.parameters = null;
          data.currentUD = -1;
          throw err;
        });
    },

    // Must be call after loadCurrency() and loadRequirements()
    finishLoadRequirements = function() {
      data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.parameters.sigQty)) ?
          (data.parameters.sigQty - data.requirements.certificationCount) : 0;
      data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
          data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < data.parameters.sigQty) ?
          (data.parameters.sigQty - data.requirements.certificationCount + data.requirements.willExpireCertificationCount) : 0;
      data.requirements.pendingCertificationCount = 0 ; // init to 0, because not loaded here (see wot-service.js)

      // Add user events
      if (data.requirements.revoked) {
        addEvent({type:'warn', message: 'ERROR.WALLET_REVOKED', context: 'requirements'});
      }
      else if (data.requirements.pendingRevocation) {
        addEvent({type:'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'});
      }
      else {
        if (data.requirements.pendingMembership) {
          addEvent({type:'pending', message: 'ACCOUNT.WAITING_MEMBERSHIP', context: 'requirements'});
        }
        if (data.requirements.needCertificationCount > 0) {
          addEvent({type:'warn', message: 'ACCOUNT.WAITING_CERTIFICATIONS', messageParams: data.requirements, context: 'requirements'});
        }
        if (data.requirements.willNeedCertificationCount > 0) {
          addEvent({type:'warn', message: 'ACCOUNT.WILL_MISSING_CERTIFICATIONS', messageParams: data.requirements, context: 'requirements'});
        }
        if (data.requirements.needRenew) {
          addEvent({type:'warn', message: 'ACCOUNT.WILL_NEED_RENEW_MEMBERSHIP', messageParams: data.requirements, context: 'requirements'});
        }
        else if (data.requirements.wasMember && data.requirements.needMembership) {
          addEvent({type:'warn', message: 'ACCOUNT.NEED_RENEW_MEMBERSHIP', messageParams: data.requirements, context: 'requirements'});
        }
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

      if (options && options.minData) {
        return loadMinData(options);
      }

      if (options || data.loaded) {
        return refreshData(options);
      }

      return loadFullData();
    },

    loadFullData = function() {
      data.loaded = false;

      return $q.all([

          // Get currency parameters
          loadCurrency(),

          // Get requirements
          loadRequirements(),

          // Get TX and sources
          loadTxAndSources(),

          // Load sigStock
          loadSigStock(),

          // API extension
          api.data.raisePromise.load(data, null)
            .catch(function(err) {
              console.error('Error while loading wallet data, on extension point. Try to continue');
              console.error(err);
            })
        ])
        .then(function() {
          finishLoadRequirements(); // must be call after loadCurrency() and loadRequirements()
          return api.data.raisePromise.finishLoad(data)
            .catch(function(err) {
              console.error('Error while finishing wallet data load, on extension point. Try to continue');
              console.error(err);
            });
        })
        .then(function() {
          data.loaded = true;
          return data;
        })
        .catch(function(err) {
          data.loaded = false;
          throw err;
        });
    },

    loadMinData = function(options) {
      options = options || {};
      options.parameters = angular.isDefined(options.parameters) ? options.parameters : !data.parameters; // do not load if already done
      options.requirements = angular.isDefined(options.requirements) ? options.requirements :
        (!data.requirements || angular.isUndefined(data.requirements.needSelf));
      if (!options.parameters && !options.requirements) {
        return $q.when(data);
      }
      return refreshData(options);
    },

    refreshData = function(options) {
        options = options || {
          parameters: !data.parameters, // do not load if already done
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

      // Force some load (parameters & requirements) if not already loaded
      options.parameters = angular.isDefined(options.parameters) ? options.parameters : !data.parameters;
      options.requirements = angular.isDefined(options.requirements) ? options.requirements : !data.requirements;

      var jobs = [];

      // Reset events
      cleanEventsByContext('requirements');

      // Get currency (e.g parameters)
      if (options.parameters || options.currentUd) jobs.push(loadCurrency());

      // Get requirements
      if (options.requirements) {
        jobs.push(loadRequirements()
          .then(function() {
            finishLoadRequirements();
          }));
      }

      if (options.sources || (options.tx && options.tx.enable)) {
        // Get TX and sources
        jobs.push(loadTxAndSources(options.tx ? options.tx.fromTime: undefined));
      }

      // Load sigStock
      if (options.sigStock) jobs.push(loadSigStock());

      // API extension (force if no other jobs)
      if (!jobs.length || options.api) jobs.push(api.data.raisePromise.load(data, options));

      return $q.all(jobs)
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
      var pow = Math.pow(10, base); // = min value in this base
      if (amount < pow) return 0;
      return Math.trunc(amount / pow ) * pow;
    },

    truncBaseOrMinBase = function(amount, base) {
      var pow = Math.pow(10, base);
      if (amount < pow) return pow; //
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
          if (!BMA.regexp.PUBKEY.test(destPub)){
            reject({message:'ERROR.INVALID_PUBKEY'}); return;
          }
          if (!BMA.regexp.COMMENT.test(comments)){
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
            amount = truncBaseOrMinBase(amount, inputs.minBase);
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
              var pendingTx = {
                time: (Math.floor(moment().utc().valueOf() / 1000)),
                amount: -amount,
                pubkey: destPub,
                comment: comments,
                isUD: false,
                hash: res.hash,
                locktime: 0,
                block_number: null
              };
              csWot.extendAll([pendingTx], 'pubkey')
                .then(function() {
                  data.tx.pendings.unshift(pendingTx);
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
      // (If more than 100 lines, send to TX to himself first, then its result as sources for the final TX)
      if (inputs.sources.length > 40) {
        console.debug("[Wallet] TX has to many sources. Will chain TX...");

        // Compute a slice of sources
        var firstSlice = {
          minBase: block.unitbase,
          maxBase: 0,
          amount: 0,
          sources: inputs.sources.slice(0, 39)
        };
        _.forEach(firstSlice.sources, function(source) {
          if (source.base < firstSlice.minBase) firstSlice.minBase = source.base;
          if (source.base > firstSlice.maxBase) firstSlice.maxBase = source.base;
          firstSlice.amount += powBase(source.amount, source.base);
        });

        // Send inputs first slice
        return createAndSendTx(block, data.pubkey/*to himself*/, firstSlice.amount, firstSlice) // comment not need
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
              if (source.base < secondSlice.minBase) secondSlice.minBase = source.base;
              if (source.base > secondSlice.maxBase) secondSlice.maxBase = source.base;
              secondSlice.amount += source.amount;
            });

            // Send inputs second slice (recursive call)
            return createAndSendTx(block, destPub, amount, secondSlice, comments);
          });
      }

      var tx = 'Version: '+ constants.TX_VERSION +'\n' +
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
      var newSources = [];
      // Outputs to receiver (if not himself)
      if (destPub !== data.pubkey) {
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
      }
      // Outputs to himself
      while(rest > 0) {
        outputAmount = truncBase(rest, outputBase);
        rest -= outputAmount;
        if (outputAmount > 0) {
          outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
          tx += outputAmount +':'+outputBase+':SIG('+data.pubkey+')\n';
          newSources.push({
            type: 'T',
            noffset: outputOffset,
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
            .catch(function(err) {
              if (err && err.ucode === BMA.errorCodes.TX_ALREADY_PROCESSED) {
                // continue
                return;
              }
              throw err;
            })
            .then(function() {
              return CryptoUtils.util.hash(signedTx);
            })
            .then(function(txHash) {
              _.forEach(newSources, function(output) {
                output.identifier= txHash;
                output.consumed = false;
                output.pending = true;
              });
              return {
                hash: txHash,
                sources: newSources
              };
            });
        });
    },

    getIdentityDocument = function(uid, blockUid) {
      uid = uid || data.uid;
      blockUid = blockUid || data.blockUid;
      if (!uid || !blockUid) {
        throw {message: 'ERROR.WALLET_HAS_NO_SELF'};
      }
      if (data.requirements && data.requirements.expired) {
        throw {message: 'ERROR.WALLET_IDENTITY_EXPIRED'};
      }

      var identity = 'Version: '+ constants.IDTY_VERSION +'\n' +
        'Type: Identity\n' +
        'Currency: ' + data.currency + '\n' +
        'Issuer: ' + data.pubkey + '\n' +
        'UniqueID: ' + uid + '\n' +
        'Timestamp: ' + blockUid + '\n';
      return CryptoUtils.sign(identity, data.keypair)
        .then(function(signature) {
          identity += signature + '\n';
          console.debug('Has generate an identity document:\n----\n' + identity + '----');
          return identity;
        });
    },

    /**
    * Send self identity
    */
    self = function(uid, needToLoadRequirements) {
        if (!BMA.regexp.USER_ID.test(uid)){
          return $q.reject({message: 'ERROR.INVALID_USER_ID'});
        }
        var block;
        return $q.all([

          // Load currency (e.g parameters)
          loadCurrency(),

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
        // Create identity document
        .then(function() {
          return getIdentityDocument(uid, block.number + '-' + block.hash);
        })

        // Send to node
        .then(function (identity) {
          return BMA.wot.add({identity: identity});
        })

        .then(function () {
          if (!!needToLoadRequirements) {
            // Refresh membership data (if need)
            return loadRequirements();
          }
          else {
            data.uid = uid;
            data.blockUid = block.number + '-' + block.hash;
          }
        })
        .catch(function (err) {
          if (err && err.ucode === BMA.errorCodes.IDENTITY_SANDBOX_FULL) {
            throw {ucode: BMA.errorCodes.IDENTITY_SANDBOX_FULL, message: 'ERROR.IDENTITY_SANDBOX_FULL'};
          }
          throw err;
        });
    },

   /**
    * Send membership (in or out)
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
            membership = 'Version: '+ constants.MS_VERSION +'\n' +
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
          cert = 'Version: '+ constants.CERT_VERSION +'\n' +
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
          var cert = {
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

          // Notify extension
          api.action.raise.certify(cert);

          return cert;
        });
    },

    addEvent = function(event, insertAtFirst) {
      event = event || {};
      event.type = event.type || 'info';
      event.message = event.message || '';
      event.messageParams = event.messageParams || {};
      event.context = event.context || 'undefined';
      if (event.message.trim().length) {
        if (!insertAtFirst) {
          data.events.push(event);
        }
        else {
          data.events.splice(0, 0, event);
        }
      }
      else {
        console.debug('Event without message. Skipping this event');
      }
    },

    getkeypairSaveId = function(record) {
        var nbCharSalt = Math.round(record.answer.length / 2);
        var salt = record.answer.substr(0, nbCharSalt);
        var pwd = record.answer.substr(nbCharSalt);
        return CryptoUtils.connect(salt, pwd)
          .then(function (keypair) {
            record.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
            record.keypair = keypair;
            return record;
          });
      },

    getCryptedId = function(record){
      return getkeypairSaveId(record)
        .then(function() {
          return CryptoUtils.util.random_nonce();
        })
        .then(function(nonce) {
          record.nonce = nonce;
          return CryptoUtils.box.pack(record.salt, record.nonce, record.keypair.boxPk, record.keypair.boxSk);
        })
        .then(function (cypherSalt) {
          record.salt = cypherSalt;
          return CryptoUtils.box.pack(record.pwd, record.nonce, record.keypair.boxPk, record.keypair.boxSk);
        })
        .then(function (cypherPwd) {
          record.pwd = cypherPwd;
          record.nonce = CryptoUtils.util.encode_base58(record.nonce);
          return record;
        });
    },

    recoverId = function(recover) {
      var nonce = CryptoUtils.util.decode_base58(recover.cypherNonce);
      return getkeypairSaveId(recover)
        .then(function (recover) {
          return CryptoUtils.box.open(recover.cypherSalt, nonce, recover.keypair.boxPk, recover.keypair.boxSk);
        })
        .then(function (salt) {
          recover.salt = salt;
          return CryptoUtils.box.open(recover.cypherPwd, nonce, recover.keypair.boxPk, recover.keypair.boxSk);
        })
        .then(function (pwd) {
          recover.pwd = pwd;
          return recover;
        })
        .catch(function(err){
          console.warn('Incorrect answers - Unable to recover passwords');
        });
    },

    getSaveIDDocument = function(record) {
      var saveId = 'Version: 10 \n' +
        'Type: SaveID\n' +
        'Questions: ' + '\n' + record.questions +
        'Issuer: ' + data.pubkey + '\n' +
        'Crypted-Nonce: '+ record.nonce + '\n'+
        'Crypted-Pubkey: '+ record.pubkey +'\n' +
        'Crypted-Salt: '+ record.salt  + '\n' +
        'Crypted-Pwd: '+ record.pwd + '\n';

      // Sign SaveId document
      return CryptoUtils.sign(saveId, data.keypair)

        .then(function(signature) {
          saveId += signature + '\n';
          console.debug('Has generate an SaveID document:\n----\n' + saveId + '----');
          return saveId;
        });

    },

    downloadSaveId = function(record){
      return getSaveIDDocument(record)
        .then(function(saveId) {
          var saveIdFile = new Blob([saveId], {type: 'text/plain; charset=utf-8'});
          FileSaver.saveAs(saveIdFile, 'saveID.txt');
        });

    },

    getRevocationDocument = function() {

      // Get current identity document
      return getIdentityDocument()

        // Create membership document (unsigned)
        .then(function(identity){
          var identityLines = identity.trim().split('\n');
          var idtySignature = identityLines[identityLines.length-1];

          var revocation = 'Version: '+ constants.REVOKE_VERSION +'\n' +
            'Type: Revocation\n' +
            'Currency: ' + data.currency + '\n' +
            'Issuer: ' + data.pubkey + '\n' +
            'IdtyUniqueID: ' + data.uid + '\n' +
            'IdtyTimestamp: ' + data.blockUid + '\n' +
            'IdtySignature: ' + idtySignature + '\n';


          // Sign revocation document
          return CryptoUtils.sign(revocation, data.keypair)

            // Add revocation to document
            .then(function(signature) {
              revocation += signature + '\n';
              console.debug('Has generate an revocation document:\n----\n' + revocation + '----');
              return revocation;
            });
        });
    },

    /**
     * Send a revocation
     */
    revoke = function() {

      // Clear old events
      cleanEventsByContext('revocation');

      // Get revocation document
      return getRevocationDocument()
        // Send revocation document
        .then(function(revocation) {
          return BMA.wot.revoke({revocation: revocation});
        })

        // Reload requirements
        .then(function() {

          return $timeout(function() {
            return loadRequirements();
          }, 1000); // waiting for node to process membership doc
        })

        .then(function() {
          finishLoadRequirements();

          // Add user event
          addEvent({type:'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'}, true);
        })
        .catch(function(err) {
          if (err && err.ucode == BMA.errorCodes.REVOCATION_ALREADY_REGISTERED) {
            // Already registered by node: just add an event
            addEvent({type:'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'}, true);
          }
          else {
            throw err;
          }
        })
        ;
    },

    revokeWithFile = function(revocation){
      return BMA.wot.revoke({revocation: revocation})
      // Reload requirements
        .then(function() {
          if (isLogin()) {
            return $timeout(function () {
              return loadRequirements();
            }, 1000) // waiting for node to process membership doc

              .then(function () {
                finishLoadRequirements();
                // Add user event
                addEvent({
                  type: 'pending',
                  message: 'INFO.REVOCATION_SENT_WAITING_PROCESS',
                  context: 'requirements'
                }, true);
              })
              .catch(function (err) {
                if (err && err.ucode == BMA.errorCodes.REVOCATION_ALREADY_REGISTERED) {
                  // Already registered by node: just add an event
                  addEvent({
                    type: 'pending',
                    message: 'INFO.REVOCATION_SENT_WAITING_PROCESS',
                    context: 'requirements'
                  }, true);
                }
                else {
                  throw err;
                }
              });
          }
          else {
            addEvent({type: 'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'}, true);
          }
        });

    },

    downloadRevocation = function(){
        return getRevocationDocument()
          .then(function(revocation) {
            var revocationFile = new Blob([revocation], {type: 'text/plain; charset=utf-8'});
            return $translate('ACCOUNT.SECURITY.REVOCATION_FILENAME', {uid: data.uid, currency: data.currency, pubkey: data.pubkey})
              .then(function(fileName){
                FileSaver.saveAs(revocationFile, fileName);
              });
          });
      },

    cleanEventsByContext = function(context){
      data.events = data.events.reduce(function(res, event) {
        if (event.context && event.context == context) return res;
        return res.concat(event);
      },[]);
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json, failIfInvalid) {
      failIfInvalid = angular.isUndefined(failIfInvalid) ? true : failIfInvalid;
      return $q(function(resolve, reject) {
        var obj = JSON.parse(json || '{}');
        // FIXME #379
        /*if (obj && obj.pubkey) {
          resolve({
            pubkey: obj.pubkey
          });
        }
        else */
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
          if (obj.version && obj.keypair.boxPk) {
            var boxPk = new Uint8Array(32);
            for (i = 0; i < 32; i++) boxPk[i] = obj.keypair.boxPk[i];
            keypair.boxPk = boxPk;
          }

          if (obj.version && obj.keypair.boxSk) {
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

    function addListeners() {
      listeners = [
        // Listen if settings changed
        csSettings.api.data.on.changed($rootScope, store, this),
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function ready() {
      if (started) return $q.when();
      return startPromise || start();
    }

    function stop() {
      console.debug('[wallet] Stopping...');
      removeListeners();
      resetData();
    }

    function restart() {
      stop();
      return $timeout(start, 200);
    }

    function start() {
      console.debug('[wallet] Starting...');
      var now = new Date().getTime();

      startPromise = $q.all([
          csSettings.ready(),
          csCurrency.ready(),
          BMA.ready()
        ])

        // Restore
        .then(restore)

        // Load data (if a wallet restored)
        .then(function(data) {
          if (data && data.pubkey) {
            return loadData({minData: true});
          }
        })

        // Emit ready event
        .then(function() {
          addListeners();

          console.debug('[wallet] Started in ' + (new Date().getTime() - now) + 'ms');

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

    // Register extension points
    api.registerEvent('data', 'ready');
    api.registerEvent('data', 'init');
    api.registerEvent('data', 'login');
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'finishLoad');
    api.registerEvent('data', 'logout');
    api.registerEvent('data', 'reset');
    api.registerEvent('action', 'certify');

    // init data
    resetData(true);

    return {
      id: id,
      data: data,
      ready: ready,
      start: start,
      stop: stop,
      // auth
      loginBySalt: loginBySalt, // deprecated
      login: login,
      logout: logout,
      isLogin: isLogin,
      hasSelf: hasSelf,
      isNeverUsed: isNeverUsed,
      isNew: function() {return !!data.isNew;},
      isUserPubkey: isUserPubkey,
      getData: getData,
      loadData: loadData,
      refreshData: refreshData,
      // operations
      transfer: transfer,
      self: self,
      revoke: revoke,
      revokeWithFile: revokeWithFile,
      certify: certify,
      downloadSaveId: downloadSaveId,
      getCryptedId: getCryptedId,
      recoverId: recoverId,
      downloadRevocation: downloadRevocation,
      membership: {
        inside: membership(true),
        out: membership(false)
      },
      events: {
        add: addEvent,
        cleanByContext: cleanEventsByContext
      },
      api: api
    };
  }

  var service = factory('default', BMA);
  service.instance = factory;

  return service;
});
