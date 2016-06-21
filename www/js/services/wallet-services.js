//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.wallet.services', ['ngResource', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.registry.services', 'cesium.utils.services'])

.factory('Wallet', function($q, CryptoUtils, BMA, Registry, $translate, localStorage) {
  'ngInject';

  Wallet = function(id) {

    var

    defaultSettings = {
      useRelative: true,
      timeWarningExpire: 129600 /*TODO: =1.5j est-ce suffisant ?*/,
      useLocalStorage: false,
      rememberMe: false,
      node: BMA.node.url,
      showUDHistory: true
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
          locale: {id: $translate.use()},
          useLocalStorage: defaultSettings.useLocalStorage,
          rememberMe: defaultSettings.rememberMe,
          node: defaultSettings.node,
          showUDHistory: defaultSettings.showUDHistory
        }
    },

    resetData = function() {
      data.pubkey= null;
      data.keypair ={
                signSk: null,
                signPk: null
            };
      data.uid = null;
      data.balance = 0;
      data.sources = null;
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
      if (!data.settings.useLocalStorage) {
        data.settings = {
          useRelative: defaultSettings.useRelative,
          timeWarningExpire: defaultSettings.timeWarningExpire,
          locale: {id: $translate.use()},
          useLocalStorage: defaultSettings.useLocalStorage,
          rememberMe: defaultSettings.rememberMe,
          node: BMA.node.url, // If changed, use the updated url
          showUDHistory: defaultSettings.showUDHistory
        };
      }
    },

    reduceTxAndPush = function(txArray, result, processedTxMap) {
      if (!txArray || txArray.length === 0) {
        return;
      }
      _.forEach(txArray, function(tx) {
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
                    if (data.settings.useLocalStorage) {
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

    store = function() {
      if (data.settings.useLocalStorage) {
        localStorage.setObject('CESIUM_SETTINGS', data.settings);

        if (isLogin() && data.settings.rememberMe) {
          var dataToStore = {
            keypair: data.keypair,
            pubkey: data.pubkey
          };
          localStorage.setObject('CESIUM_DATA', dataToStore);
        }
        else {
          localStorage.setObject('CESIUM_DATA', null);
        }
      }
      else {
        localStorage.setObject('CESIUM_SETTINGS', null);
        localStorage.setObject('CESIUM_DATA', null);
      }
    },

    restore = function() {
      return $q(function(resolve, reject){
        var settings = localStorage.getObject('CESIUM_SETTINGS');
        var dataStr = localStorage.get('CESIUM_DATA');
        if (!settings && !dataStr) {
          resolve();
          return;
        }
        var nodeChanged = (settings && settings.node) && (data.settings.node != settings.node);
        if (nodeChanged) {
          BMA.copy(BMA.instance(settings.node)); // reload BMA
          data.loaded = false;
        }
        if (settings) {
          data.settings = settings;
        }
        if (dataStr) {
          fromJson(dataStr, false)
          .then(function(storedData){
            if (storedData && storedData.keypair && storedData.pubkey) {
              data.keypair = storedData.keypair;
              data.pubkey = storedData.pubkey;
              data.loaded = false;
            }
            resolve();
          })
          .catch(function(err){reject(err);});
        }
        else {
          resolve();
        }
      });
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
          data.requirements.willExpireCertificationCount = idty.certifications ? idty.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= data.settings.timeWarningExpire) {
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
          if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) {
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
          if (!data.sources) {
            data.sources=[];
          }
          var sources = [];
          var balance = 0;
          if (!!res.sources && res.sources.length > 0) {
            _.forEach(res.sources, function(src) {
              var srcKey = src.type+':'+src.identifier+':'+src.noffset;
              if (!!data.sources[srcKey]) {
                src.consumed = data.sources[srcKey].consumed;
              }
              else {
                src.consumed = false;
              }
              if (!src.consumed) {
                balance += src.amount;
              }
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
        var jobs = [];
        // get TX history
        var txList = [];
        jobs.push(
        BMA.tx.history.all({pubkey: data.pubkey})
        .then(function(res){
          var processedTxMap = {};
            reduceTxAndPush(res.history.sent, txList, processedTxMap);
            reduceTxAndPush(res.history.received, txList, processedTxMap);
            reduceTxAndPush(res.history.sending, txList, processedTxMap);
            reduceTxAndPush(res.history.pending, txList, processedTxMap);
          }));
        // get UD history
        var udList = [];
        if (data.settings.showUDHistory) {
          jobs.push(
            BMA.ud.history({pubkey: data.pubkey})
            .then(function(res){
              udList = !res.history || !res.history.history ? [] :
               res.history.history.reduce(function(res, ud){
                 return res.concat({
                   time: ud.time,
                   amount: ud.amount,
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
          data.history = txList.concat(udList).sort(function(tx1, tx2) {
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

    loadParameters = function() {
      return $q(function(resolve, reject) {
        BMA.currency.parameters()
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
                data.currentUD = block.dividend;
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

    loadMembers = function() {
      return $q(function(resolve, reject) {
        BMA.wot.members()
        .then(function(json){
          data.members = json.results;
          resolve();
        })
        .catch(function(err) {
          data.members = [];
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

            // Get members
            loadMembers(),

            // Get sources
            loadSources(),

            // Get requirements
            loadRequirements(),

            // Get transactions
            loadTransactions(),

            // Load avatar
            loadAvater();
          ])
          .then(function() {
            data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.parameters.sigQty)) ?
                (data.parameters.sigQty - data.requirements.certificationCount) : 0;
            data.requirements.willNeedCertificationCount = (!data.requirements.needMembership &&
                data.requirements.needCertificationCount === 0 && (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < data.parameters.sigQty) ?
                (data.parameters.sigQty - data.requirements.certificationCount - willExpireCertificationCount) : 0;
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

            // Get UDs
            loadUDs(),

            // Get requirements
            loadRequirements(),

            // Get sources
            loadSources(),

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

            if (!BMA.regex.COMMENT.test(comments)){
              reject({message:'ERROR.INVALID_COMMENT'}); return;
            }
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
                if (input.base > outputBase) {
                  outputBase = input.base;
                }
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
                console.error('Maximum transaction sources has been reached: ' + (data.settings.useRelative ? (sourceAmount / data.currentUD)+' UD' : sourceAmount));
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
            if (outputBase > 0) { // add offset

            }
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
        if (!BMA.regex.USER_ID.test(uid)){
          reject({message:'ERROR.INVALID_USER_ID'}); return;
        }
        loadParameters()
        .then(function() {
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
                        data.uid = uid;
                data.blockUid = block.number + '-' + block.hash;
                resolve();
              }
            }).catch(function(err){reject(err);});
          }).catch(function(err){reject(err);});
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
            keypair: keypair
          });
        }
        else if (failIfInvalid) {
          reject('Not a valid Wallet.data object');
        }
        else {
          resolve();
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
      store: store,
      restore: restore,
      // serialization
      toJson: toJson,
      fromJson: fromJson,
      defaultSettings: defaultSettings
    };
  };

  var service = Wallet('default');

  // try to restore wallet
  service.restore();

  service.instance = Wallet;
  return service;
});
