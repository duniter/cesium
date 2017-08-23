angular.module('cesium.api.demo.services', ['cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services', 'cesium.settings.services'])


  .factory('csDemoWallet', function($rootScope, $timeout, $controller, $state, $q, $translate, $filter,
                                    BMA, CryptoUtils) {
    'ngInject';

    function factory(authData) {

      var demoPubkey;

      return {
        start: function() {
          return $q.when();
        },
        login: function() {
          var self = this;
          return $translate('API.TRANSFER.DEMO.PUBKEY')
            .then(function(pubkey) {
              demoPubkey = pubkey;
              if (!authData || authData.pubkey != demoPubkey) {
                throw {message: 'API.TRANSFER.DEMO.BAD_CREDENTIALS'};
              }
              self.data = {
                keypair: authData.keypair
              };
              return {
                uid: 'Demo',
                pubkey: demoPubkey
              };
            });
        },
        transfer: function(pubkey, amount, comment) {
          var self = this;
          return BMA.blockchain.current()
            .then(function(block) {
              var tx = 'Version: '+ BMA.constants.PROTOCOL_VERSION +'\n' +
                'Type: Transaction\n' +
                'Currency: ' + block.currency + '\n' +
                'Blockstamp: ' + block.number + '-' + block.hash + '\n' +
                'Locktime: 0\n' + // no lock
                'Issuers:\n' +
                demoPubkey + '\n' +
                'Inputs:\n' +
                [amount, block.unitbase, 'T', 'FakeId27jQMAf3jqL2fr75ckZ6Jgi9TZL9fMf9TR9vBvG', 0].join(':')+ '\n' +
                'Unlocks:\n' +
                '0:SIG(0)\n' +
                'Outputs:\n' +
                [amount, block.unitbase, 'SIG(' + pubkey + ')'].join(':')+'\n' +
                'Comment: '+ (comment||'') + '\n';

              return CryptoUtils.sign(tx, self.data.keypair)
                .then(function(signature) {
                  var signedTx = tx + signature + "\n";
                  return CryptoUtils.util.hash(signedTx)
                    .then(function(txHash) {
                      return $q.when({
                        tx: signedTx,
                        hash: txHash
                      });
                    });
                });
            });
        }
      };
    }

    return {
      instance: factory
    };
  })
;
