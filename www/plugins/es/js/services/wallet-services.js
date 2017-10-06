angular.module('cesium.es.wallet.services', ['ngResource', 'cesium.platform', 'cesium.es.http.services', 'cesium.es.crypto.services'])

  .factory('esWallet', function($q, $rootScope, CryptoUtils, csPlatform, csWallet, esCrypto, esProfile, esHttp) {
    'ngInject';

    var
      listeners,
      that = this;

    function onWalletReset(data) {
      data.avatar = null;
      data.profile = null;
      data.name = null;
      csWallet.events.cleanByContext('esWallet');
      if (data.keypair) {
        delete data.keypair.boxSk;
        delete data.keypair.boxPk;
      }
    }

    function onWalletAuth(data, deferred) {
      deferred = deferred || $q.defer();

      // Generate box keypair
      esCrypto.box.getKeypair(data.keypair)
        .then(function(res) {
          csWallet.data.keypair.boxSk = res.boxSk;
          csWallet.data.keypair.boxPk = res.boxPk;
          console.debug("[ES] [wallet] Box keypair successfully computed");
          deferred.resolve();
        });
      return deferred.promise;
    }

    function onWalletUnauth(data) {
      data = data || csWallet.data;
      if (data.keypair) {
        delete data.keypair.boxSk;
        delete data.keypair.boxPk;
      }
    }

    function onWalletLogin(data, deferred) {
      deferred = deferred || $q.defer();
      if (!data || !data.pubkey || !data.keypair) {
        deferred.resolve();
        return deferred.promise;
      }

      // Waiting to load crypto libs
      if (!CryptoUtils.isLoaded()) {
        console.debug('[ES] [wallet] Waiting crypto lib loading...');
        return $timeout(function() {
          return onWalletLogin(data, deferred);
        }, 50);
      }

      console.debug('[ES] [wallet] Loading user avatar+name...');
      var now = new Date().getTime();

      esProfile.getAvatarAndName(data.pubkey)
        .then(function(profile) {
          if (profile) {
            data.name = profile.name;
            data.avatarStyle = profile.avatarStyle;
            data.avatar = profile.avatar;
            console.debug('[ES] [wallet] Loaded user avatar+name in '+ (new Date().getTime()-now) +'ms');
          }
          else {
            console.debug('[ES] [wallet] No user avatar+name found');
          }
          deferred.resolve(data);
        })
        .catch(function(err){
          deferred.reject(err);
        });

      return deferred.promise;
    }

    function onWalletLoad(data, deferred) {
      deferred = deferred || $q.defer();

      // Reset events
      csWallet.events.cleanByContext('esWallet');

      // If membership pending, but not enough certifications: suggest to fill user profile
      if (!data.name && data.requirements.pendingMembership && data.requirements.needCertificationCount > 0) {
        csWallet.events.add({type:'info', message: 'ACCOUNT.EVENT.MEMBER_WITHOUT_PROFILE', context: 'esWallet'});
      }

      console.debug('[ES] [wallet] Loading full user profile...');
      var now = new Date().getTime();

      // Load full profile
      esProfile.get(data.pubkey)
        .then(function(profile) {
          if (profile) {
            data.name = profile.name;
            data.avatar = profile.avatar;
            data.profile = profile.source;
            data.profile.description = profile.description;
            console.debug('[ES] [wallet] Loaded full user profile in '+ (new Date().getTime()-now) +'ms');
          }
          deferred.resolve();
        });

      return deferred.promise;
    }

    function getBoxKeypair() {
      if (!csWallet.isAuth()) {
        throw new Error('Unable to get box keypair: user not authenticated !');
      }

      return csWallet.getKeypair({silent: true})
        .then(function(keypair) {
          if (keypair && keypair.boxPk && keypair.boxSk) {
            return $q.when(csWallet.data.keypair);
          }
          return esCrypto.box.getKeypair(keypair);
        })
        .then(function(res) {
          csWallet.data.keypair.boxSk = res.boxSk;
          csWallet.data.keypair.boxPk = res.boxPk;
          console.debug("[ES] [wallet] Box keypair successfully computed");
          return csWallet.data.keypair;
        });
    }

    function addListeners() {
      // Extend csWallet events
      listeners = [
        csWallet.api.data.on.login($rootScope, onWalletLogin, this),
        csWallet.api.data.on.load($rootScope, onWalletLoad, this),
        csWallet.api.data.on.init($rootScope, onWalletReset, this),
        csWallet.api.data.on.reset($rootScope, onWalletReset, this),
        csWallet.api.data.on.unauth($rootScope, onWalletUnauth, this),
        csWallet.api.data.on.auth($rootScope, onWalletAuth, this)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function refreshState() {
      var enable = esHttp.alive;
      if (!enable && listeners && listeners.length > 0) {
        console.debug("[ES] [wallet] Disable");
        removeListeners();
        if (csWallet.isLogin()) {
          return onWalletReset(csWallet.data);
        }
      }
      else if (enable && (!listeners || listeners.length === 0)) {
        console.debug("[ES] [wallet] Enable");
        addListeners();
        if (csWallet.isLogin()) {
          return onWalletLogin(csWallet.data);
        }
      }
    }

    // Default action
    csPlatform.ready().then(function() {
      esHttp.api.node.on.start($rootScope, refreshState, this);
      esHttp.api.node.on.stop($rootScope, refreshState, this);
      return refreshState();
    });

    // exports
    that.box = {
      getKeypair: getBoxKeypair,
      record: {
        pack: function(record, keypair, recipientFieldName, cypherFieldNames, nonce) {
          return getBoxKeypair()
            .then(function(keypair) {
              return esCrypto.box.pack(record, keypair, recipientFieldName, cypherFieldNames, nonce);
            });
        },
        open: function(records, keypair, issuerFieldName, cypherFieldNames) {
          return getBoxKeypair()
            .then(function(keypair) {
              return esCrypto.box.open(records, keypair, issuerFieldName, cypherFieldNames);
            });
        }
      }
    };

    return that;
  })
;
