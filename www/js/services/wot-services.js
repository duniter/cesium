
angular.module('cesium.wot.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services'])

.factory('WotService', function($q, $rootScope, CryptoUtils, BMA, $translate, localStorage, $filter, Api, UIUtils, Wallet) {
  'ngInject';

  WotService = function(id) {

    var
    api = new Api(this, "WotService-" + id),


    loadRequirements = function(pubkey, uid) {
      return $q(function(resolve, reject) {
        // Get requirements
        BMA.wot.requirements({pubkey: pubkey})
        .then(function(res){
          if (!res.identities || res.identities.length === 0) {
            resolve();
            return;
          }
          if (res.identities.length > 0) {
            res.identities = _.sortBy(res.identities, function(idty) {
                  var score = 1;
                  score += (100000000000 * ((uid && idty.uid === uid) ? 1 : 0));
                  score += (1000000      * idty.membershipExpiresIn);
                  score += (10           * idty.membershipPendingExpiresIn);
                  return -score;
                });
          }
          var timeWarningExpire = Wallet.isLogin() ? Wallet.data.settings.timeWarningExpire : Wallet.defaultSettings.timeWarningExpire;
          var requirements = res.identities[0];
          // Add useful custom fields
          requirements.hasSelf = true;
          requirements.needMembership = (requirements.membershipExpiresIn === 0 &&
                                              requirements.membershipPendingExpiresIn <= 0 );
          requirements.needRenew = !requirements.needMembership && (requirements.membershipExpiresIn <= timeWarningExpire &&
                                        requirements.membershipPendingExpiresIn <= 0 );
          requirements.canMembershipOut = (requirements.membershipExpiresIn > 0);
          requirements.pendingMembership = (requirements.membershipPendingExpiresIn > 0);
          requirements.certificationCount = (requirements.certifications) ? requirements.certifications.length : 0;
          requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= timeWarningExpire) {
              return count + 1;
            }
            return count;
          }, 0) : 0;
          requirements.isMember = !requirements.needMembership;
          resolve(requirements);
        })
        .catch(function(err) {
          // If not a member: continue
          if (!!err &&
              (err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER ||
               err.ucode == BMA.errorCodes.NO_IDTY_MATCHING_PUB_OR_UID)) {
            resolve({
              hasSelf: false,
              needMembership: true,
              canMembershipOut: false,
              needRenew: false,
              pendingMembership: false,
              certificationCount: 0,
              certifications: [],
              needCertifications: false,
              needCertificationCount: 0,
              willNeedCertificationCount: 0
            });
          }
          else {
            reject(err);
          }
        });
      });
    },

    loadIdentity = function(pubkey, requirements) {
      return $q(function(resolve, reject) {
        BMA.wot.lookup({ search: pubkey })
        .then(function(res){
          var identity = res.results.reduce(function(idties, res) {
            return idties.concat(res.uids.reduce(function(uids, idty) {
              var blocUid = idty.meta.timestamp.split('-', 2);
              return uids.concat({
                uid: idty.uid,
                pubkey: res.pubkey,
                timestamp: idty.meta.timestamp,
                number: blocUid[0],
                hash: blocUid[1],
                revoked: idty.revoked,
                revokedSig: idty.revocation_sig,
                sig: idty.self
              });
            }, []));
          }, [])[0];
          identity.hasSelf = !!(identity.uid && identity.timestamp && identity.sig);

          // Retrieve certifications
          var timeWarningExpire = Wallet.isLogin() ? Wallet.data.settings.timeWarningExpire : Wallet.defaultSettings.timeWarningExpire;
          var expiresInByPub = requirements.certifications.reduce(function(map, cert){
            map[cert.from]=cert.expiresIn;
            return map;
          }, []);
          var certPubkeys = [];
          var certifications = !res.results ? [] : res.results.reduce(function(certs, res) {
            return certs.concat(res.uids.reduce(function(certs, idty) {
              return certs.concat(idty.others.reduce(function(certs, cert) {
                if (!certPubkeys[cert.pubkey]) { // skip duplicated certs
                  certPubkeys[cert.pubkey] = true;
                  var expiresIn = cert.isMember ? expiresInByPub[cert.pubkey] : null;
                  return certs.concat({
                    from: cert.pubkey,
                    uid: cert.uids[0],
                    block: (cert.meta && cert.meta.block_number) ? cert.meta.block_number : 0,
                    expiresIn: expiresIn,
                    willExpire: (expiresIn && expiresIn <= timeWarningExpire),
                    valid: (expiresIn && expiresIn > 0),
                    isMember: cert.isMember
                  });
                }
                return certs;
              }, certs));
            }, certs));
          }, []);
          identity.certifications = _.sortBy(certifications, function(cert){
            var score = 1;
            score += (1000000000000 * (cert.expiresIn ? cert.expiresIn : 0));
            score += (10000000      * (cert.isMember ? 1 : 0));
            score += (10            * (cert.block ? cert.block : 0));
            return -score;
          });
          identity.certificationCount = requirements.certificationCount;
          identity.isMember = requirements.isMember;
          delete requirements.certifications;
          delete requirements.certificationCount;

          $q.all([
            // Retrieve registration date
            BMA.blockchain.block({block: identity.number})
            .then(function(block) {
              identity.sigDate = block.time;
            }),

            // Get sig Qty
            BMA.blockchain.parameters()
            .then(function(parameters) {
              identity.sigQty =  parameters.sigQty;
            })
          ])
          .then(function() {
            resolve(identity);
          });
        })
        .catch(function(err) {
          if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) { // Identity not found (if no self)
            var identity = {
              uid: null,
              pubkey: pubkey,
              hasSelf: false
            };
            resolve(identity);
          }
          else {
            reject(err);
          }
        });
      });
    },

    loadSources = function(pubkey) {
      return $q(function(resolve, reject) {
        // Get transactions
        BMA.tx.sources({pubkey: pubkey})
        .then(function(res){
          var sources = [];
          var sourcesIndexByKey = [];
          var balance = 0;
          if (!!res.sources && res.sources.length > 0) {
            _.forEach(res.sources, function(src) {
              var srcKey = src.type+':'+src.identifier+':'+src.noffset;
              src.consumed = false;
              balance += (src.base > 0) ? (src.amount * Math.pow(10, src.base)) : src.amount;
              sources.push(src);
              sourcesIndexByKey[srcKey] = sources.length -1 ;
            });
          }
          resolve({
            sources: sources,
            sourcesIndexByKey: sourcesIndexByKey,
            balance: balance
          });
        })
        .catch(function(err) {
          reject(err);
        });
      });
    },

    loadData = function(pubkey, uid) {
        return $q(function(resolve, reject){
          var data = {
            pubkey: pubkey
          };

          $q.all([

            // Get requirements
            loadRequirements(pubkey, uid)
            .then(function(requirements){
              data.requirements = requirements;

              // Get identity
              return loadIdentity(pubkey, requirements)
              .then(function(identity){
                angular.merge(data, identity);
              })
            }),

            // Get sources
            loadSources(pubkey)
            .then(function(sources){
              data.sources = sources;
            }),

            // API extension
            api.data.raisePromise.load(data)
          ])
          .then(function() {
            resolve(data);
          })
          .catch(function(err) {
            reject(err);
          });
        });
    },

    search = function(text) {
      return $q(function(resolve, reject) {
        if (!text || text.trim() !== text) {
          resolve();
        }
        return BMA.wot.lookup({ search: text })
          .then(function(res){
            var idtyKeys = [];
            var idties = res.results.reduce(function(idties, res) {
              return idties.concat(res.uids.reduce(function(uids, idty) {
                var blocUid = idty.meta.timestamp.split('-', 2);
                var idtyKey = idty.uid + '-' + res.pubkey;
                if (!idtyKeys[idtyKey] && !idty.revoked) {
                  idtyKeys[idtyKey] = true;
                  return uids.concat({
                    uid: idty.uid,
                    pubkey: res.pubkey,
                    number: blocUid[0],
                    hash: blocUid[1]
                  });
                }
                return uids;
              }, []));
            }, []);

            api.data.raisePromise.search(text, idties)
            .then(function() {
              resolve(idties);
            });
          })
          .catch(function(err) {
            if (err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) {
              var idties = [];
              api.data.raisePromise.search(text, idties)
              .then(function() {
                resolve(idties);
              });
            }
            else {
              reject(err);
            }
          });
      });
    }
    ;

    // Register extension points
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'search');

    return {
      id: id,
      load: loadData,
      search: search,
      // api extension
      api: api
    };
  };

  var service = WotService('default');

  service.instance = WotService;
  return service;
});
