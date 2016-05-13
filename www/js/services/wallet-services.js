//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.wallet.services', ['ngResource', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.registry.services'])

.factory('Wallet', ['$q', 'CryptoUtils', 'BMA', 'Registry', '$translate', function($q, CryptoUtils, BMA, Registry, $translate) {

  Wallet = function(id) {

    var

    defaultSettings = {
      useRelative: true,
      timeWarningExpire: 129600 /*TODO: =1.5j est-ce suffisant ?*/
    },

    data = {
        pubkey: null,
        keypair: {
            signSk: null,
            signPk: null
        },
        balance: 0,
        sources: null,
        useRelative: defaultSettings.useRelative, // TODO : a remplacer par settings.useRelative
        currency: null,
        parameters: null,
        currentUD: null,
        medianTime: null,
        history: {},
        requirements: {},
        isMember: false,
        loaded: false,
        blockUid: null,
        members: [],
        avatar: null,
        settings: {
          useRelative: defaultSettings.useRelative,
          timeWarningExpire: defaultSettings.timeWarningExpire,
          locale: {id: $translate.use()}
        }
    },

    resetData = function() {
      data.pubkey= null;
      data.keypair ={
                signSk: null,
                signPk: null
            };
      data.balance = 0;
      data.sources = null;
      data.useRelative = defaultSettings.useRelative; // TODO : a remplacer par settings.useRelative
      data.currency= null;
      data.parameters = null;
      data.currentUD = null;
      data.medianTime = null;
      data.history = {};
      data.requirements = {};
      data.isMember = false;
      data.loaded = false;
      data.blockUid = null;
      data.members = [];
      data.avatar = null;
      data.settings = {
        useRelative: defaultSettings.useRelative,
        timeWarningExpire: defaultSettings.timeWarningExpire
      };
    },

    reduceTxAndPush = function(txArray, result, processedTxMap) {
      if (!txArray || txArray.length === 0) {
        return;
      }
      txArray.forEach(function(tx) {
        var walletIsIssuer = false;
        var otherIssuer = tx.issuers.reduce(function(issuer, res, index) {
            walletIsIssuer = (res === data.pubkey) ? true : walletIsIssuer;
            return issuer + ((res !== data.pubkey) ? ', ' + res : '');
        }, '');
        if (otherIssuer.length > 0) {
          otherIssuer = otherIssuer.substring(2);
        }
        var otherReceiver = null;
        var amount = tx.outputs.reduce(function(sum, output) {
            var outputArray = output.split(':',3);
            var outputAmount = parseInt(outputArray[0]);
            var outputBase = parseInt(outputArray[1]);
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

        var time = tx.time;
        if (!time) {
          time= Math.floor(moment().utc().valueOf() / 1000);
        }

        var pubkey = amount > 0 ? otherIssuer : otherReceiver;
        var member = _.findWhere(data.members, { pubkey: pubkey });

        // Avoid duplicated tx, oar tx to him self
        var txKey = amount + ':' + tx.hash + ':' + time;
        if (!processedTxMap[txKey] && amount !== 0) {
          processedTxMap[txKey] = true;

          result.push({
            time: time,
            amount: amount,
            pubkey: pubkey,
            uid: (member ? member.uid : null),
            comment: tx.comment,
            isUD: false,
            hash: tx.hash,
            locktime: tx.locktime,
            block_number: tx.block_number
          });
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
                    resolve(data);
                }
            );
        });
    },

    logout = function(username, password) {
        return $q(function(resolve, reject) {
            resetData();
            resolve();
        });
    },

    isLogin = function() {
        return !!data.pubkey;
    },

    getData = function() {
      return data;
    },

    isSourceEquals = function(arg1, arg2) {
        return arg1.type == arg2.type &&
            arg1.fingerprint == arg2.fingerprint &&
            arg1.number == arg2.number &&
            arg1.amount == arg2.amount;
    },

    resetRequirements = function() {
      data.requirements = {
        needSelf: true,
        needMembership: true,
        needMembershipOut: false,
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
          data.requirements.needRenew = !data.requirements.needMembership && (data.requirements.membershipExpiresIn <= data.settings.timeWarningExpire &&
                                        data.requirements.membershipPendingExpiresIn <= 0 );
          data.requirements.needMembershipOut = (data.requirements.membershipExpiresIn > 0);
          data.requirements.pendingMembership = (data.requirements.membershipPendingExpiresIn > 0);
          data.requirements.certificationCount = (idty.certifications) ? idty.certifications.length : 0;
          var willExpireCertificationCount = idty.certifications ? idty.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= data.settings.timeWarningExpire) {
              return count + 1;
            }
            return count;
          }, 0) : 0;
          data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.parameters.sigQty)) ?
              (data.parameters.sigQty - data.requirements.certificationCount) : 0;
          data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
              data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - willExpireCertificationCount) < data.parameters.sigQty) ?
              (data.parameters.sigQty - data.requirements.certificationCount - willExpireCertificationCount) : 0;
          data.isMember = !data.requirements.needSelf && !data.requirements.needMembership;
          resolve();
        })
        .catch(function(err) {
          resetRequirements();
          // If identity not published : continue
          if (!!err && err.ucode == 2004) {
            resolve();
          }
          else {
            reject(err);
          }
        });
      });
    },

    loadSources = function(refresh) {
      return $q(function(resolve, reject) {
        // Get transactions
        BMA.tx.sources({pubkey: data.pubkey})
        .then(function(res){
          if (!data.sources) {
            data.sources=[];
          }
          var sources = [];
          var balance = 0;
          if (!!res.sources && res.sources.length > 0) {
            res.sources.forEach(function(src) {
              var srcKey = src.type+':'+src.identifier+':'+src.noffset;
              if (!!data.sources[srcKey]) {
                src.consumed = data.sources[srcKey].consumed;
              }
              else {
                src.consumed = false;
              }
              //if (!src.consumed) {
                balance += src.amount;
              //}
              sources.push(src);
              sources[srcKey] = src;
            });
          }
          data.sources = sources;
          data.balance = balance;
          resolve();
        })
        .catch(function(err) {
          data.sources = [];
          reject(err);
        });
      });
    },

    loadTransactions = function() {
      return $q(function(resolve, reject) {
        // Get transactions
        BMA.tx.history.all({pubkey: data.pubkey})
        .then(function(res){
          var list = [];
          var processedTxMap = {};
          reduceTxAndPush(res.history.sent, list, processedTxMap);
          reduceTxAndPush(res.history.received, list, processedTxMap);
          reduceTxAndPush(res.history.sending, list, processedTxMap);
          reduceTxAndPush(res.history.pending, list, processedTxMap);
          // sort by time desc
          data.history = list.sort(function(tx1, tx2) {
             return tx2.time - tx1.time;
          });
          resolve();
        })
        .catch(function(err) {
          data.history = [];
          reject(err);
        });
      });
    },

    loadAvatar = function() {
      return $q(function(resolve, reject) {
        if (!Registry) {
          data.avatar = null;
          resolve();
          return;
        }
        Registry.record.avatar(data.pubkey)
          .then(function(imageData) {
            if (imageData) {
              data.avatar = imageData;
            }
            else {
              data.avatar = null;
            }
            resolve();
          })
          .catch(function(err) {
            data.avatar = null; // silent !
            resolve();
          });
      });
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
                data.parameters = json;
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

            // Get members
            BMA.wot.members()
              .then(function(json){
                data.members = json.results;
              }),

            // Get sources
            loadSources(false),

            // Get requirements
            loadRequirements(),

            // Get transactions
            loadTransactions(),

            // Get avatar
            loadAvatar()
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
            loadRequirements(),

            // Get sources
            loadSources(true),

            // Get transactions
            loadTransactions()
          ])
          .then(function() {
            resolve(data);
          }).catch(function(err){reject(err);});
        });
    },

    /**
    * Send a new transaction
    */
    transfer = function(destPub, amount, comments) {
        return $q(function(resolve, reject) {

            if (!isLogin()){
              reject({message:'ERROR.NEED_LOGIN_FIRST'}); return;
            }
            if (!amount) {
              reject({message:'ERROR.AMOUNT_REQUIRED'}); return;
            }
            amount = Math.round(amount);
            if (amount <= 0) {
              reject({message:'ERROR.AMOUNT_NEGATIVE'}); return;
            }
            if (amount > data.balance) {
              reject({message:'ERROR.NOT_ENOUGH_CREDIT'}); return;
            }

            var tx = "Version: 2\n";
            tx += "Type: Transaction\n";
            tx += "Currency: " + data.currency + "\n";
            tx += "Locktime: 0" + "\n"; // no lock
            tx += "Issuers:\n";
            tx += data.pubkey + "\n";
            tx += "Inputs:\n";
            var sourceAmount = 0;
            var outputBase = 0;
            var inputs = [];
            var i;
            for (i = 0; i<data.sources.length; i++) {
              var input = data.sources[i];
              if (!input.consumed){
                // if D : D:PUBLIC_KEY:BLOCK_ID
                // if T : T:T_HASH:T_INDEX
                tx += input.type +":"+input.identifier+":"+input.noffset+"\n";
                sourceAmount += input.amount;
                inputs.push(input);
                if (sourceAmount >= amount) {
                  break;
                }
              }
            }

            if (sourceAmount < amount) {
              if (sourceAmount === 0) {
                reject({message:'ERROR.ALL_SOURCES_USED'});
              }
              else {
                console.error('Maximum transaction sources has been reached: ' + (data.useRelative ? (sourceAmount / data.currentUD)+' UD' : sourceAmount));
                reject({message:'ERROR.NOT_ENOUGH_SOURCES'});
              }
              return;
            }

            tx += 'Unlocks:\n';
            for (i=0; i<inputs.length; i++) {
                 // INPUT_INDEX:UNLOCK_CONDITION
                tx += i + ':SIG(0)\n';
            }

            tx += 'Outputs:\n';
            // AMOUNT:BASE:CONDITIONS
            tx += amount + ':'+outputBase+':SIG('+destPub+')\n';
            if (sourceAmount > amount) {
              tx += (sourceAmount-amount)+':'+outputBase+':SIG('+data.pubkey+')\n';
            }

            tx += "Comment: "+ (!!comments?comments:"") + "\n";

            CryptoUtils.sign(tx, data.keypair)
            .then(function(signature) {
              var signedTx = tx + signature + "\n";
              BMA.tx.process({transaction: signedTx})
              .then(function(result) {
                data.balance -= amount;
                for(var i=0;i<inputs.length;i++)inputs[i].consumed=true;
                // Add to history
                /*data.history.push({
                    time: time,
                    amount: amount,
                    issuer: otherIssuer,
                    receiver: otherReceiver,
                    comment: tx.comment,
                    isUD: false,
                    hash: tx.hash,
                    locktime: tx.locktime,
                    block_number: tx.block_number
                  });*/

                resolve(result);
              }).catch(function(err){reject(err);});
            }).catch(function(err){reject(err);});
        });
    },

    /**
    * Send self identity
    */
    self = function(uid, requirements) {
      return $q(function(resolve, reject) {

        BMA.blockchain.current()
        .then(function(block) {
          // Create identity to sign
          var identity = 'Version: 2\n' +
                    'Type: Identity\n' +
                    'Currency: ' + data.currency + '\n' +
                    'Issuer: ' + data.pubkey + '\n' +
                    'UniqueID: ' + uid + '\n' +
                    'Timestamp: ' + block.number + '-' + block.hash + '\n';

          CryptoUtils.sign(identity, data.keypair)
          .then(function(signature) {
            var signedIdentity = identity + signature + '\n';
            // Send signed identity
            BMA.wot.add({identity: signedIdentity})
            .then(function(result) {
              if (!!requirements) {
              // Refresh membership data
                loadRequirements()
                .then(function() {
                  resolve();
                }).catch(function(err){reject(err);});
              }
              else {
                data.blockUid = block.number + '-' + block.hash;
                resolve();
              }
            }).catch(function(err){reject(err);});
          }).catch(function(err){reject(err);});
        }).catch(function(err){reject(err);});
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
                // Refresh membership data
                loadRequirements()
                .then(function() {
                  resolve();
                }).catch(function(err){reject(err);});
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
    fromJson = function(json) {
      return $q(function(resolve, reject) {
        var obj = JSON.parse(json || '{}');
        if (obj.keypair) {
          var keypair = obj.keypair;
          var i;

          // Convert to Uint8Array type
          var signPk = new Uint8Array(32);
          for (i = 0; i < 32; i++) signPk[i] = keypair.signPk[i];
          keypair.signPk = signPk;

          var signSk = new Uint8Array(64);
          for (i = 0; i < 64; i++) signSk[i] = keypair.signSk[i];
          keypair.signSk = signSk;

          data.pubkey = obj.pubkey;
          data.keypair = keypair;

          resolve();
        }
        else {
          reject('Not a valid Wallet.data object');
        }
      });
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
      membership: {
        inside: membership(true),
        out: membership(false)
      },
      certify: certify,
      // serialization
      toJson: toJson,
      fromJson: fromJson,
      defaultSettings: defaultSettings
    };
  };

  var service = Wallet('default');
  service.instance = service;
  return service;
}])
;
