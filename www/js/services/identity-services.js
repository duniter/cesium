
angular.module('cesium.identity.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services'])

.factory('IdentityService', function($q, $rootScope, CryptoUtils, BMA, $translate, localStorage, $filter, Api, UIUtils, Wallet) {
  'ngInject';

  IdentityService = function(id) {

    var
    api = new Api(this, id),

    loadRequirements = function(pubkey) {
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
                  score += (100000000000 * ((!data.uid && idty.uid === data.uid) ? 1 : 0));
                  score += (1000000      * idty.membershipExpiresIn);
                  score += (10           * idty.membershipPendingExpiresIn);
                  return -score;
                });
          }
          var requirements = res.identities[0];
          requirements.blockUid = idty.meta.timestamp;
          // Add useful custom fields
          requirements.needSelf = false;
          requirements.needMembership = (requirements.membershipExpiresIn === 0 &&
                                              requirements.membershipPendingExpiresIn <= 0 );
          requirements.needRenew = !requirements.needMembership && (requirements.membershipExpiresIn <= Wallet.settings.timeWarningExpire &&
                                        requirements.membershipPendingExpiresIn <= 0 );
          requirements.needMembershipOut = (requirements.membershipExpiresIn > 0);
          requirements.pendingMembership = (requirements.membershipPendingExpiresIn > 0);
          requirements.certificationCount = (requirements.certifications) ? requirements.certifications.length : 0;
          requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= Wallet.settings.timeWarningExpire) {
              return count + 1;
            }
            return count;
          }, 0) : 0;
          requirements.isMember = !requirements.needSelf && !requirements.needMembership;
          resolve(requirements);
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

    loadSources = function(pubkey) {
      return $q(function(resolve, reject) {
        // Get transactions
        BMA.tx.sources({pubkey: pubkey})
        .then(function(res){
          if (!data.sources) {
            data.sources=[];
          }
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

    loadData = function(pubkey) {
        if (data.loaded) {
          return refreshData();
        }

        return $q(function(resolve, reject){
          var data = {
            pubkey: pubkey
          };

          $q.all([
            // Get requirements
            loadRequirements(pubkey)
            .then(function(requirements){
              data.requirements = requirements;
            }),

            // Get sources
            loadSources(pubkey)
            .then(function(sources){
              data.sources = sources;
            }),

            // API extension
            $q(function(resolve, reject){
              api.data.raise.load(data, resolve, reject);
            })
          ])
          .then(function() {
            resolve(data);
          })
          .catch(function(err) {
            reject(err);
          });
        });
    }

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
                    pub: res.pubkey,
                    number: blocUid[0],
                    hash: blocUid[1]
                  });
                }
                return uids;
              }, []));
            }, []);

            api.data.raise.search(text, idties, resolve, reject);
            //resolve(idties);
          })
          .catch(function(err) {
            if (err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) {
              api.data.raise.search(text, [], resolve, reject);
              //resolve();
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

  var service = IdentityService('default');

  service.instance = IdentityService;
  return service;
});
