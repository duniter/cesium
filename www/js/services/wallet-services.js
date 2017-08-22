
angular.module('cesium.wallet.services', ['ngApi', 'ngFileSaver', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('csWallet', function($q, $rootScope, $timeout, $translate, $filter, $ionicHistory, UIUtils,
                              Api, Idle, localStorage, sessionStorage, Modals,
                              CryptoUtils, BMA, csConfig, csSettings, FileSaver, Blob, csWot, csTx, csCurrency) {
  'ngInject';

  function factory(id, BMA) {

    var
    constants = {
      // @Deprecated
      OLD_STORAGE_KEY: 'CESIUM_DATA',
      STORAGE_PUBKEY: 'pubkey',
      STORAGE_SECKEY: 'seckey',
      /* Need for compat with old currencies (test_net and sou) */
      TX_VERSION:   csConfig.compatProtocol_0_80 ? 3 : BMA.constants.PROTOCOL_VERSION,
      IDTY_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      MS_VERSION:   csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      CERT_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      REVOKE_VERSION: csConfig.compatProtocol_0_80 ? 2 : BMA.constants.PROTOCOL_VERSION,
      TX_MAX_INPUTS_COUNT: 40 // Allow to get a TX with less than 100 rows (=max row count in Duniter protocol)
    },
    data = {},
    listeners,
    started,
    startPromise,
    enableAuthIdle = false,
    api = new Api(this, 'csWallet-' + id),

    resetData = function(init) {
      data.loaded = false;
      data.pubkey= null;

      data.uid = null;
      data.isNew = null;
      data.sourcesIndexByKey = null;
      data.medianTime = null;
      data.requirements = {};
      data.blockUid = null;
      data.sigDate = null;
      data.isMember = false;
      data.events = [];

      resetKeypair();
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

    resetKeypair = function(){
      data.keypair = {
        signSk: null,
        signPk: null
      };
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

    // Show login modal
    login = function(options) {
      if (!started) {
        return (startPromise || start())
          .then(function () {
            return login(options); // loop
          });
      }

      var needLogin = !isLogin();
      var needAuth = options && ((options.auth && !isAuth()) || options.forceAuth);

      // user already login
      if (!needLogin && !needAuth) {
        if (!isDataLoaded(options)) {
          return loadData(options);
        }
        return $q.when(data);
      }
      var keepAuth = csSettings.data.keepAuthIdle > 0;

      var authData;
      return (options && options.authData && $q.when(options.authData) ||
        Modals.showLogin(options))
        .then(function(res){
          if (!res || !res.pubkey ||
             (!needLogin && res.pubkey !== data.pubkey) ||
             (needAuth && (!res.keypair || !res.keypair.signPk || !res.keypair.signSk))) {
            throw 'CANCELLED';
          } // invalid data

          authData = res;
          data.pubkey = res.pubkey;
          data.isNew = options && angular.isDefined(options.isNew) ? options.isNew : data.isNew;
          if (keepAuth) {
            data.keypair = res.keypair || {
                signSk: null,
                signPk: null
              };
          }

          if (needLogin) {
            // extend API to check login validity
            return api.data.raisePromise.loginCheck(data)
              .catch(function (err) {
                resetData(); // Reset data if not valid, then exit process
                throw err;
              })
              // Call extend api
              .then(function() {
                if (needLogin) {
                  return api.data.raisePromise.login(data)
                    .catch(function(err) {
                      console.warn('Error during extension call [wallet.api.data.on.login]', err);
                      // continue
                    });
                }
              });
          }
        })

        .then(function() {
          // store wallet if need
          if (csSettings.data.useLocalStorage) {
            store();
          }

          // Send auth event (if need)
          if (needAuth || isAuth()) {
            api.data.raise.auth();

            // Check if need to start/stop auth idle
            checkAuthIdle(true);
          }

          // Load data
          if (!data.loaded) {
            var loadOptions = options && angular.isDefined(options.minData) ? {minData: true} : undefined;
            return loadData(loadOptions);
          }
        }).then(function() {
          if (options && options.silent) {
            UIUtils.loading.hide();
          }

          return keepAuth ? data : angular.merge({}, data, authData);
        })
        .catch(function(err) {
          if (err == 'RETRY' && (!options || !options.authData)) {
            return $timeout(function(){
              return login(options);
            }, 300);
          }
          throw err;
        });
    },

    logout = function() {
      var wasAuth = isAuth();

      return $q(function(resolve, reject) {

        resetData(); // will reset keypair
        store(); // store (if local storage enable)

        // Send logout event
        api.data.raise.logout();

        if (wasAuth) {
          api.data.raise.unauth();
        }

        checkAuthIdle(false);

        $ionicHistory.clearCache();

        resolve();
      });
    },

    isLogin = function() {
      return !!data.pubkey;
    },

    auth = function(options) {
      if (!started) {
        return (startPromise || start())
          .then(function () {
            return auth(options); // loop
          });
      }

      if (isAuth() && (!options || !options.forceAuth)) {
        return $q.when(data);
      }

      options = options || {};
      options.expectedPubkey = isLogin() && data.pubkey;
      options.auth = true;
      return login(options);
    },

    unauth = function() {
      return $q(function(resolve, reject) {

        resetKeypair();
        store();

        // Send unauth event
        api.data.raise.unauth();

        checkAuthIdle(false);

        $ionicHistory.clearCache();

        resolve();
      });
    },

    isAuth = function() {
      return !!(data.pubkey && data.keypair && data.keypair.signSk);
    },


    getKeypair = function(options) {
      if (!started) {
        return (startPromise || start())
          .then(function () {
            return getKeypair(options); // loop
          });
      }

      if (isAuth()) {
        return $q.when(data.keypair);
      }
      options = options || {};
      options.silent = angular.isDefined(options.silent) ? options.silent : true;
      return auth(options)
        .then(function() {
          return data.keypair;
        });
    },

    hasSelf = function() {
      return !!data.pubkey && data.requirements && !data.requirements.needSelf;
    },

    isDataLoaded = function(options) {
      if (options && options.minData) return data.loaded;
      return data.loaded && data.sources;
    },

    isNeverUsed = function() {
      if (!data.loaded) return undefined; // undefined if not full loaded
      return !data.pubkey ||
        (!data.isMember &&
         !data.requirements.pendingMembership &&
         !data.requirements.wasMember &&
         !data.tx.history.length &&
         !data.tx.pendings.length);
    },

    isNew = function() {return !!data.isNew;},

    // If connected and same pubkey
    isUserPubkey = function(pubkey) {
      return isLogin() && data.pubkey === pubkey;
    },

    store = function() {
      if (csSettings.data.useLocalStorage) {

        if (isLogin() && csSettings.data.rememberMe) {

          var jobs = [];

          // Use session storage for secret key - fix #372
          if (csSettings.data.keepAuthIdle == constants.KEEP_AUTH_IDLE_SESSION && isAuth()) {
            jobs.push(sessionStorage.put(constants.STORAGE_SECKEY, CryptoUtils.base58.encode(data.keypair.signSk)));
          }
          else {
            jobs.push(sessionStorage.put(constants.STORAGE_SECKEY, null));
          }

          // Use local storage for pubkey
          jobs.push(localStorage.put(constants.STORAGE_PUBKEY, data.pubkey));
          // Clean old storage
          jobs.push(localStorage.put(constants.OLD_STORAGE_KEY, null));

          return $q.all(jobs).then(function() {
            console.debug('[wallet] saved');
          });
        }
        else {
          return $q.all([
            sessionStorage.put(constants.STORAGE_SECKEY, null),
            localStorage.put(constants.STORAGE_PUBKEY, null),
            // Clean old storage
            localStorage.put(constants.OLD_STORAGE_KEY, null)
          ]);
        }
      }
      else {
        return $q.all([
          sessionStorage.put(constants.STORAGE_SECKEY, null),
          localStorage.put(constants.STORAGE_PUBKEY, null),
          // Clean old storage
          localStorage.put(constants.OLD_STORAGE_KEY, null)
        ]);

      }
    },

    restore = function() {
      return  $q.all([
          sessionStorage.get(constants.STORAGE_SECKEY),
          localStorage.get(constants.STORAGE_PUBKEY)
        ])
        .then(function(res) {
          var seckey = res[0];
          var pubkey = res[1];
          if (!pubkey || pubkey == 'null') return;

          var keypair;
          if (seckey && seckey.length && seckey != 'null') {
            try {
              keypair = {
                signPk: CryptoUtils.util.decode_base58(pubkey),
                signSk: CryptoUtils.util.decode_base58(seckey)
              };
            }
            catch(err) {
              console.warn('[wallet] Secret key restoration failed: ', err);
              keypair = undefined;
            }
          }

          data.pubkey = pubkey;
          data.keypair = keypair || {signPk: undefined, signSk: undefined};

          console.debug('[wallet] Restore \'{0}\' from local storage.'.format(pubkey.substring(0,8)));

          // Call extend api
          return  api.data.raisePromise.login(data);
        })
        .then(function(){
          return data;
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
          resetTxAndSources();
          angular.merge(data, res);
        })
        .catch(function(err) {
          resetTxAndSources();
          throw err;
        });
    },

    // Must be call after loadCurrency() and loadRequirements()
    finishLoadRequirements = function(currency) {
      currency = currency || csCurrency.data;
      data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < currency.parameters.sigQty)) ?
          (currency.parameters.sigQty - data.requirements.certificationCount) : 0;
      data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
          data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < currency.parameters.sigQty) ?
          (currency.parameters.sigQty - data.requirements.certificationCount + data.requirements.willExpireCertificationCount) : 0;
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

      var promise;
      var alertIfUnusedWallet = !csCurrency.data.initPhase && (!csSettings.data.wallet || csSettings.data.wallet.alertIfUnusedWallet) &&
        !data.loaded && (!options || !options.minData);
      if (options && options.minData) {
        promise = loadMinData(options);
      }

      else if (options || data.loaded) {
        promise = refreshData(options);
      }
      else  {
        promise = loadFullData();
      }

      return promise

        // Warn if wallet has been never used - see #167
        .then(function() {
          var showAlert = alertIfUnusedWallet && !isNew() && isNeverUsed();
          if (!showAlert) return true;
          return UIUtils.loading.hide()
            .then(function() {
              return UIUtils.alert.confirm('CONFIRM.LOGIN_UNUSED_WALLET', 'CONFIRM.LOGIN_UNUSED_WALLET_TITLE', {
                cancelText: 'COMMON.BTN_CONTINUE',
                okText: 'COMMON.BTN_RETRY'
              });
            })
            .then(function(retry) {
              if (retry) {
                return logout().then(function() {
                  throw 'RETRY';
                });
              }
              return true;
            });
        })

        // Return wallet data
        .then(function(confirm) {
          if (confirm) {
            return data;
          }
          else { // cancel
            throw 'CANCELLED';
          }
        });
    },

    loadFullData = function() {
      data.loaded = false;

      return $q.all([

          // Get currency
          csCurrency.get(),

          // Get requirements
          loadRequirements(),

          // Get TX and sources
          loadTxAndSources(),

          // Load sigStock
          loadSigStock()
        ])
        .then(function(res) {
          var currency = res[0];
          finishLoadRequirements(currency); // must be call after csCurrency.get() and loadRequirements()

          // API extension
          return api.data.raisePromise.load(data)
            .catch(function(err) {
              console.error('[wallet] Error during load API extension point. Try to continue',err);
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
      options.requirements = angular.isDefined(options.requirements) ? options.requirements :
        (!data.requirements || angular.isUndefined(data.requirements.needSelf));
      if (!options.requirements) {
        return $q.when(data);
      }
      return refreshData(options)
        .then(function(data) {
          data.loaded = true;
          return data;
        });
    },

    refreshData = function(options) {
        options = options || {
          requirements: true,
          sources: true,
          tx: {
            enable: true,
            fromTime: data.tx ? data.tx.fromTime : undefined // keep previous time
          },
          sigStock: true,
          api: true
        };

      // Force some load (requirements) if not already loaded
      options.requirements = angular.isDefined(options.requirements) ? options.requirements : angular.isDefined(data.requirements.needSelf);

      var jobs = [];

      // Reset events
      cleanEventsByContext('requirements');

      // Get requirements
      if (options.requirements) {
        jobs.push($q.all([
            csCurrency.get(),
            loadRequirements()
          ])
          .then(function(res) {
            var currency = res[0];
            finishLoadRequirements(currency);
          }));
      }

      if (options.sources || (options.tx && options.tx.enable)) {
        // Get TX and sources
        jobs.push(loadTxAndSources(options.tx ? options.tx.fromTime: undefined));
      }

      // Load sigStock
      if (options.sigStock) jobs.push(loadSigStock());

      return (jobs.length ? $q.all(jobs) : $q.when())
      .then(function(){
        // API extension (after all other jobs)
        return api.data.raisePromise.load(data);
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
      return $q.all([
          getKeypair(),
          csCurrency.get(),
          csCurrency.blockchain.current()
        ])
        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          var block = res[2];
          if (!BMA.regexp.PUBKEY.test(destPub)){
            throw {message:'ERROR.INVALID_PUBKEY'};
          }
          if (!BMA.regexp.COMMENT.test(comments)){
            throw {message:'ERROR.INVALID_COMMENT'};
          }
          if (!isLogin()){
            throw {message:'ERROR.NEED_LOGIN_FIRST'};
          }
          if (!amount) {
            throw {message:'ERROR.AMOUNT_REQUIRED'};
          }
          if (amount <= 0) {
            throw {message:'ERROR.AMOUNT_NEGATIVE'};
          }
          amount = Math.floor(amount); // remove decimals

          var inputs = {
            amount: 0,
            minBase: block.unitbase,
            maxBase: block.unitbase + 1,
            sources : []
          };

          var logs = [];
          logs.push("[wallet] amount=" + amount);

          // Get inputs, starting to use current base sources
          var amountBase = 0;
          while (inputs.amount < amount && amountBase <= block.unitbase) {
            inputs = getInputs(amount, block.unitbase);

            if (inputs.amount < amount) {
              // try to reduce amount (replace last digits to zero)
              amountBase++;
              if (amountBase <= block.unitbase) {
                amount = truncBase(amount, amountBase);
                logs.push("[wallet] inputs not found. Retrying with amount =" + amount + " be compatible with amountBase=" + amountBase);
              }
            }
          }

          if (inputs.amount < amount) {
            if (data.balance < amount) {
              throw {message:'ERROR.NOT_ENOUGH_CREDIT'};
            }
            else if (inputs.amount === 0) {
              throw {message:'ERROR.ALL_SOURCES_USED'};
            }
            else {
              return $translate('COMMON.UD')
                .then(function(UD) {
                  var params;
                  if(useRelative) {
                    params = {
                      amount: ($filter('formatDecimal')(inputs.amount / currency.currentUD)),
                      unit: UD,
                      subUnit: $filter('abbreviate')(currency.name)
                    };
                  }
                  else {
                    params = {
                      amount: ($filter('formatDecimal')(inputs.amount/100)),
                      unit: $filter('abbreviate')(currency.name),
                      subUnit: ''
                    };
                  }
                  return $translate('ERROR.NOT_ENOUGH_SOURCES', params)
                    .then(function(message) {
                      throw {message: message};
                    });
                });
            }
          }
          // Avoid to get outputs on lower base
          if (amountBase < inputs.minBase && !isBase(amount, inputs.minBase)) {
            amount = truncBaseOrMinBase(amount, inputs.minBase);
            console.debug("[wallet] Amount has been truncate to " + amount);
            logs.push("[wallet] Amount has been truncate to " + amount);
          }
          else if (amountBase > 0) {
            console.debug("[wallet] Amount has been truncate to " + amount);
            logs.push("[wallet] Will use amount truncated to " + amount + " (amountBase="+amountBase+")");
          }

          // Send tx
          return createAndSendTx(currency, block, keypair, destPub, amount, inputs, comments, logs)
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
              return csWot.extendAll([pendingTx], 'pubkey')
                .then(function() {
                  data.tx.pendings.unshift(pendingTx);

                  // API extension
                  api.data.raise.balanceChanged(data);
                  api.data.raise.newTx(data);

                  // Return TX hash (if chained TXs, return the last tx hash) - required by Cesium-API
                  return {
                    hash: res.hash
                  };
                });
            })
            .catch(function(err) {

              // Source already consumed: whould refresh wallet sources
              if (err && err.ucode === BMA.errorCodes.SOURCE_ALREADY_CONSUMED) {
                console.debug('[wallet] TX rejected by node with error [{0}]. Reloading sources then retry...'.format(err.message||'Source already consumed'));
                return $timeout(loadTxAndSources, 500)
                  .then(function() {
                    return transfer(destPub, amount, comments, useRelative);
                  });
              }

              // Error in generated TX - issue #524
              else if (err && err.ucode === BMA.errorCodes.TX_INPUTS_OUTPUTS_NOT_EQUAL) {
                // Ask user to send log to developers
                var esEnable = csSettings.data.plugins && csSettings.data.plugins.es && csSettings.data.plugins.es.enable;
                if (esEnable) {
                  UIUtils.loading.hide();
                  return UIUtils.alert.confirm('CONFIRM.ISSUE_524_SEND_LOG', 'ERROR.POPUP_TITLE', {
                    cssClass: 'warning',
                    okText: 'COMMON.BTN_OK',
                    cancelText: 'COMMON.BTN_NO'
                  })
                  .then(function(confirm) {
                    if (confirm) {
                      api.error.raise.send({
                        title: 'Issue #524 logs',
                        content: 'App version: ' +csConfig.version+'\n'+
                        'App build: ' +csConfig.build+'\n'+
                        'Logs:\n\n' + logs.join('\n')
                      });
                      return $timeout(function() {
                        throw {message: 'ERROR.ISSUE_524_TX_FAILED'};
                      }, 1500);
                    }
                    throw {message: 'ERROR.SEND_TX_FAILED'};
                  });
                }
              }
              throw err;
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
    createAndSendTx = function(currency, block, keypair, destPub, amount, inputs, comments, logs) {

      // Make sure a TX in compact mode has no more than 100 lines (fix #118)
      // (If more than 100 lines, send to TX to himself first, then its result as sources for the final TX)
      if (inputs.sources.length > constants.TX_MAX_INPUTS_COUNT) {
        console.debug("[Wallet] TX has to many sources. Will chain TX...");

        // Compute a slice of sources
        var firstSlice = {
          minBase: block.unitbase,
          maxBase: 0,
          amount: 0,
          sources: inputs.sources.slice(0, constants.TX_MAX_INPUTS_COUNT) /* end index is excluded, so array length=TX_MAX_INPUTS_COUNT - issue #524 */
        };
        _.forEach(firstSlice.sources, function(source) {
          if (source.base < firstSlice.minBase) firstSlice.minBase = source.base;
          if (source.base > firstSlice.maxBase) firstSlice.maxBase = source.base;
          firstSlice.amount += powBase(source.amount, source.base);
        });

        // Send inputs first slice
        return createAndSendTx(currency, block, keypair, data.pubkey/*to himself*/, firstSlice.amount, firstSlice, undefined/*comment not need*/, logs)
          .then(function(res) {
            _.forEach(firstSlice.sources, function(source) {
              source.consumed=true;
            });
            addSources(res.sources);

            var secondSlice = {
              minBase: block.unitbase,
              maxBase: 0,
              amount: 0,
              sources: inputs.sources.slice(constants.TX_MAX_INPUTS_COUNT).concat(res.sources)
            };
            _.forEach(secondSlice.sources, function(source) {
              if (source.base < secondSlice.minBase) secondSlice.minBase = source.base;
              if (source.base > secondSlice.maxBase) secondSlice.maxBase = source.base;
              secondSlice.amount += source.amount;
            });

            // Send inputs second slice (recursive call)
            return createAndSendTx(currency, block, keypair, destPub, amount, secondSlice, comments, logs);
          });
      }

      var tx = 'Version: '+ constants.TX_VERSION +'\n' +
        'Type: Transaction\n' +
        'Currency: ' + currency.name + '\n' +
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

      // Append to logs (need to resolve issue #524)
      if (logs) {
        if (destPub == data.pubkey) {
          logs.push('[wallet] Creating new TX, using inputs:\n - minBase: '+inputs.minBase+'\n - maxBase: '+inputs.maxBase);
        }
        else {
          logs.push('[wallet] Creating new TX, using inputs:\n - minBase: '+inputs.minBase+'\n - maxBase: '+inputs.maxBase + '\n - sources (=TX inputs):');
        }
        _.forEach(inputs.sources, function(source) {
          logs.push([source.amount, source.base, source.type, source.identifier,source.noffset].join(':'));
        });
        logs.push("\n[wallet] generated TX document (without signature) :\n------ START ------\n" + tx + "------ END ------\n");
      }

      return CryptoUtils.sign(tx, keypair)
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
                tx: signedTx,
                hash: txHash,
                sources: newSources
              };
            });
        });
    },

    getIdentityDocument = function(currency, keypair, uid, blockUid) {
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
        'Currency: ' + currency.name + '\n' +
        'Issuer: ' + data.pubkey + '\n' +
        'UniqueID: ' + uid + '\n' +
        'Timestamp: ' + blockUid + '\n';
      return CryptoUtils.sign(identity, keypair)
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
          getKeypair(),
          csCurrency.get(),
          csCurrency.blockchain.current()
        ])
        // Create identity document
        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          block = res[2];
          return getIdentityDocument(currency, keypair, uid, block.number + '-' + block.hash);
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

        return $q.all([
            getKeypair(),
            csCurrency.blockchain.current()
          ])
          .then(function(res) {
            var keypair = res[0];
            var block = res[1];
            // Create membership to sign
            membership = 'Version: '+ constants.MS_VERSION +'\n' +
              'Type: Membership\n' +
              'Currency: ' + block.currency + '\n' +
              'Issuer: ' + data.pubkey + '\n' +
              'Block: ' + block.number + '-' + block.hash + '\n' +
              'Membership: ' + (!!sideIn ? "IN" : "OUT" ) + '\n' +
              'UserID: ' + data.uid + '\n' +
              'CertTS: ' + data.blockUid + '\n';

            return CryptoUtils.sign(membership, keypair);
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
      return $q.all([
          getKeypair(),
          csCurrency.get(),
          csCurrency.blockchain.current()
        ])
        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          var block = res[2];
          // Create the self part to sign
          var cert = 'Version: '+ constants.CERT_VERSION +'\n' +
            'Type: Certification\n' +
            'Currency: ' + currency.name + '\n' +
            'Issuer: ' + data.pubkey + '\n' +
            'IdtyIssuer: ' + pubkey + '\n' +
            'IdtyUniqueID: ' + uid + '\n' +
            'IdtyTimestamp: ' + timestamp + '\n' +
            'IdtySignature: ' + signature + '\n' +
            'CertTimestamp: ' + block.number + '-' + block.hash + '\n';

          return CryptoUtils.sign(cert, keypair)
            .then(function(signature) {
              var signedCert = cert + signature + '\n';
              return BMA.wot.certify({cert: signedCert});
            })
            .then(function() {
              var cert = {
                pubkey: pubkey,
                uid: uid,
                time: block.medianTime,
                isMember: isMember,
                wasMember: wasMember,
                expiresIn: currency.parameters.sigWindow,
                pending: true,
                block: block.number,
                valid: true
              };

              // Notify extension
              api.action.raise.certify(cert);

              return cert;
            });
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
        return CryptoUtils.scryptKeypair(salt, pwd)
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
      return $q.all([
          getKeypair(),
          csCurrency.get()
        ])

        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          // get the Identity document
          return getIdentityDocument(currency, keypair)

            // Create membership document (unsigned)
            .then(function(identity){
              var identityLines = identity.trim().split('\n');
              var idtySignature = identityLines[identityLines.length-1];

              var revocation = 'Version: '+ constants.REVOKE_VERSION +'\n' +
                'Type: Revocation\n' +
                'Currency: ' + currency.name + '\n' +
                'Issuer: ' + data.pubkey + '\n' +
                'IdtyUniqueID: ' + data.uid + '\n' +
                'IdtyTimestamp: ' + data.blockUid + '\n' +
                'IdtySignature: ' + idtySignature + '\n';


              // Sign revocation document
              return CryptoUtils.sign(revocation, keypair)

              // Add revocation to document
                .then(function(signature) {
                  revocation += signature + '\n';
                  console.debug('Has generate an revocation document:\n----\n' + revocation + '----');
                  return revocation;
                });
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
      return $q.all([
          csCurrency.get(),
          BMA.wot.revoke({revocation: revocation})
        ])
        // Reload requirements
        .then(function(res) {
          var currency = res[0];
          if (isLogin()) {
            return $timeout(function () {
              return loadRequirements();
            }, 1000) // waiting for node to process membership doc
            .then(function () {
              finishLoadRequirements(currency);
            })
            .catch(function (err) {
              if (err && err.ucode == BMA.errorCodes.REVOCATION_ALREADY_REGISTERED) {
                // Already registered by node: just add an event
                addEvent({type: 'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'}, true);
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
        return $q.all([
            csCurrency.get(),
            getRevocationDocument()
          ])
          .then(function(res) {
            var currency = res[0];
            var revocation = res[1];
            var revocationFile = new Blob([revocation], {type: 'text/plain; charset=utf-8'});
            return $translate('ACCOUNT.SECURITY.REVOCATION_FILENAME', {
              uid: data.uid,
              currency: currency.name,
              pubkey: data.pubkey
            })
            .then(function (fileName) {
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
    },

    checkAuthIdle = function(isAuth) {
      isAuth = angular.isDefined(isAuth) ? isAuth : isAuth();
      var enable = isAuth && csSettings.data.keepAuthIdle > 0 && csSettings.data.keepAuthIdle != csSettings.constants.KEEP_AUTH_IDLE_SESSION;
      var changed = (enableAuthIdle != enable);

      // need start/top watching
      if (changed) {
        // start idle
        if (enable) {
          console.debug("[wallet] Start idle (delay: {0}s)".format(csSettings.data.keepAuthIdle));
          Idle.setIdle(csSettings.data.keepAuthIdle);
          Idle.watch();
        }
        // stop idle, if need
        else if (enableAuthIdle){
          console.debug("[wallet] Stop idle");
          Idle.unwatch();
        }
        enableAuthIdle = enable;
      }

      // if idle time changed: apply it
      else if (enable && Idle.getIdle() !== csSettings.data.keepAuthIdle) {
        console.debug("[idle] Updating auth idle (delay: {0}s)".format(csSettings.data.keepAuthIdle));
        Idle.setIdle(csSettings.data.keepAuthIdle);
      }
    };

    function addListeners() {
      listeners = [
        // Listen if settings changed
        csSettings.api.data.on.changed($rootScope, store, this),
        csSettings.api.data.on.changed($rootScope, checkAuthIdle, this),
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];

      $rootScope.$on('IdleStart', unauth);
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

    function start(options) {
      options = options || {};
      options.skipRestore =  angular.isDefined(options.skipRestore) ? options.skipRestore : false;

      console.debug('[wallet] Starting...');
      var now = new Date().getTime();

      startPromise = $q.all([
          csSettings.ready(),
          csCurrency.ready(),
          BMA.ready()
        ]);

      // Restore
      if (!options.skipRestore) startPromise = startPromise.then(restore);

      // Emit ready event
      startPromise.then(function() {
          addListeners();

          console.debug('[wallet] Started in ' + (new Date().getTime() - now) + 'ms');

          started = true;
          startPromise = null;
        })
        .then(function(){
          return data;
        });

      return startPromise;
    }

    // Register extension points
    api.registerEvent('data', 'init');
    api.registerEvent('data', 'loginCheck'); // allow to stop the login process
    api.registerEvent('data', 'login'); // executed after login check (cannot stop the login process)
    api.registerEvent('data', 'auth');
    api.registerEvent('data', 'unauth');
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'logout');
    api.registerEvent('data', 'reset');

    api.registerEvent('error', 'send');

    // Data changed : balance changed, new TX
    api.registerEvent('data', 'balanceChanged');
    api.registerEvent('data', 'newTx');

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
      login: login,
      logout: logout,
      auth: auth,
      unauth: unauth,
      isLogin: isLogin,
      isAuth: isAuth,
      getKeypair: getKeypair,
      hasSelf: hasSelf,
      isDataLoaded : isDataLoaded,
      isNeverUsed: isNeverUsed,
      isNew: isNew,
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
