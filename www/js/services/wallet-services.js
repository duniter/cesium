
angular.module('cesium.wallet.services', ['ngApi', 'ngFileSaver', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])


.factory('csWallet', function($q, $rootScope, $timeout, $translate, $filter, $ionicHistory, UIUtils,
                              Api, Idle, localStorage, sessionStorage, Modals, Device,
                              CryptoUtils, csCrypto, BMA, csConfig, csSettings, FileSaver, csWot, csTx, csCurrency) {
  'ngInject';

  var defaultBMA = BMA;
  var service;

  function CsWallet(id, BMA) {

    BMA = BMA || defaultBMA;
    var
    exports,
    constants = {
      STORAGE_PUBKEY: 'pubkey',
      STORAGE_UID: 'uid',
      STORAGE_DATA_PREFIX: 'data-',
      STORAGE_SECKEY: 'seckey',
      /* Need for compat with old currencies (test_net and sou) */
      TX_VERSION:   BMA.constants.PROTOCOL_VERSION,
      IDTY_VERSION: BMA.constants.PROTOCOL_VERSION,
      MS_VERSION:   BMA.constants.PROTOCOL_VERSION,
      CERT_VERSION: BMA.constants.PROTOCOL_VERSION,
      REVOKE_VERSION: BMA.constants.PROTOCOL_VERSION,
      TX_MAX_INPUTS_COUNT: 40 // Allow to get a TX with less than 100 rows (=max row count in Duniter protocol)
    },
    data = {},
    settings,
    listeners,
    started,
    startPromise,
    loadPromise,
    enableAuthIdle = false,
    api = new Api(this, 'csWallet-' + id),

    resetData = function(init) {
      data.loaded = false;
      data.pubkey = null;
      data.checksum = null;
      data.qrcode=null;

      data.uid = null;
      data.localName = null;
      data.isNew = null;
      data.sourcesIndexByKey = null;
      data.medianTime = null;
      data.requirements = {};
      data.blockUid = null;
      data.sigDate = null;
      data.sigStock = null;
      data.isMember = false;
      data.events = [];

      // children's wallets
      data.children = [];

      // Encrypted (need auth() to be encrypted)
      data.encryptedData = null;

      resetKeypair();
      resetTxAndSources();

      started = false;
      startPromise = undefined;

      if (init) {
        api.data.raise.init(data);
      }
      else {
        if (isDefault() && settings && !settings.useLocalStorage) {
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

    resetSources = function(){
      // reset sources data
      data.sources = undefined;
      data.sourcesIndexByKey = undefined;
      data.balance = 0;
    },

    resetTx = function(){
      // reset TX data
      data.tx = data.tx || {};
      data.tx.history = [];
      data.tx.pendings = [];
      data.tx.validating = [];
      data.tx.errors = [];
      delete data.tx.fromTime;
      delete data.tx.toTime;
    },

    resetTxAndSources = function(){
      // reset sources data
      resetSources();
      // reset TX data
      resetTx();
    },

    isDefault = function(){
      return id === 'default';
    },

    hasEncryptedData = function(){
      return data.encryptedData && data.encryptedData.nonce && data.encryptedData.content;
    },

    addSource = function(src, sources, sourcesIndexByKey) {
      var srcKey = src.type+':'+src.identifier+':'+src.noffset;
      if (angular.isUndefined(sourcesIndexByKey[srcKey])) {
        if (!src.conditions) {
          console.warn("Trying to add a source without output condition !", src);
        }
        sources.push(src);
        sourcesIndexByKey[srcKey] = sources.length - 1;
      }
    },

    addSources = function(sources) {
      data.sources = data.sources || [];
      data.sourcesIndexByKey = data.sourcesIndexByKey || {};
      _.forEach(sources, function(src) {
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
      return (options && options.authData ? $q.when(options.authData) : Modals.showLogin(options))
        .then(function(res){
          if (!res || !res.pubkey ||
             (!needLogin && res.pubkey !== data.pubkey) ||
             (needAuth && (!res.keypair || !res.keypair.signPk || !res.keypair.signSk))) {
            throw 'CANCELLED';
          } // invalid data

          authData = res;
          data.pubkey = authData.pubkey;
          data.uid = authData.uid || data.uid;
          data.isNew = options && angular.isDefined(options.isNew) ? options.isNew : data.isNew;
          if (keepAuth) {
            data.keypair = authData.keypair || {
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
          // Read data from pubkey (when first login)
          if (needLogin) {
            return restoreData();
          }
          // Or the was login but now auth: just try to decrypt data
          else if (needAuth) {
            return openEncryptedData();
          }
        })

        .then(function() {
          if (needLogin) {

            // store wallet
            store();
          }

          // Send auth event (if need)
          if (needAuth || isAuth()) {
            // Check if need to start/stop auth idle
            checkAuthIdle(true);

            return api.data.raisePromise.auth(keepAuth ? data : authData);
          }
        })
        .then(function() {
          // Load data if need
          // If user just login, force data full load (even if min data asked)
          // because the user can wait (after the login modal)
          var loadOptions = !needLogin && options && options.minData ? {minData: true} : undefined/*=load all*/;
          if (!isDataLoaded(loadOptions)) {
            return loadData(loadOptions);
          }
        })
        .then(function() {
          if (options && options.silent) {
            UIUtils.loading.hide(10);
          }
          else {
            UIUtils.loading.hide(1000);
          }

          return keepAuth ? data : angular.merge({}, data, authData);
        })
        .catch(function(err) {
          if (err === 'RETRY' && (!options || !options.authData)) {
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

        var pubkey = data.pubkey;
        resetData(); // will reset keypair
        resetStore(pubkey); // reset store

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

      // Disable auth, if readonly or demo
      if (csConfig.readonly || csConfig.demo) {
        return UIUtils.alert.demo()
          .then(function() {
            throw 'CANCELLED';
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
      return data.pubkey && data.keypair && data.keypair.signSk && true;
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
      return !!data.pubkey && !data.requirements.needSelf;
    },

    isDataLoaded = function(options) {
      if (options) {
        if (options.minData && !options.sources) return data.loaded && true;
        if (options.requirements && !data.requirements.loaded) return false;
        if (options.tx && options.tx.enable && (!data.tx.fromTime || data.tx.fromTime === 'pending')) return false;
        if (options.sigStock && !data.sigStock) return false;
      }
      return data.loaded && data.sources && true;
    },

    isNeverUsed = function() {
      if (!data.loaded) return undefined; // undefined if not full loaded
      return !data.pubkey || !(
         // Check registration
         data.isMember ||
         data.requirements.pendingMembership ||
         data.requirements.revoked ||
         !data.requirements.needSelf ||
         data.requirements.wasMember ||

         // Check sources
        (data.sources && data.sources.length > 0) ||

         // Check TX history
         data.tx.history.length > 0 ||
         data.tx.validating.length > 0 ||
         data.tx.pendings.length > 0 ||

         // Check extended data (name+avatar)
         !!data.localName ||
         !!data.name ||
         !!data.avatar
        );
    },

    isNew = function() {return !!data.isNew;},

    // If connected and same pubkey
    isUserPubkey = function(pubkey) {
      return isLogin() && data.pubkey === pubkey;
    },

    // store pubkey and uid
    store = function(pubkey) {
      pubkey = pubkey && typeof pubkey == 'string' ? pubkey : data.pubkey;
      if (settings && settings.useLocalStorage) {

        if (isLogin() && settings.rememberMe) {

          var now = Date.now();
          console.debug("[wallet] Storing...");

          var jobs = [];

          // Use session storage for secret key - fix #372
          if (settings.keepAuthIdle == csSettings.constants.KEEP_AUTH_IDLE_SESSION && isAuth()) {
            jobs.push(sessionStorage.put(constants.STORAGE_SECKEY, CryptoUtils.util.encode_base58(data.keypair.signSk)));
          }
          else {
            jobs.push(sessionStorage.put(constants.STORAGE_SECKEY, null));
          }

          // Use local storage for pubkey
          jobs.push(localStorage.put(constants.STORAGE_PUBKEY, data.pubkey));

          // Use local storage for uid - fix #625
          if (data.uid) {
            jobs.push(localStorage.put(constants.STORAGE_UID, data.uid));
          }
          else {
            jobs.push(localStorage.put(constants.STORAGE_UID, null));
          }

          return $q.all(jobs)
            .then(function() {
              console.debug("[wallet] Stored in "+ (Date.now() - now) +"ms");
            });
        }
        else {
          // Resetting local storage
          return $q.all([
            sessionStorage.put(constants.STORAGE_SECKEY, null),
            localStorage.put(constants.STORAGE_PUBKEY, null),
            localStorage.put(constants.STORAGE_UID, null),
            // Clean data (only in the session storage - keep local)
            pubkey ? sessionStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when()
          ]);
        }
      }
      else {
        return $q.all([
          sessionStorage.put(constants.STORAGE_SECKEY, null),
          localStorage.put(constants.STORAGE_PUBKEY, null),
          localStorage.put(constants.STORAGE_UID, null),
          // Clean data
          pubkey ? sessionStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when(),
          pubkey ? localStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when()
        ]);
      }
    },

    // reset data store for this pubkey
    resetStore = function(pubkey) {

      console.debug("[wallet] Resetting stored pubkey (and uid) in local storage...");

      sessionStorage.put(constants.STORAGE_SECKEY, null);
      localStorage.put(constants.STORAGE_PUBKEY, null);
      localStorage.put(constants.STORAGE_UID, null);

      if (settings && settings.useLocalStorage) {
        // Clean data (only in the session storage - keep local)
        return pubkey ? sessionStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when();
      }
      else {
        console.debug("[wallet] Resetting stored data in local storage...");
        return $q.all([
          pubkey ? sessionStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when(),
          pubkey ? localStorage.put(constants.STORAGE_DATA_PREFIX + pubkey, null) : $q.when()
        ]);
      }
    },

    // store children wallet, notifications read Time, ...
    storeData = function() {
      if (!isLogin()) throw {message:'ERROR.NEED_LOGIN_FIRST'};

      var useEncryption = settings && settings.useLocalStorageEncryption;
      var storageKey = constants.STORAGE_DATA_PREFIX + data.pubkey;

      var content; // Init only if used
      var secureContent; // Init only if used

      // Add time
      if (data.notifications && data.notifications.time) {
        content = content || {};
        content.notifications = {
          time: data.notifications.time
        };
      }
      if (data.invitations && data.invitations.time) {
        content = content || {};
        content.invitations = {
          time: data.invitations.time
        };
      }

      // Add children wallets
      if (data.children && data.children.length) {
        // remember children count - need when data still encrypted, by method getChildrenCount()
        content = content || {};
        content.childrenCount = data.children.length;

        secureContent = secureContent || {}; // Init th secured content
        // Add children wallet
        secureContent.children = _.map(data.children, function(wallet) {
          return {
            pubkey: wallet.data.pubkey,
            uid: wallet.data.uid,
            localName: wallet.data.localName
          };
        });
      }
      var contentStr = (content || secureContent) && JSON.stringify(angular.merge({}, content||{}, secureContent||{}));

      // Not encryption (or nothing to secure content): store without encryption
      if (!useEncryption || !secureContent) {
        return $q.all([
          sessionStorage.put(storageKey, null), // clear session storage (not used if no encryption)
          localStorage.put(storageKey, contentStr || null)
        ]);
      }

      // Encryption is enable, but user not auth: use the session storage
      // (and keep the local storage value)
      if (!isAuth()) {
        return sessionStorage.put(storageKey, contentStr||null);
      }

      return $q.all([
        // Get a unique nonce
        CryptoUtils.util.random_nonce(),
        // Get box keypair
        CryptoUtils.box.keypair.fromSignKeypair(data.keypair),
        // Put also (without encryption) in the session storage
        sessionStorage.put(storageKey, contentStr || null)
      ])
      .then(function(res) {
        var nonce = res[0];
        var keypair = res[1];

        return CryptoUtils.box.pack(JSON.stringify(secureContent), nonce, keypair.boxPk, keypair.boxSk)
          .then(function(cypherContent) {
            content = angular.merge(content||{}, {
              encryptedData: {
                nonce: CryptoUtils.util.encode_base58(nonce),
                content: cypherContent
              }
            });
            //console.debug("[wallet] Storing with encryption: ", content);
            return localStorage.put(storageKey, JSON.stringify(content));
          });
      });
    },

    restore = function() {
      return  $q.all([
          sessionStorage.get(constants.STORAGE_SECKEY),
          localStorage.get(constants.STORAGE_PUBKEY),
          localStorage.get(constants.STORAGE_UID)
        ])
        .then(function(res) {
          var seckey = res[0];
          var pubkey = res[1];
          var uid = res[2];
          if (!pubkey || pubkey === 'null') return;

          console.debug('[wallet] Restore {' + pubkey.substring(0, 8) + '} from local storage');

          var keypair;
          if (seckey && seckey.length && seckey !== 'null') {
            try {
              keypair = {
                signPk: CryptoUtils.util.decode_base58(pubkey),
                signSk: CryptoUtils.util.decode_base58(seckey)
              };
            }
            catch (err) {
              console.warn('[wallet] Secret key restoration failed: ', err);
              keypair = undefined;
            }
          }

          data.pubkey = pubkey;
          data.uid = uid && uid != 'null' ? uid : undefined;
          data.keypair = keypair || {signPk: undefined, signSk: undefined};

          // Get pubkey's data
          return restoreData();
        })

        .then(function() {
          // Successful restored: raise API events
          if (isAuth()) {
            return $q.all([
              api.data.raisePromise.login(data),
              checkAuthIdle(true),
              api.data.raisePromise.auth(data)
            ])
              .catch(function(err) {
                console.warn('Error during extension call [wallet.api.data.on.auth]', err);
                // continue
              });
          }
          else if (isLogin()) {
            return api.data.raisePromise.login(data)
              .catch(function(err) {
                console.warn('Error during extension call [wallet.api.data.on.login]', err);
                // continue
              });
          }
        })

        .then(function(){
          return data;
        });
    },

    restoreData = function() {
      if (!isLogin()) throw {message:'ERROR.NEED_LOGIN_FIRST'};
      if (isNew()) return $q.when(data); // Skip restore
      // Get pubkey's data
      return $q.all([
        sessionStorage.getObject(constants.STORAGE_DATA_PREFIX + data.pubkey),
        localStorage.getObject(constants.STORAGE_DATA_PREFIX + data.pubkey)
      ])
      // Apply data, first from the session storage, then from local storage
      .then(function (res) {
        var sessionStorageData = res[0];
        var localStorageData = res[1];
        if (sessionStorageData && sessionStorageData.children && sessionStorageData.children.length === localStorageData.childrenCount) {
          return applyRestoredData(sessionStorageData)
            .catch(function(err) {
              console.error("[wallet] Failed to restore from the session storage ! Retrying from the local storage...", err);
              // Retry using another storage
              return applyRestoredData(localStorageData);
            });
        }
        return applyRestoredData(localStorageData);
      });
    },

    applyRestoredData = function(content) {
      if (!content) return $q.when(); // skip

      // Apply children
      if (content.children) {
        var oldChildrenCount = data.childrenCount;
        var oldChildren = removeAllChildrenWallets({
          stop: false, /*do not stop wallet*/
          store: false/*skip store*/
        });

        try {
          var pubkeys = {};
          _.forEach(content.children, function(child) {
            if (!pubkeys[child.pubkey]) { // make sure wallet is unique by pubkey
              pubkeys[child.pubkey] = true;
              var wallet = newChildInstance();
              wallet.data.pubkey = child.pubkey;
              wallet.data.localName = child.localName;
              wallet.data.uid = child.uid;
              addChildWallet(wallet, {store: false/*skip store*/});
            }
          });
          delete content.children;
          // childrenCount not need anymore
          delete data.childrenCount;
        }
        catch(err) {
          console.error("[wallet] Failed to restore children wallet.", err);
          // Restore removed values
          data.childrenCount = oldChildrenCount;
          data.children = oldChildren;
          return $q.reject({message:'ERROR.RESTORE_WALLET_LIST_FAILED'});
        }

        // Restoration succeed: stop old children
        _.forEach(oldChildren||[], function(child) {
          child.stop();
        });
      }

      // make sure to remove pubkey before copy
      delete content.pubkey;
      delete content.uid;

      // Copy to data
      angular.merge(data, content);

      // If auth: open encrypted data
      if (hasEncryptedData() && isAuth()) {
        return openEncryptedData({store: false})
          .then(function(){
            return data; // Important: return the data
          });
      }

      return $q.when(data); // Important: return the data
    },

    getData = function() {
      return data;
    },

    loadRequirements = function(withCache, secondTry) {
      // Clean existing events
      cleanEventsByContext('requirements');

      // Get requirements
      return csWot.loadRequirements(data, withCache)
        .catch(function(err) {
          // Retry once (can be a timeout, because Duniter node are long to response)
          if (!secondTry) {
            console.error("[wallet] Unable to load requirements (first try): {0}. Retrying once...".format(err && err.message || err), err);
            UIUtils.loading.update({template: "COMMON.LOADING_WAIT"});
            return loadRequirements(withCache, true);
          }
          console.error("[wallet] Unable to load requirements (after a second try): {0}".format(err && err.message || err), err);
          throw err;
        });
    },

    loadTxAndSources = function(fromTime) {
      // DEBUG
      //console.debug('[wallet-service] Calling loadTxAndSources() from time ' + fromTime);

      if (fromTime === 'pending') {
        UIUtils.loading.update({template: "INFO.LOADING_PENDING_TX"});
      }
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

    loadSources = function() {
      return csTx.loadSources(data.pubkey)
        .then(function(res){
          resetSources();
          angular.merge(data, res);
        })
        .catch(function(err) {
          resetSources();
          throw err;
        });
    },

    /**
     * Add user events (generate events from requirements)
     */
    addEvents = function() {
      if (data.requirements.revoked) {
        delete data.requirements.meta.invalid;
        addEvent({type:'info', message: 'ERROR.WALLET_REVOKED', context: 'requirements'});
      }
      else if (data.requirements.pendingRevocation) {
        delete data.requirements.meta.invalid;
        addEvent({type:'pending', message: 'INFO.REVOCATION_SENT_WAITING_PROCESS', context: 'requirements'});
      }

      // If not revoked
      else {
        if (!data.isMember && data.requirements.meta && data.requirements.meta.invalid) {
          addEvent({type: 'error', message: 'ERROR.WALLET_INVALID_BLOCK_HASH', context: 'requirements'});
          console.debug("Invalid membership for uid={0}: block hash changed".format(data.uid));
        }
        // Check if self expired
        else if (!data.isMember && data.requirements.expired) {
          addEvent({type: 'error', message: 'ERROR.WALLET_IDENTITY_EXPIRED', context: 'requirements'});
          console.debug("Identity expired for uid={0}.".format(data.uid));
        }
        // Pending membership
        else if (data.requirements.pendingMembership) {
          addEvent({type:'pending', message: 'ACCOUNT.WAITING_MEMBERSHIP', context: 'requirements'});

          // Add a warning when out distanced
          // (only if has enough certification - fix #808)
          if (!data.requirements.needCertificationCount && data.requirements.outdistanced) {
            addEvent({type:'warn', message: 'ACCOUNT.OUT_DISTANCED', context: 'requirements'});
          }
        }
        // If user has send a SELF, ask for membership - fix #625
        else if (!data.requirements.needSelf && data.requirements.needMembership){
          addEvent({type:'warn', message: 'ACCOUNT.NO_WAITING_MEMBERSHIP', context: 'requirements'});
        }

        if (data.requirements.needRenew) {
          // Still a member: WILL need renew
          if (data.isMember && data.requirements.membershipExpiresIn > 0) {
            addEvent({type:'warn', message: 'ACCOUNT.WILL_NEED_RENEW_MEMBERSHIP', messageParams: data.requirements, context: 'requirements'});
          }
          // Fix #649: Not a member anymore, even if membership NOT expired, because membersjip cancelled for lack of certifications
          else if (!data.isMember && data.requirements.membershipExpiresIn > 0 && data.requirements.needCertificationCount > 0) {
            addEvent({type:'warn', message: 'ACCOUNT.NEED_RENEW_MEMBERSHIP_AFTER_CANCELLED', messageParams: data.requirements, context: 'requirements'});
          }
          // Not a member anymore
          else {
            addEvent({type:'warn', message: 'ACCOUNT.NEED_RENEW_MEMBERSHIP', messageParams: data.requirements, context: 'requirements'});
          }
        }
        else
        {
          if (data.requirements.needCertificationCount > 0) {
            addEvent({type:'info', message: 'ACCOUNT.WAITING_CERTIFICATIONS', messageParams: data.requirements, context: 'requirements'});
            // Add a help message, if user has never been a member
            if (!data.requirements.wasMember) {
              addEvent({
                type: 'help',
                message: 'ACCOUNT.WAITING_CERTIFICATIONS_HELP',
                messageParams: data.requirements,
                context: 'requirements'
              });
            }
          }
          if (data.requirements.willNeedCertificationCount > 0) {
            addEvent({type:'warn', message: 'ACCOUNT.WILL_MISSING_CERTIFICATIONS', messageParams: data.requirements, context: 'requirements'});
          }
          if (data.requirements.wasMember && data.requirements.needMembership) {
            addEvent({type:'warn', message: 'ACCOUNT.NEED_RENEW_MEMBERSHIP', messageParams: data.requirements, context: 'requirements'});
          }
          // Add a warning when out distanced - fix #777
          if (!data.requirements.needCertificationCount && !data.requirements.willNeedCertificationCount && data.requirements.outdistanced) {
            addEvent({type:'warn', message: 'ACCOUNT.OUT_DISTANCED', context: 'requirements'});
          }
        }
      }
    },

    loadSigStock = function() {
      // Get certified by, then count written certification
      return BMA.wot.certifiedBy({pubkey: data.pubkey})
        .then(function(res){
          data.sigStock = !res.certifications ? 0 : res.certifications.reduce(function(res, cert) {
            return cert.written === null ? res : res+1;
          }, 0);
        })
        .catch(function(err) {
          if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) {
            data.sigStock = 0;
          }
          /*FIXME: workaround for Duniter issue #1309 */
          else if (!!err && err.ucode == 1002) {
            console.warn("[wallet-service] Detecting Duniter issue #1309 ! Applying workaround... ");
            data.sigStock = 0;
          }
          else {
            throw err;
          }
        });
    },

    loadQrCode = function(){
      if (!data.pubkey || data.qrcode) return $q.when(data.qrcode);
      console.debug("[wallet] Creating SVG QRCode...");
      return $timeout(function() {
        data.qrcode = UIUtils.qrcode.svg(data.pubkey);
        return data.qrcode;
      });
    },

    loadData = function(options) {

      var alertIfUnusedWallet = !csCurrency.data.initPhase && (!csSettings.data.wallet || csSettings.data.wallet.alertIfUnusedWallet) &&
        !data.loaded && (!options || !options.minData || !options.silent);

      // Make sure to load once at a time
      if (loadPromise) {
        return loadPromise.then(function() {
          return isDataLoaded(options) ? data : refreshData(options);
        });
      }

      if (options && options.minData) {
        loadPromise = loadMinData(options);
      }
      else if (options || data.loaded) {
        loadPromise = refreshData(options);
      }
      else  {
        loadPromise = loadFullData();
      }

      return $q.all([
        loadPromise,

        // Create the QR code
        loadQrCode(),

        // Compute the checksum (if need)
        csCrypto.ready().then(function() {
          data.checksum = data.checksum || csCrypto.util.pkChecksum(data.pubkey);
        })
      ])
        .then(function() {

          // Warn if wallet has been never used - see #167
          var unused = alertIfUnusedWallet && isNeverUsed();
          var showAlert = alertIfUnusedWallet && !isNew() && unused === true;
          if (!showAlert) return true;
          return UIUtils.loading.hide()
            .then(function () {
              return UIUtils.alert.confirm('CONFIRM.LOGIN_UNUSED_WALLET', 'CONFIRM.LOGIN_UNUSED_WALLET_TITLE', {
                cancelText: 'COMMON.BTN_CONTINUE',
                okText: 'COMMON.BTN_RETRY'
              });
            })
            .then(function (retry) {
              if (retry) {
                return logout().then(function () {
                  throw 'RETRY';
                });
              } else {
                // Remembering to not ask for confirmation
                if (csSettings.data.wallet.alertIfUnusedWallet) {
                  csSettings.data.wallet.alertIfUnusedWallet = false;
                  csSettings.store();
                }
              }
              return true;
            });
        })

        // Return wallet data
        .then(function(confirm) {
          loadPromise = null;
          if (confirm) {
            return data;
          }
          else { // user cancelled
            throw 'CANCELLED';
          }
        })
        .catch(function(err) {
          loadPromise = null;
          console.error('[wallet] Failed to load wallet data', err);
          throw err;
        });
    },

    loadFullData = function(fromTime) {
      data.loaded = false;

      var now = Date.now();
      console.debug("[wallet] Loading {{0}} full data...".format(data.pubkey && data.pubkey.substr(0,8)));

      return $q.all([

          // Get requirements
          loadRequirements(true)
            .then(function(data) {
              if (data.requirements && (data.requirements.isMember || data.requirements.wasMember)) {
                // Load sigStock
                return loadSigStock();
              }
              else {
                data.sigStock = 0;
              }
            }),

          // Get TX and sources (only pending by default)
          loadTxAndSources(fromTime || 'pending')
        ])
        .then(function() {

          // Load wallet events
          addEvents();

          // API extension
          return api.data.raisePromise.load(data)
            .catch(function(err) {
              console.error('[wallet] Error during load API extension point. Try to continue',err);
            });
        })
        .then(function() {
          data.loaded = true;
          console.debug("[wallet] Loaded {{0}} full data in {1}ms".format(data.pubkey && data.pubkey.substr(0,8), Date.now() - now));

          // Make sure to hide loading, because sometimes it stay - should fix freeze screen
          UIUtils.loading.hide(1000);
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
        (!data.requirements.loaded || angular.isUndefined(data.requirements.needSelf));
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
          fromTime: data.tx && data.tx.fromTime !== 'pending' ? data.tx.fromTime : undefined // keep previous time
        },
        sigStock: true,
        api: true
      };

      // Force some load (requirements) if not already loaded
      options.requirements = angular.isDefined(options.requirements) ? options.requirements : !data.requirements.loaded;

      // Force sources when TX enable
      if (angular.isUndefined(options.sources) && options.tx && options.tx.enable) {
        options.sources = true;
      }

      var jobs = [];

      var now = Date.now();
      console.debug("[wallet] {0} {{1}} data, with options: ".format(!data.loaded ? 'Loading' : 'Refreshing', data.pubkey.substr(0,8)), options);

      // Get requirements
      if (options.requirements) {
        // Reset events
        cleanEventsByContext('requirements');

        jobs.push(
          loadRequirements(true)

            // Add wallet events
            .then(addEvents)
        );
      }

      if (options.sources && (!options.tx || options.tx.enable)) {
        // Get TX and sources
        jobs.push(loadTxAndSources(options.tx ? options.tx.fromTime: undefined));
      }

      else if (options.sources && (options.tx && !options.tx.enable)) {
        // Get sources and only pending TX (and NOT the TX history)
        jobs.push(loadTxAndSources('pending'));
      }

      // Load sigStock
      if (options.sigStock) jobs.push(loadSigStock());

      return (jobs.length ? $q.all(jobs) : $q.when())
        .then(function() {
          // Skip api
          if (angular.isDefined(options.api) && !options.api) return data;

          // API extension (after all other jobs)
          return api.data.raisePromise.load(data)
            .then(function(){

              console.debug("[wallet] {0} {{1}} data in {2}ms".format(!data.loaded ? 'Loaded' : 'Refreshed', data.pubkey.substr(0,8), Date.now() - now));

              // Compute if full loaded
              if (!data.loaded) {
                data.loaded = data.requirements.loaded && data.sources && true;
              }

              return data;
            });
        })
        .catch(function(err) {
          console.error("[wallet] Error while {0} data: {1}".format(!data.loaded ? 'Loading' : 'Refreshing', (err && err.message || err)), err);
          data.loaded = data.requirements.loaded && data.sources && true;
          throw err;
        });
    },

    setSelf = function(uid, blockUid){
      // Skip if same self
      if (data.uid == uid && (!blockUid || data.blockUid == blockUid)) return $q.when();

      // Data not loaded
      if (!data.loaded) {
        return !loadPromise ?
          // If no pending load: ok
          $q.when() :
          // If a load is running: force a reload
          loadPromise.then(function() {
            return setSelf(uid, blockUid); // loop
          });
      }

      data.uid = uid;
      data.blockUid = blockUid;

      // Refresh requirements
      return refreshData({requirements: true, sigStock: true})
        .then(function() {
          // Store (to remember the new uid)
          return store({skipData: true});
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
      _.find(data.sources || [], function(source) {
        if (!source.consumed && source.base === filterBase &&
          // Filter on simple SIG output condition - fix #845
          BMA.regexp.TX_OUTPUT_SIG.exec(source.conditions)
        ) {
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
    transfer = function(destPub, amount, comments, useRelative, restPub, block) {
      return $q.all([
          getKeypair(),
          csCurrency.get(),
          block && $q.when(block) || csCurrency.blockchain.current(true)
        ])
        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          block = res[2];
          if (!BMA.regexp.PUBKEY.test(destPub)){
            throw {message:'ERROR.INVALID_PUBKEY'};
          }
          if (!BMA.regexp.COMMENT.test(comments)){
            throw {message:'ERROR.INVALID_COMMENT'};
          }
          if (!isLogin()){
            throw {message:'ERROR.NEED_LOGIN_FIRST'};
          }
          if (destPub === data.pubkey){
            throw {message:'ERROR.SAME_TX_RECIPIENT'};
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
          return createAndSendTx(currency, block, keypair, destPub, amount, inputs, comments, restPub||data.pubkey, logs)
            .then(function(res) {
              data.balance -= res.amount;
              if (data.balance < 0) data.balance = 0; // fix #712
              _.forEach(inputs.sources, function(source) {
                source.consumed=true;
              });

              // Add new sources
              if (res && res.sources.length) {
                console.debug("[wallet-service] New sources to be add after the TX: ", res.sources);
                addSources(res.sources);
              }

              // Add TX to pendings
              var pendingTx = {
                time: csCurrency.date.now(),
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
                    return transfer(destPub, amount, comments, useRelative, restPub, block);
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
     * Send a WIF wallet
     */
    transferAll = function(destPub, amount, comments, useRelative, restPub) {
      if (!isLogin()) return $q.reject({message:'ERROR.NEED_LOGIN_FIRST'});

      if (!restPub || destPub == restPub) {
        return $q.reject({message: "Could not have same pubkey for 'destPub' and 'restPub'"});
      }

      return csCurrency.blockchain.lastValid()
        .then(function(block) {
          console.debug("[wallet] Using last valid block as TX reference (to avoid network fork): ", block);

          return transfer(destPub, amount, comments, useRelative, restPub, block)
            .then(function() {
              // If more money: transfer all to restPub
              if (data.balance > 0 && restPub) {
                console.debug("[wallet] Wallet has some more money: transfering fund to [{0}]".format(restPub.substring(0,8)));
                return transfer(restPub, data.balance, undefined/*comments*/, false/*useRelative*/, restPub, block);
              }
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
    createAndSendTx = function(currency, block, keypair, destPub, amount, inputs, comments, restPub, logs) {

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
        return createAndSendTx(currency, block, keypair, data.pubkey/*to himself*/,  firstSlice.amount, firstSlice, undefined/*comment not need*/, data.pubkey/*rest to himself*/, logs)
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
              secondSlice.amount += powBase(source.amount, source.base);
            });

            // Send inputs second slice (recursive call)
            return createAndSendTx(currency, block, keypair, destPub, amount, secondSlice, comments, restPub, logs);
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
      // Outputs to restPub
      while(rest > 0) {
        outputAmount = truncBase(rest, outputBase);
        rest -= outputAmount;
        if (outputAmount > 0) {
          outputAmount = outputBase === 0 ? outputAmount : outputAmount / Math.pow(10, outputBase);
          tx += outputAmount +':'+outputBase+':SIG('+restPub+')\n';
          // If rest to himself: add new sources
          if (data.pubkey === restPub) {
            newSources.push({
              type: 'T',
              noffset: outputOffset,
              amount: outputAmount,
              base: outputBase,
              conditions: 'SIG('+restPub+')',
              consumed: false
            });
          }
          outputOffset++;
        }
        outputBase--;
      }

      tx += "Comment: "+ (comments||"") + "\n";

      // Append to logs (need to resolve issue #524)
      if (logs) {
        if (destPub === data.pubkey) {
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
          return processTx(signedTx)
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
                amount: (data.pubkey === destPub) ? 0 : ((data.pubkey === restPub) ? amount : inputs.amount),
                tx: signedTx,
                hash: txHash,
                sources: newSources
              };
            });
        });
    },

    processTx = function(signedTx) {
      // Send to default BMA node
      return BMA.tx.process({transaction: signedTx})
        .catch(function(err) {
          if (err.ucode === BMA.errorCodes.TX_ALREADY_PROCESSED) {
            return; // continue
          }

          // TX sandbox is full: retry using random peers
          if (err.ucode === BMA.errorCodes.TRANSACTIONS_SANDBOX_FULL) {
            console.warn('[wallet] Node sandbox is full! Will send TX to some random peers...');
            return processTxRandomPeer(signedTx)
              .then(function(success) {
                if (success) return; // OK, continue

                // If all random peers failed: rethrow the original error
                throw {ucode: BMA.errorCodes.TRANSACTIONS_SANDBOX_FULL, message: 'ERROR.TX_SANDBOX_FULL'};
              });
          }

          // Other error
          throw err;
        })
        ;
    },

    processTxRandomPeer = function(signedTx, n, timeout) {
      n = n || 3;
      timeout = timeout || csConfig.timeout;

      // Select some peers
      var randomPeers = _.sample(csSettings.data.network && csSettings.data.network.peers || [], n);
      if (!randomPeers.length) {
        return $q.resolve(false); // Skip, if no peers
      }

      console.warn('[wallet] Sending TX to {0} random peers...'.format(randomPeers.length));

      return $q.all(
        _.map(randomPeers, function(peer) {
          var bma = BMA.lightInstance(peer.host, peer.port, peer.path, peer.useSsl, timeout);
          return bma.tx.process({transaction: signedTx})
            .then(function() {
              return true;
            })
            .catch(function(err) {
              if (err.ucode === BMA.errorCodes.TX_ALREADY_PROCESSED) {
                return true;
              }
              return false;
            });
        }))
        .then(function(res) {
          var succeedPeers = _.filter(randomPeers, function(peer, index) {
            return res[index];
          });
          if (succeedPeers.length) {
            console.info('[wallet] TX successfully sent to {0} random peers'.format(succeedPeers.length), succeedPeers);
            return true; // succeed
          }
          return false; // succeed
        });
    },

    getIdentityDocument = function(currency, keypair, uid, blockUid) {
      uid = uid || data.uid;
      blockUid = blockUid || data.blockUid;
      if (!uid || !blockUid) {
        throw {message: 'ERROR.WALLET_HAS_NO_SELF'};
      }
      if (data.requirements.expired) {
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
          csCurrency.blockchain.lastValid()
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
            return loadRequirements(false/*no cache*/)

              // Add wallet events
              .then(addEvents);
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
            csCurrency.blockchain.lastValid()
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
              return loadRequirements(false /*no cache*/);
            }, 1000); // waiting for node to process membership doc
          })

          // Add wallet events
          .then(addEvents);
      };
    },

    /**
    * Send identity certification
    */
    certify = function(uid, pubkey, timestamp, signature, isMember, wasMember) {
      return $q.all([
          getKeypair(),
          csCurrency.get(),
          csCurrency.blockchain.lastValid()
        ])
        .then(function(res) {
          var keypair = res[0];
          var currency = res[1];
          var block = res[2];

          // Check if member account
          if (!data.isMember && !csConfig.initPhase) {
            throw {message:'ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION'};
          }

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
        .then(CryptoUtils.util.random_nonce)
        .then(function(nonce) {
          record.nonce = CryptoUtils.util.encode_base58(nonce);
          return $q.all([
            CryptoUtils.box.pack(record.salt, nonce, record.keypair.boxPk, record.keypair.boxSk),
            CryptoUtils.box.pack(record.pwd, nonce, record.keypair.boxPk, record.keypair.boxSk)
          ]);
        })
        .then(function (res) {
          record.salt = res[0];
          record.pwd = res[1];
          return record;
        });
    },

    recoverId = function(recover) {
      if (!recover || !recover.cypherNonce || !recover.cypherSalt || !recover.cypherPwd) {
        throw {message:'ERROR.INVALID_FILE_FORMAT'};
      }
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
          console.warn('Incorrect answers: unable to recover identifiers', err);
          throw new Error('Incorrect answers: unable to recover identifiers');
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

      return $q.all([
        csCurrency.get(),
        getSaveIDDocument(record),
      ])
        .then(function(res) {
          var currency = res[0];
          var document= res[1];
          return $translate('ACCOUNT.SECURITY.SAVE_ID_FILENAME', {
            currency: currency.name,
            pubkey: data.pubkey
          })
            .then(function(filename){
              return Device.file.save(document, {filename: filename});
            });
        });
    },

    downloadKeyFile = function(format){
      if (!isAuth()) return $q.reject('user not authenticated');

      return $q.all([
          csCurrency.get(),
          csCrypto.keyfile.generateContent(data.keypair,
            {
              type: format,
              password: function() {
                UIUtils.loading.hide();
                return Modals.showPassword({
                    title: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.TITLE',
                    subTitle: 'ACCOUNT.SECURITY.KEYFILE.PASSWORD_POPUP.HELP'
                  })
                  .then(function(password) {
                    return UIUtils.loading.show(10)
                      .then(function(){
                        return password;
                    });
                  });
              }
          })
        ])
        .then(function(res) {
          var currency = res[0];
          var document = res[1];
          return $translate('ACCOUNT.SECURITY.KEYFILE_FILENAME', {
              currency: currency.name,
              pubkey: data.pubkey,
              format: format,
            })
            .then(function(filename){
              return Device.file.save(document, {filename: filename});
            });
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
            return loadRequirements(false/*no cache*/);
          }, 1000); // waiting for node to process membership doc
        })

        // Add wallet events
        .then(addEvents)

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
          BMA.wot.revoke({revocation: revocation})
        ])
        // Reload requirements
        .then(function(res) {
          if (isLogin()) {
            return $timeout(function () {
              return loadRequirements(false/*no cache*/);
            }, 1000) // waiting for node to process membership doc

             // Add wallet events
            .then(addEvents)

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
          return $translate('ACCOUNT.SECURITY.REVOCATION_FILENAME', {
            uid: data.uid,
            currency: currency.name,
            pubkey: data.pubkey
          })
          .then(function (filename) {
            return Device.file.save(revocation, {filename: filename});
          });
        });
    },

    cleanEventsByContext = function(context){
      data.events = data.events.reduce(function(res, event) {
        if (event.context && event.context == context) return res;
        return res.concat(event);
      },[]);
    },

    /* -- children wallets -- */

    setParentWallet = function(parentWallet) {
      listeners = listeners || [];
      var listener;
      _.forEach(['load', 'reset'], function(method) {
        listener = api.data.on[method]($rootScope, function(data, deferred) {
          deferred = deferred || $q.defer();
          parentWallet.api.data.raisePromise[method](data)
            .then(deferred.resolve)
            .catch(deferred.reject);
          return deferred.promise;
        }, this);
        listeners.push(listener);
      });

      // Unauth when parent wallet unauth
      listener = parentWallet.api.data.on.unauth($rootScope, function() {
        if (isAuth()) unauth();
      }, this);
      listeners.push(listener);
    },

    createNewChildWallet = function(options) {
      var wallet = newChildInstance();
      addChildWallet(wallet, options);
      return wallet;
    },

    addChildWallet = function(wallet, options) {
      // Link to parent
      wallet.children.setParent(exports); // = link to self wallet

      data.children = data.children || [];
      data.children.push(wallet);

      // Store (store children locally)
      if (!options || angular.isUndefined(options.store) || options.store) {
        return storeData();
      }
      return $q.when();
    },

    removeAllChildrenWallets = function(options) {

      // stop/unauth all existing wallets
      if (!options || options.stop) {
        _.forEach(data.children || [], function(wallet){
          wallet.stop();
        });
      }
      var removedChildren = data.children.splice(0, data.children.length);

      // Store (store children locally)
      if (!options || angular.isUndefined(options.store) || options.store) {
        return storeData();
      }
      return removedChildren;

    },

    removeChildWalletById = function(id, options) {
      data.children = data.children || [];
      var childIndex = _.findIndex(data.children, function(child) {return child.id === id;});
      if (childIndex === -1) {
        console.warn('[wallet] Unable to remove child wallet {{0}} (not found)'.format(id));
        throw new Error('Wallet with id {{0}} not found'.format(id));
      }
      // Remove the wallet, and return it
      var wallet = data.children.splice(childIndex, 1)[0];

      // Force to stop without calling api
      wallet.stop();

      // Store (store children locally)
      if (!options || options.store !== false) {
        return storeData();
      }
      return $q.when();
    },

    getChildWalletById = function(id) {
      return (id !== 'default') && _.find(data.children|| [], function(child) {return child.id === +id;}) || undefined;
    },

    getChildWalletByPubkey = function(pubkey) {
      return _.find(data.children|| [], function(child) {return child.isUserPubkey(pubkey);});
    },

    hasChildrenWithPubkey = function(pubkey) {
      return !!getChildWalletByPubkey(pubkey);
    },

    getChildrenWalletCount =  function() {
      return angular.isDefined(data.childrenCount) ? data.childrenCount : (data.children && data.children.length || 0);
    },

    newChildInstance =  function() {
      // Return max(id) + 1
      var walletId = (data.children || []).reduce(function(res, wallet) {
          return Math.max(res, wallet.id);
        }, 0) + 1;
      return service.instance(walletId, BMA);
    },

    getAllChildrenWallet = function() {
      return openEncryptedData()
        .then(function() {
          return data.children;
        });
    },

    getAllPubkeys = function() {
      if (!data.pubkey) throw new Error('User not login!');
      return (data.children || []).reduce(function(res, wallet) {
        return wallet.data.pubkey ? res.concat(wallet.data.pubkey) : res;
      }, [data.pubkey]);
    },

    getByPubkey = function(pubkey) {
      if (!pubkey) throw new Error("Missing 'pubkey' argument !");
      if (!data.pubkey) throw new Error('User not login!');
      if (data.pubkey === pubkey) return exports; // main wallet
      return getChildWalletByPubkey(pubkey);
    },

    downloadChildrenWalletFile = function() {
      return $q.all([
        getAllChildrenWallet(),
        csCurrency.get()
      ])
        .then(function(res) {
          var children = res[0];
          var currency = res[1];
          var content = (children||[]).reduce(function(res, wallet) {
            return res + [wallet.data.pubkey, wallet.data.uid, wallet.data.localName||wallet.data.name].join('\t') + '\n';
          }, '');
          return $translate('ACCOUNT.WALLET_LIST.EXPORT_FILENAME', {
              pubkey: data.pubkey,
              currency: currency.name,
            })
            .then(function(filename) {
              return Device.file.save(content, {filename: filename});
            });
        });
    },

    /* -- END children wallets -- */

    openEncryptedData = function(options) {
      if (!hasEncryptedData()) return $q.when();
      if (!isAuth()) return auth().then(openEncryptedData); // Force auth if need

      // Open encrypted data
      return CryptoUtils.box.keypair.fromSignKeypair(data.keypair)
        .then(function(keypair) {
          var nonce = CryptoUtils.util.decode_base58(data.encryptedData.nonce);
          return CryptoUtils.box.open(data.encryptedData.content, nonce, keypair.boxPk, keypair.boxSk);
        })
        // Then apply
        .then(function(content) {
          data.encryptedData = null; // reset encrypted data
          var promise = applyRestoredData(JSON.parse(content));

          // Store (store data into session storage)
          if (!options || angular.isUndefined(options.store) || options.store) {
            promise.then(function() {
              return storeData();
            });
          }

          return promise;
        })
        ;
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json, failIfInvalid) {
      failIfInvalid = angular.isUndefined(failIfInvalid) ? true : failIfInvalid;
      return $q(function(resolve, reject) {
        var obj;
        try {
          obj = JSON.parse(json || '{}');
        }
        catch(err) { /* invalid JSON : continue*/}

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

    checkAuthIdle = function(isAuthResult) {
      isAuthResult = angular.isDefined(isAuthResult) ? isAuthResult : isAuth();
      var newEnableAuthIdle = isAuthResult && settings && settings.keepAuthIdle > 0 && settings.keepAuthIdle != csSettings.constants.KEEP_AUTH_IDLE_SESSION;
      var changed = (enableAuthIdle != newEnableAuthIdle);

      // need start/top watching
      if (changed) {
        // start idle
        if (newEnableAuthIdle) {
          console.debug("[wallet] Start idle (delay: {0}s)".format(settings.keepAuthIdle));
          Idle.setIdle(settings.keepAuthIdle);
          Idle.watch();
        }
        // stop idle, if was enable
        else if (enableAuthIdle){
          console.debug("[wallet] Stop idle");
          Idle.unwatch();
        }
        enableAuthIdle = newEnableAuthIdle;
      }

      // if idle time changed: apply it
      else if (newEnableAuthIdle && Idle.getIdle() !== settings.keepAuthIdle) {
        console.debug("[idle] Updating auth idle (delay: {0}s)".format(settings.keepAuthIdle));
        Idle.setIdle(settings.keepAuthIdle);
      }

      // Make sure to store seckey, in the session storage for secret key -fix #372
      var storeSecKey = isAuthResult && settings && settings.keepAuthIdle == csSettings.constants.KEEP_AUTH_IDLE_SESSION && true;
      if (storeSecKey) {
        sessionStorage.put(constants.STORAGE_SECKEY, CryptoUtils.util.encode_base58(data.keypair.signSk));
      }
      // Make sure to clean previous seckey, if exists in session storage
      else if (changed) {
        sessionStorage.put(constants.STORAGE_SECKEY, null);
      }
    };

    function getWalletSettings(settings) {
      return settings && {
        useLocalStorage: settings.useLocalStorage,
        useLocalStorageEncryption: settings.useLocalStorageEncryption,
        rememberMe: settings.rememberMe,
        keepAuthIdle: settings.keepAuthIdle
      };
    }

    function onSettingsChanged(allSettings) {
      var newSettings = getWalletSettings(allSettings);
      var hasChanged = !angular.equals(settings, newSettings);
      if (!hasChanged || !settings) return; // skip

      var useEncryptionChanged = !angular.equals(settings.useLocalStorageEncryption, newSettings.useLocalStorageEncryption);
      var useStorageChanged = !angular.equals(settings.useLocalStorage, newSettings.useLocalStorage) || useEncryptionChanged;
      var keepAuthIdleChanged = !angular.equals(settings.keepAuthIdle, newSettings.keepAuthIdle);

      settings = newSettings;

      if (keepAuthIdleChanged) {
        checkAuthIdle();
      }

      // Local storage option changed
      if (useStorageChanged) {

        // If disabled, then reset the store
        if (!settings.useLocalStorage) {
          resetStore(data.pubkey);
        }
        // If storage enable
        else {
          // Store login data
          return store()
            .then(function() {

              // Encryption enable: auth before saving data
              if (data.childrenCount > 0 && useEncryptionChanged && settings.useLocalStorageEncryption) {
                return auth({minData: true, silent: true})
                  .catch(function(err){
                    // user not auth: revert encryption to false
                    if (err === 'CANCELLED') {
                      csSettings.apply({useLocalStorageEncryption: false});
                      return csSettings.store();
                    }
                    else {
                      throw err;
                    }
                  });
              }
            })

            // Store other data (children wallet, ...)
            .then(storeData);
        }
      }
    }

    function addListeners() {
      listeners = [
        // Listen if settings changed
        csSettings.api.data.on.changed($rootScope, onSettingsChanged, this),
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];

      $rootScope.$on('IdleStart', unauth);
    }

    function addListener(listener) {
      listeners = listeners || [];
      listeners.push(listener);
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

    function stop(options) {
      if (!started && !startPromise) return $q.when();

      var wasLogin = isLogin();
      var wasAuth = isAuth();

      console.debug('[wallet] Stopping...');
      removeListeners();

      if (!options || options.emitEvent !== false) {
        // Reset all data
        resetData();

        // Send logout/unauth events
        if (wasLogin) api.data.raise.logout();
        if (wasAuth) api.data.raise.unauth();
      }
      else {
        // Just mark as need to reload
        data.loaded = false;
      }

      return $q.when();
    }

    function restart() {
      stop();
      return $timeout(start, 200);
    }

    function start(options) {
      options = options || {};
      // By default, restore if the service is the default object
      options.restore =  angular.isDefined(options.restore) ? options.restore : (id === 'default');

      console.debug('[wallet] Starting...');
      var now = Date.now();

      startPromise = $q.all([
          csSettings.ready()
            .then(function() {
              settings = getWalletSettings(csSettings.data);
            }),
          csCurrency.ready(),
          BMA.ready()
        ]);

      // Restore
      if (options.restore) startPromise = startPromise.then(restore);

      // Emit ready event
      startPromise.then(function() {
          addListeners();

          console.debug('[wallet] Started in ' + (Date.now() - now) + 'ms');

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
    api.registerEvent('data', 'store');

    api.registerEvent('error', 'send');

    // Data changed : balance changed, new TX
    api.registerEvent('data', 'balanceChanged');
    api.registerEvent('data', 'newTx');

    api.registerEvent('action', 'certify');


    // init data
    resetData(true);

    // Override default store/restore function,  when not the 'default' wallet
    if (id !== "default") {
      //start = $q.when;
      //started = true;
      store = $q.when;
      restore = $q.when;
      restoreData = $q.when;
      //checkAuthIdle = function(){};
    }

    exports = {
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
      setSelf: setSelf,
      isMember: function() {
        return data.isMember;
      },
      isDataLoaded : isDataLoaded,
      isDefault: isDefault,
      isNeverUsed: isNeverUsed,
      isNew: isNew,
      isUserPubkey: isUserPubkey,
      getData: getData,
      loadQrCode: loadQrCode,
      loadData: loadData,
      refreshData: refreshData,
      // internal
      internal: {
        addListener: addListener,
        removeListeners: removeListeners
      },
      // local storage
      store: store,
      storeData: storeData, // store children wallet, readTime, etc.
      // operations
      transfer: transfer,
      transferAll: transferAll,
      self: self,
      revoke: revoke,
      revokeWithFile: revokeWithFile,
      certify: certify,
      downloadSaveId: downloadSaveId,
      getCryptedId: getCryptedId,
      recoverId: recoverId,
      downloadRevocation: downloadRevocation,
      downloadKeyFile: downloadKeyFile,
      pubkeys: getAllPubkeys,
      getByPubkey: getByPubkey,
      membership: {
        inside: membership(true),
        out: membership(false)
      },
      events: {
        add: addEvent,
        cleanByContext: cleanEventsByContext
      },
      children: {
        create: createNewChildWallet,
        add: addChildWallet,
        remove: removeChildWalletById,
        get: getChildWalletById,
        getByPubkey: getChildWalletByPubkey,
        all: getAllChildrenWallet,
        setParent: setParentWallet,
        count: getChildrenWalletCount,
        hasPubkey: hasChildrenWithPubkey,
        instance: newChildInstance,
        downloadFile: downloadChildrenWalletFile
      },
      api: api
    };
    return exports;
  }

  service = CsWallet('default', BMA);
  service.instance = CsWallet;

  return service;
});
