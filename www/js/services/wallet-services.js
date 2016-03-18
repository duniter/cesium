//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.wallet.services', ['ngResource', 'cesium.bma.services', 'cesium.crypto.services'])

.factory('Wallet', ['CryptoUtils', 'BMA', '$q', function(CryptoUtils, BMA, $q) {

  Wallet = function(id) {

    var

    USE_RELATIVE_DEFAULT = true,

    createData = function() {
      return {
        pubkey: null,
        keypair: {
            signSk: null,
            signPk: null
        },
        balance: 0,
        sources: null,
        useRelative: USE_RELATIVE_DEFAULT,
        currency: null,
        currentUD: null,
        history: {},
        requirements: null,
        loaded: false
      };
    },

    data = createData(),

    reduceTx = function(txArray) {
        var list = [];
        txArray.forEach(function(tx) {
            var issuerIndex = -1;
            var issuer = tx.issuers.reduce(function(issuer, res, index) {
                issuerIndex = (res == data.pubkey) ? index : issuerIndex;
                return issuer + ((res != data.pubkey) ? ', ' + res : '');
            }, ', ').substring(2);
            var amount =
                tx.inputs.reduce(function(sum, input) {
                    var inputArray = input.split(':',5);
                    return sum - ((inputArray[0] == issuerIndex) ? parseInt(inputArray[4]) : 0);
                }, 0);
            amount += tx.outputs.reduce(function(sum, output) {
                    var outputArray = output.split(':',2);
                    return sum + ((outputArray[0] == data.pubkey) ? parseInt(outputArray[1]) : 0);
                }, 0);

            list.push({
              time: ((tx.time != null && tx.time != "undefined") ? tx.time : 9999999),
              amount: amount,
              issuer: issuer,
              comments: 'comments',
              isUD: false,
              hash: tx.hash,
              block_number: tx.block_number
            });
        });

        return list;
    },

    login = function(salt, password) {
        return $q(function(resolve, reject) {
            CryptoUtils.connect(salt, password).then(
                function(keypair) {
                    // Copy result to properties
                    data.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
                    data.keypair = keypair;
                    resolve();
                }
            );
        });
    },

    logout = function(username, password) {
        return $q(function(resolve, reject) {
            data = createData();
            resolve();
        });
    },

    isLogin = function() {
        return data.pubkey != "undefined"
            && data.pubkey != null;
    },

    getData = function() {
      return data;
    },

    isSourceEquals = function(arg1, arg2) {
        return arg1.type == arg2.type
            && arg1.fingerprint == arg2.fingerprint
            && arg1.number == arg2.number
            && arg1.amount == arg2.amount;
    },

    loadData = function(refresh) {
        if (data.loaded) {
          return refreshData();
        }

        return $q(function(resolve, reject){
          data.loaded = false;

          $q.all([

            // Get currency parameters
            BMA.currency.parameters()
              .then(function(json){
                data.currency = json.currency;
              }),

            // Get the UD informations
            BMA.blockchain.stats.ud()
              .then(function(res){
                if (res.result.blocks.length) {
                  var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
                  return BMA.blockchain.block({ block: lastBlockWithUD })
                    .then(function(block){
                      data.currentUD = block.dividend;
                    });
                  }
              }),

            // Get sources
            BMA.tx.sources({pubkey: data.pubkey})
              .then(function(res){
                data.sources = res.sources; 

                var balance = 0;
                if (res.sources.length) {
                  for (var i=0; i<res.sources.length; i++) {
                    balance += res.sources[i].amount;
                    res.sources[i].consumed = false;
                  }
                }
                data.balance = balance;
              }),

            // Get requirements
            BMA.wot.requirements({pubkey: data.pubkey})
              .then(function(res){
                if (res.identities != "undefined"
                    && res.identities != null
                    && res.identities.length == 1) {
                  data.requirements = res.identities[0];
                  data.uid = res.identities[0].uid;
                }
              })
              .catch(function(err) {
                data.requirements = null;
              }),

            // Get transactions
            BMA.tx.history.all({pubkey: data.pubkey})
              .then(function(res){
                var list = reduceTx(res.history.sent);
                list.push(reduceTx(res.history.received));
                list.push(reduceTx(res.history.sending));
                list.push(reduceTx(res.history.receiving));
                list.push(reduceTx(res.history.pending));

                var history = [];
                list.forEach(function(tx){
                  history['T:'+ tx.block_number + tx.hash] = tx;
                });
                var result = [];
                _.keys(history).forEach(function(key) {
                    result.push(history[key]);
                })
                data.history = result.sort(function(tx1, tx2) {
                     return tx2.time - tx1.time;
                   });
              })
          ])
          .then(function() {
            data.loaded = true;
            resolve(data);            
          })
          .catch(function(err) {
            data.loaded = false;
            reject(err);
          });
        });
    },

    refreshData = function() {
        return $q(function(resolve, reject){
          $q.all([

            // Get the UD informations
            BMA.blockchain.stats.ud()
              .then(function(res){
                if (res.result.blocks.length) {
                  var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
                  return BMA.blockchain.block({ block: lastBlockWithUD })
                    .then(function(block){
                      data.currentUD = block.dividend;
                    });
                  }
              }),

            // Get requirements
            BMA.wot.requirements({pubkey: data.pubkey})
              .then(function(res){
                if (res.identities != "undefined"
                    && res.identities != null
                    && res.identities.length == 1) {
                  data.requirements = res.identities[0];
                  data.uid = res.identities[0].uid;
                }
                else {
                  data.requirements = null;
                }
              })
              .catch(function(err) {
                data.requirements = null;
              }),

            // Get sources
            BMA.tx.sources({pubkey: data.pubkey})
              .then(function(res){

                var balance = 0;
                if (res.sources.length) {
                  for (var i=0; i<res.sources.length; i++) {
                    res.sources[i].consumed = false;
                    if (data.sources.length) {
                      for (var j=0; j<data.sources.length; j++) {
                        if (isSourceEquals(res.sources[i], data.sources[j])
                          && data.sources[j].consumed){
                          res.sources[i].consumed = true;
                          break;
                        }
                      }
                    }
                    if (!res.sources[i].consumed){
                      balance += res.sources[i].amount;
                    }
                  }
                  data.sources = res.sources;
                }                
                data.balance = balance;
              })
          ])
          .then(function() {
            resolve(data);
          })
          .catch(function(err) {
            reject(err);
          });
        });
    },

    /**
    * Send a new transaction
    */
    transfer = function(destPub, amount, comments) {
        return $q(function(resolve, reject) {

            if (!isLogin()){
              reject('Wallet required to be login first.'); return;
            }
            if (amount == null) {
              reject('amount must not be null'); return;
            }
            amount = Math.round(amount);
            if (amount <= 0) {
              reject('amount must be greater than zero'); return;
            }
            if (amount > data.balance) {
              reject('Not enought credit'); return;
            }

            var tx = "Version: 1\n"
              + "Type: Transaction\n"
              + "Currency: " + data.currency + "\n"
              + "Issuers:\n"
              + data.pubkey + "\n"
              + "Inputs:\n";
            var sourceAmount = 0; 
            var inputs = [];
            for (var i = 0; i<data.sources.length; i++) {
              var input = data.sources[i];
              if (input.consumed == "undefined" || !input.consumed){
                // INDEX:SOURCE:NUMBER:FINGERPRINT:AMOUNT
                tx += "0:"+input.type+":"+ input.number+":"
                   + input.fingerprint+":"
                   + input.amount+"\n";
                sourceAmount += input.amount;
                inputs.push(input);
                if (sourceAmount >= amount) {
                  break;
                }
              }
            }

            if (sourceAmount < amount) {
              reject('Not enought sources (max amount: '
                +(data.useRelative ? (sourceAmount / data.currentUD)+' UD' : sourceAmount)
                +'). Please wait next block computation.'); 
              return;
            }

            tx += "Outputs:\n"
               // ISSUERS:AMOUNT
               + destPub +":" + amount + "\n"; 
            if (sourceAmount > amount) {
              tx += data.pubkey+":"+(sourceAmount-amount)+"\n";
            }

            tx += "Comment: "+ (comments!=null?comments:"") + "\n";



            CryptoUtils.sign(tx, data.keypair)
              .then(function(signature) {
                var signedTx = tx + signature + "\n";
                BMA.tx.process({transaction: signedTx})
                  .then(function(result) {
                    data.balance -= amount;
                    for(var i=0;i<inputs.length;i++)inputs[i].consumed=true;
                    resolve(result);
                  })
                  .catch(function(err){
                    reject(err);
                  });
              })
              .catch(function(err){
                reject(err);
              });
        });
    },

    /**
    * Send self certification
    */
    self = function(uid) {
      return $q(function(resolve, reject) {

        BMA.blockchain.current()
        .then(function(block) {
          // Create the self part to sign
          var self = 'UID:' + uid + '\n'
                   + 'META:TS:' + (block.time+1) + '\n';

          CryptoUtils.sign(self, data.keypair)
          .then(function(signature) {
            var signedSelf = self + signature + '\n';
            // Send self
            BMA.wot.add({pubkey: data.pubkey, self: signedSelf, other: ''})
            .then(function(result) {
              // Check requirements
              BMA.wot.requirements({pubkey: data.pubkey})
              .then(function(res){
                if (res.identities != "undefined"
                    && res.identities != null
                    && res.identities.length == 1) {
                  data.requirements = res.identities[0];
                  data.uid = uid;
                  resolve();
                }
                else{
                  reject();
                }
              })
              .catch(function(err) {
                reject();
              })
            })
            .catch(function(err){
              reject(err);
            });
          })
          .catch(function(err){
            reject(err);
          });
        })
        .catch(function(err) {
          reject(err);
        });
      });
    },

    /**
    * Send identity certification
    */
    sign = function(uid, pubkey, timestamp, signature) {
      return $q(function(resolve, reject) {

        BMA.blockchain.current()
        .then(function(block) {
          // Create the self part to sign
          var self = 'UID:' + uid + '\n'
                   + 'META:TS:' + timestamp + '\n'
                   + signature /*+"\n"*/;

          var cert = self + '\n'
                + 'META:TS:' + block.number + '-' + block.hash + '\n';

          CryptoUtils.sign(cert, data.keypair)
          .then(function(signature) {
            var inlineCert = data.pubkey
              + ':' + pubkey
              + ':' + block.number
              + ':' + signature + '\n';
            BMA.wot.add({pubkey: pubkey, self: self, other: inlineCert})
              .then(function(result) {
                resolve(result);
              })
              .catch(function(err){
                reject(err);
              });
          })
          .catch(function(err){
            reject(err);
          });
        })
        .catch(function(err) {
          reject(err);
        });
      });
    },

    /**
    * Serialize to JSON string
    */
    toJson = function() {
      return $q(function(resolve, reject) {
          var json = JSON.stringify(data);
          resolve(json);
        })
    },

    /**
    * De-serialize from JSON string
    */
    fromJson = function(json) {
      return $q(function(resolve, reject) {
          var obj = JSON.parse(json || '{}');
          if (obj.keypair != "undefined"
              && obj.keypair != null) {
              var keypair = obj.keypair;

              // Convert to Uint8Array type
              var signPk = new Uint8Array(32);
              for (var i = 0; i < 32; i++) signPk[i] = keypair.signPk[i];
              keypair.signPk = signPk;

              var signSk = new Uint8Array(64);
              for (var i = 0; i < 64; i++) signSk[i] = keypair.signSk[i];
              keypair.signSk = signSk;

              data.pubkey = obj.pubkey;
              data.keypair = keypair;

              resolve();
          }
          else {
            reject('Not a valid Wallet.data object');
          }
        })
    };

    return {
        id: id,
        data: data,
        // auth
        login: login,
        logout: logout,
        isLogin: isLogin,
        getData: getData,
        loadData: loadData,
        refreshData: refreshData,
        // operations
        transfer: transfer,
        self: self,
        sign: sign,
        // serialization
        toJson: toJson,
        fromJson: fromJson
    }
  }
  var service = Wallet('default');
  service.instance = service;
  return service;
}])
;
