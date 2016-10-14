
angular.module('cesium.wot.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])

.factory('WotService', function($q, $timeout, BMA, Api, csSettings) {
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
          var requirements = res.identities[0];
          // Add useful custom fields
          requirements.hasSelf = true;
          requirements.needMembership = (requirements.membershipExpiresIn === 0 &&
                                              requirements.membershipPendingExpiresIn <= 0 );
          requirements.needRenew = !requirements.needMembership && (requirements.membershipExpiresIn <= csSettings.data.timeWarningExpire &&
                                        requirements.membershipPendingExpiresIn <= 0 );
          requirements.canMembershipOut = (requirements.membershipExpiresIn > 0);
          requirements.pendingMembership = (requirements.membershipPendingExpiresIn > 0);
          requirements.certificationCount = (requirements.certifications) ? requirements.certifications.length : 0;
          requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
            if (cert.expiresIn <= csSettings.data.timeWarningExpire) {
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

    loadIdentity = function(pubkey, requirements, parameters) {
      return $q(function(resolve, reject) {
        BMA.wot.lookup({ search: pubkey })
        .then(function(res){
          var identity = res.results.reduce(function(idties, res) {
            return idties.concat(res.uids.reduce(function(uids, idty) {
              var blockUid = idty.meta.timestamp.split('-', 2);
              return uids.concat({
                uid: idty.uid,
                pubkey: res.pubkey,
                timestamp: idty.meta.timestamp,
                number: blockUid[0],
                hash: blockUid[1],
                revoked: idty.revoked,
                revokedSig: idty.revocation_sig,
                sig: idty.self
              });
            }, []));
          }, [])[0];
          identity.hasSelf = !!(identity.uid && identity.timestamp && identity.sig);

          // Retrieve certifications
          var expiresInByPub = requirements.certifications.reduce(function(map, cert){
            map[cert.from]=cert.expiresIn;
            return map;
          }, {});
          var certPubkeys = [];
          var certifications = !res.results ? [] : res.results.reduce(function(certs, res) {
            return certs.concat(res.uids.reduce(function(certs, idty) {
              return certs.concat(idty.others.reduce(function(certs, cert) {
                var expiresIn = cert.isMember ? expiresInByPub[cert.pubkey] : null;
                var result = {
                  pubkey: cert.pubkey,
                  uid: cert.uids[0],
                  block: (cert.meta && cert.meta.block_number) ? cert.meta.block_number : 0,
                  expiresIn: expiresIn,
                  willExpire: (expiresIn && expiresIn <= csSettings.data.timeWarningExpire),
                  valid: (expiresIn && expiresIn > 0),
                  isMember: cert.isMember
                };
                if (!certPubkeys[cert.pubkey]) {
                  certPubkeys[cert.pubkey] = result;
                }
                else { // if duplicated cert: keep the most recent
                  if (result.block > certPubkeys[cert.pubkey].block) {
                    certPubkeys[cert.pubkey] = result;
                  }
                  else {
                    result = null; // skip
                  }
                }
                return result !== null ? certs.concat(result) : certs;
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

          // Store given certs
          certPubkeys = [];
          var givenCertifications = !res.results ? [] : res.results.reduce(function(certs, res) {
            return certs.concat(res.signed.reduce(function(certs, cert) {
              if (!certPubkeys[cert.pubkey]) { // skip duplicated certs
                certPubkeys[cert.pubkey] = true;
                var blockUid = cert.meta ? cert.meta.timestamp.split('-', 2) : [null, null];
                return certs.concat({
                  pubkey: cert.pubkey,
                  uid: cert.uid,
                  block: blockUid[0],
                  hash: blockUid[1],
                  isMember: cert.isMember,
                  wasMember: cert.wasMember
                });
              }
              return certs;
            }, certs));
          }, []);
          identity.temp = {
            givenCertifications: givenCertifications
          };
          identity.sigQty =  parameters.sigQty;
          identity.sigStockMax =  parameters.sigStock;

          // Retrieve registration date
          return BMA.blockchain.block({block: identity.number})
            .then(function(block) {
            identity.sigDate = block.time;
            resolve(identity);
          })
          .catch(function(err){
            // Special case for currency init (root block not exists): use now
            if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && identity.number === '0') {
              identity.sigDate = Math.trunc(new Date().getTime() / 1000);
              resolve(identity);
            }
            else {
              reject(err);
            }
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

      loadGivenCertifications = function(pubkey, lookupGivenCertifications, parameters, medianTime) {
        return $q(function(resolve, reject) {

          var lookupCertsMap = !lookupGivenCertifications ? {} : lookupGivenCertifications.reduce(function(map, cert){
            map[cert.pubkey] = cert;
            return map;
          }, {});

          BMA.wot.certifiedBy({ pubkey: pubkey })
            .then(function(res){
              var sigStock = 0;
              var certifications = res.certifications.reduce(function(res, cert) {
                var certTime = cert.cert_time ? cert.cert_time.medianTime : null;
                var expiresIn = (cert.written === null || certTime === null) ? 0 : (certTime + parameters.sigValidity - medianTime);
                expiresIn = (expiresIn < 0) ? 0 : expiresIn;
                sigStock = (expiresIn > 0) ? sigStock+1 : sigStock;
                delete lookupCertsMap[cert.pubkey];
                return res.concat({
                  isMember: cert.isMember,
                  wasMember: cert.wasMember,
                  uid: cert.uid,
                  pubkey: cert.pubkey,
                  time: certTime,
                  expiresIn: expiresIn,
                  valid: (expiresIn > 0),
                  block: (cert.written !== null) ? cert.written.number :
                    (cert.cert_time ? cert.cert_time.block : null)
                });
              }, []);

              // Add missing certs found in lookup (e.g. not written certs)
              certifications = _.keys(lookupCertsMap).reduce(function(res, pubkey){
                var cert = lookupCertsMap[pubkey];
                cert.valid = false;
                return res.concat(cert);
              }, certifications);

              certifications = _.sortBy(certifications, function(cert){
                var score = 1;
                score += (1000000000000 * (cert.expiresIn ? cert.expiresIn : 0));
                score += (10000000      * (cert.isMember ? 1 : 0));
                score += (10            * (cert.block ? cert.block : 0));
                return -score;
              });

              resolve({
                sigStock: sigStock,
                givenCertifications: certifications
              });
            })
            .catch(function(err) {
              if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) { // member not found
                resolve({
                  sigStock: 0,
                  givenCertifications: []
                });
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

          var parameters;
          var medianTime;
          $q.all([
            // Get parameters
            BMA.blockchain.parameters()
              .then(function(res) {
                parameters = res;
              }),
            // Get current time
            BMA.blockchain.current()
              .then(function(current) {
                medianTime = current.medianTime;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                  medianTime = Math.trunc(new Date().getTime()/1000);
                }
                else {
                  throw err;
                }
              })
          ])
          .then(function() {
            return $q.all([
              // Get requirements
              loadRequirements(pubkey, uid, parameters)
                .then(function (requirements) {
                  data.requirements = requirements;

                  // Get identity
                  return loadIdentity(pubkey, requirements, parameters)
                    .then(function (identity) {
                      angular.merge(data, identity);

                      // Get given certifications
                      return loadGivenCertifications(pubkey, !identity.temp ? identity.temp : identity.temp.givenCertifications, parameters, medianTime)
                        .then(function (identity) {
                          angular.merge(data, identity);
                        });
                    });
                }),

              // Get sources
              loadSources(pubkey)
                .then(function (sources) {
                  data.sources = sources;
                }),

              // API extension
              api.data.raisePromise.load(data)
            ]);
          })
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
    },

    getNewcomers = function(size) {
      size = size || 20;
      return BMA.blockchain.stats.newcomers()
        .then(function(res) {
          if (!res.result.blocks || !res.result.blocks.length) {
            return null;
          }
          var blocks = _.sortBy(res.result.blocks, function(n){ return -n; });
          return getNewcomersRecursive(blocks, 0, 5, size)
            .then(function(idties){
              if (idties && idties.length) {
                idties = _.sortBy(idties, function(idty){
                  var score = 1;
                  score += (1000000 * (idty.block));
                  score += (10      * (900 - idty.uid.toLowerCase().charCodeAt(0)));
                  return -score;
                });
                if (idties.length > size) {
                  idties = idties.slice(0, size); // limit if more than expected size
                }
              }
              return $q(function(resolve, reject) {
                api.data.raisePromise.search(null, idties)
                  .then(function () {
                    resolve(idties);
                  })
                  .catch(function(err){
                    reject(err);
                  });
              });
            });
        });
    },

    getNewcomersRecursive = function(blocks, offset, size, maxResultSize) {
      return $q(function(resolve, reject) {
        var result = [];
        var jobs = [];
        _.each(blocks.slice(offset, offset+size), function(number) {
          jobs.push(
            BMA.blockchain.block({block: number})
              .then(function(block){
                if (!block || !block.joiners) return;
                _.each(block.joiners, function(joiner){
                  var parts = joiner.split(':');
                  result.push({
                    pubkey:parts[0],
                    uid: parts[parts.length-1],
                    sigDate: block.medianTime,
                    block: block.number
                  });
                });
              })
          );
        });

        $q.all(jobs)
          .then(function() {
            if (result.length < maxResultSize && offset < blocks.length - 1) {
              $timeout(function() {
                getNewcomersRecursive(blocks, offset+size, size, maxResultSize - result.length)
                  .then(function(res) {
                    resolve(result.concat(res));
                  })
                  .catch(function(err) {
                    reject(err);
                  });
              }, 1000);
            }
            else {
              resolve(result);
            }
          })
          .catch(function(err){
            if (err && err.ucode === BMA.errorCodes.HTTP_LIMITATION) {
              resolve(result);
            }
            else {
              reject(err);
            }
          });
      });
    },

    getAll = function() {
      var letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','u','v','w','x','y','z'];
      return getAllRecursive(letters, 0, 5);
    },

    getAllRecursive = function(letters, offset, size) {
      return $q(function(resolve, reject) {
        var result = [];
        var pubkeys = {};
        var jobs = [];
        _.each(letters.slice(offset, offset+size), function(letter) {
          jobs.push(
            search(letter)
              .then(function(idties){
                if (!idties || !idties.length) return;
                result = idties.reduce(function(res, idty) {
                  if (!pubkeys[idty.pubkey]) {
                    pubkeys[idty.pubkey] = true;
                    return res.concat(idty);
                  }
                  return res;
                }, result);
              })
          );
        });

        $q.all(jobs)
          .then(function() {
            if (offset < letters.length - 1) {
              $timeout(function() {
                getAllRecursive(letters, offset+size, size)
                  .then(function(idties) {
                    if (!idties || !idties.length) {
                      resolve(result);
                      return;
                    }
                    resolve(idties.reduce(function(res, idty) {
                      if (!pubkeys[idty.pubkey]) {
                        pubkeys[idty.pubkey] = true;
                        return res.concat(idty);
                      }
                      return res;
                    }, result));
                  })
                  .catch(function(err) {
                    reject(err);
                  });
              }, 1000);
            }
            else {
              resolve(result);
            }
          })
          .catch(function(err){
            if (err && err.ucode === BMA.errorCodes.HTTP_LIMITATION) {
              resolve(result);
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
      newcomers: getNewcomers,
      all: getAll,
      // api extension
      api: api
    };
  };

  var service = WotService('default');

  service.instance = WotService;
  return service;
});
