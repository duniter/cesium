
angular.module('cesium.wot.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])

.factory('csWot', function($q, $timeout, BMA, Api, CacheFactory, csSettings, csCache) {
  'ngInject';

  factory = function(id) {

    var
      api = new Api(this, "csWot-" + id),
      identityCache = csCache.get('csWot-idty-', csCache.constants.SHORT),

      _sortAndLimitIdentities = function(idties, size) {
        idties = _.sortBy(idties, function(idty){
          var score = 1;
          score += (1000000 * (idty.block));
          score += (10      * (900 - idty.uid.toLowerCase().charCodeAt(0)));
          return -score;
        });
        if (angular.isDefined(size) && idties.length > size) {
          idties = idties.slice(0, size); // limit if more than expected size
        }
        return idties;
      },

      _sortCertifications = function(certifications) {
        certifications = _.sortBy(certifications, function(cert){
          var score = 1;
          score += (1000000000000 * (cert.expiresIn ? cert.expiresIn : 0));
          score += (10000000      * (cert.isMember ? 1 : 0));
          score += (10            * (cert.block ? cert.block : 0));
          return -score;
        });
        return certifications;
      },

      loadRequirements = function(pubkey, uid) {
        return $q(function(resolve, reject) {
          // Get requirements
          BMA.wot.requirements({pubkey: pubkey})
          .then(function(res){
            if (!res.identities || res.identities.length === 0) {
              resolve();
              return;
            }
            if (res.identities.length > 1) {
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
            requirements.isMember = !requirements.needMembership && !requirements.pendingMembership;
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

      loadIdentityByLookup = function(pubkey) {
        return BMA.wot.lookup({ search: pubkey })
          .then(function(res){
            var identities = res.results.reduce(function(idties, res) {
              return idties.concat(res.uids.reduce(function(uids, idty) {
                var blockUid = idty.meta.timestamp.split('-', 2);
                return uids.concat({
                  uid: idty.uid,
                  pubkey: res.pubkey,
                  timestamp: idty.meta.timestamp,
                  number: parseInt(blockUid[0]),
                  hash: blockUid[1],
                  revoked: idty.revoked,
                  revokedSig: idty.revocation_sig,
                  sig: idty.self
                });
              }, []));
            }, []);
            // Choose the more updated identity
            var identity = identities.length == 1 ? identities[0] :
              _.sortBy(identities, 'number')[identities.length-1];

            identity.hasSelf = !!(identity.uid && identity.timestamp && identity.sig);
            identity.lookup = {};

            // Store received certifications
            var certPubkeys = [];
            identity.lookup.certifications = !res.results ? [] : res.results.reduce(function(certs, res) {
              return certs.concat(res.uids.reduce(function(certs, idty) {
                return certs.concat(idty.others.reduce(function(certs, cert) {
                  var result = {
                    pubkey: cert.pubkey,
                    uid: cert.uids[0],
                    cert_time:  {
                      block: (cert.meta && cert.meta.block_number)  ? cert.meta.block_number : 0,
                      block_hash: (cert.meta && cert.meta.block_hash)  ? cert.meta.block_hash : null
                    },
                    isMember: cert.isMember,
                    wasMember: cert.wasMember
                  };
                  if (!certPubkeys[cert.pubkey]) {
                    certPubkeys[cert.pubkey] = result;
                  }
                  else { // if duplicated cert: keep the most recent
                    if (result.block > certPubkeys[cert.pubkey].block) {
                      certPubkeys[cert.pubkey] = result;
                      // TODO : to not add, but replace the old one
                    }
                    else {
                      return certs; // skip this result
                    }
                  }
                  return certs.concat(result);
                }, certs));
              }, certs));
            }, []);

            // Store given certifications
            certPubkeys = [];
            identity.lookup.givenCertifications = !res.results ? [] : res.results.reduce(function(certs, res) {
              return certs.concat(res.signed.reduce(function(certs, cert) {
                var result = {
                  pubkey: cert.pubkey,
                  uid: cert.uid,
                  cert_time:  {
                    block: (cert.cert_time && cert.cert_time.block)  ? cert.cert_time.block : 0,
                    block_hash: (cert.cert_time && cert.cert_time.block_hash)  ? cert.cert_time.block_hash : null
                  },
                  sigDate: cert.meta ? cert.meta.timestamp : null,
                  isMember: cert.isMember,
                  wasMember: cert.wasMember
                };
                if (!certPubkeys[cert.pubkey]) {
                  certPubkeys[cert.pubkey] = result;
                  // TODO : to not add, but replace the old one
                }
                else { // if duplicated cert: keep the most recent
                  if (result.block > certPubkeys[cert.pubkey].block) {
                    certPubkeys[cert.pubkey] = result;
                  }
                  else {
                    return certs; // skip this result
                  }
                }
                return certs.concat(result);
              }, certs));
            }, []);

            // Retrieve self time
            return BMA.blockchain.block({block: identity.number})
              .then(function(block){
                identity.sigDate = block.time;

                // Check if self has been done on a valid block
                if (!identity.isMember && identity.number !== 0 && identity.hash !== block.hash) {
                  addEvent(identity, {type: 'error', message: 'ERROR.IDENTITY_INVALID_BLOCK_HASH'});
                  console.debug("[wot] Invalid membership for {0}: block hash changed".format(identity.uid));
                }

                return identity;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && identity.number === '0') {
                  identity.sigDate = Math.trunc(new Date().getTime() / 1000);
                  return identity;
                }
                else {
                  throw err;
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
              return identity;
            }
            else {
              throw err;
            }
          });
      },

      loadCertifications = function(getFunction, pubkey, lookupCertifications, parameters, medianTime, certifiersOf) {

        function _certId(pubkey, block) {
          return pubkey + '-' + block;
        }

        // TODO : remove this later (when all node will use duniter v0.50+)
        var lookupHasCertTime = true; // Will be set ti FALSE before Duniter v0.50
        var lookupCerticationsByCertId = lookupCertifications ? lookupCertifications.reduce(function(res, cert){
          var certId = _certId(cert.pubkey, cert.cert_time ? cert.cert_time.block : cert.sigDate);
          if (!cert.cert_time) lookupHasCertTime = false;
          res[certId] = cert;
          return res;
        }, {}) : {};

        var isMember = true;

        return getFunction({ pubkey: pubkey })
          .then(function(res) {
            return res.certifications.reduce(function (res, cert) {
              // Rappel :
              //   cert.sigDate = blockstamp de l'identité
              //   cert.cert_time.block : block au moment de la certification
              //   cert.written.number : block où la certification est écrite

              var pending = !cert.written;
              var certTime = cert.cert_time ? cert.cert_time.medianTime : null;
              var expiresIn = (!certTime) ? 0 : (pending ?
                (certTime + parameters.sigWindow - medianTime) :
                (certTime + parameters.sigValidity - medianTime));
              expiresIn = (expiresIn < 0) ? 0 : expiresIn;
              // Remove from lookup certs
              var certId = _certId(cert.pubkey, lookupHasCertTime && cert.cert_time ? cert.cert_time.block : cert.sigDate);
              delete lookupCerticationsByCertId[certId];

              // Add to result list
              return res.concat({
                pubkey: cert.pubkey,
                uid: cert.uid,
                time: certTime,
                isMember: cert.isMember,
                wasMember: cert.wasMember,
                expiresIn: expiresIn,
                willExpire: (expiresIn && expiresIn <= csSettings.data.timeWarningExpire),
                pending: pending,
                block: (cert.written !== null) ? cert.written.number :
                  (cert.cert_time ? cert.cert_time.block : null),
                valid: (expiresIn > 0)
              });
            }, []);
          })
          .catch(function(err) {
            if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) { // member not found
              isMember = false;
              return []; // continue (append pendings cert if exists in lookup)
            }
            else {
              throw err;
            }
          })

          // Add pending certs (found in lookup - see loadIdentityByLookup())
          .then(function(certifications) {
            var pendingCertifications = _.values(lookupCerticationsByCertId);
            if (!pendingCertifications.length) return certifications; // No more pending continue

            var pendingCertByBlocks = pendingCertifications.reduce(function(res, cert){
              var block = lookupHasCertTime && cert.cert_time ? cert.cert_time.block :
                (cert.sigDate ? cert.sigDate.split('-')[0] : null);
              if (block) {
                if (!res[block]) {
                  res[block] = [cert];
                }
                else {
                  res[block].push(cert);
                }
              }
              return res;
            }, {});

            // Set time to pending cert, from blocks
            return BMA.blockchain.blocks(_.keys(pendingCertByBlocks)).then(function(blocks){
              certifications = blocks.reduce(function(res, block){
                return res.concat(pendingCertByBlocks[block.number].reduce(function(res, cert) {
                  var certTime = block.medianTime;
                  var expiresIn = Math.max(0, certTime + parameters.sigWindow - medianTime);
                  var validBuid = (!cert.cert_time || !cert.cert_time.block_hash || cert.cert_time.block_hash == block.hash);
                  if (!validBuid) {
                    console.debug("[wot] Invalid cert {0}: block hash changed".format(cert.pubkey.substring(0,8)));
                  }
                  var valid = (expiresIn > 0) && (!certifiersOf || cert.isMember) && validBuid;
                  return res.concat({
                    pubkey: cert.pubkey,
                    uid: cert.uid,
                    isMember: cert.isMember,
                    wasMember: cert.wasMember,
                    time: certTime,
                    expiresIn: expiresIn,
                    willExpire: (expiresIn && expiresIn <= csSettings.data.timeWarningExpire),
                    pending: true,
                    block: lookupHasCertTime && cert.cert_time ? cert.cert_time.block :
                    (cert.sigDate ? cert.sigDate.split('-')[0] : null),
                    valid: valid
                  });
                }, []));
              }, certifications);
              return certifications;
            });
          })

          // Sort and return result
          .then(function(certifications) {

            // Remove pending cert duplicated with a written & valid cert
            var writtenCertByPubkey = certifications.reduce(function(res, cert) {
              if (!cert.pending && cert.valid && cert.expiresIn >= parameters.sigWindow) {
                res[cert.pubkey] = true;
              }
              return res;
            }, {});

            // Final sort
            certifications = _sortCertifications(certifications);

            // Split into valid/pending/error
            var pendingCertifications = [];
            var errorCertifications = [];
            var validCertifications = certifications.reduce(function(res, cert) {
              if (cert.pending) {
                if (cert.valid && !writtenCertByPubkey[cert.pubkey]) {
                  pendingCertifications.push(cert);
                }
                else if (!cert.valid && !writtenCertByPubkey[cert.pubkey]){
                  errorCertifications.push(cert);
                }
                return res;
              }
              return res.concat(cert);
            }, []);

            return {
              valid: validCertifications,
              pending: pendingCertifications,
              error: errorCertifications
            };
          })
          ;
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

      loadData = function(pubkey, withCache, uid) {
        return $q(function(resolve, reject){
          // Check cached data
          var data = withCache ? identityCache.get(pubkey) : null;
          if (data) {
            console.debug("[wot] Found cached identity " + pubkey.substring(0, 8));
            resolve(data);
            return;
          }
          console.debug("[wot] Loading identity " + pubkey.substring(0, 8));
          var now = new Date().getTime();
          data = {pubkey: pubkey};

          var parameters;
          var medianTime;
          $q.all([
            // Get parameters
            BMA.blockchain.parameters()
              .then(function(res) {
                parameters = res;
                data.sigQty =  parameters.sigQty;
                data.sigStock =  parameters.sigStock;
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
              }),

            // Get requirements
            loadRequirements(pubkey, uid)
              .then(function (requirements) {
                data.requirements = requirements;
                data.isMember = requirements.isMember;
              }),

            // Get identity using lookup
            loadIdentityByLookup(pubkey)
              .then(function (identity) {
                  angular.merge(data, identity);
              })
          ])
          .then(function() {

            return $q.all([
              // Get received certifications
              loadCertifications(BMA.wot.certifiersOf, pubkey, data.lookup ? data.lookup.certifications : null, parameters, medianTime, true/*certifiersOf*/)
                .then(function (res) {
                  data.received_cert = res.valid;
                  data.received_cert_pending = res.pending;
                  data.received_cert_error = res.error;
                }),

              // Get given certifications
              loadCertifications(BMA.wot.certifiedBy, pubkey, data.lookup ? data.lookup.givenCertifications : null, parameters, medianTime, false/*certifiersOf*/)
                  .then(function (res) {
                    data.given_cert = res.valid;
                    data.given_cert_pending = res.pending;
                    data.given_cert_error = res.error;
                  }),

              // Get sources
              loadSources(pubkey)
                .then(function (sources) {
                  data.sources = sources;
                }),

              // API extension
              api.data.raisePromise.load(data)
                .catch(function(err) {
                console.debug('Error while loading identity data, on extension point.');
                console.error(err);
              })

            ]);
          })
          .then(function() {
            delete data.lookup; // not need anymore
            identityCache.put(pubkey, data); // add to cache
            console.debug('[wallet] Identity '+ pubkey.substring(0, 8) +' loaded in '+ (new Date().getTime()-now) +'ms');
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
            var blocks = _.sortBy(res.result.blocks, function (n) {
              return -n;
            });
            return getNewcomersRecursive(blocks, 0, 5, size);
          })
          .then(function(idties){
            if (!idties || !idties.length) {
              return null;
            }
            idties = _sortAndLimitIdentities(idties, size);

            // Extension point
            return api.data.raisePromise.search(null, idties)
                .then(function () {
                  return idties;
                })
                .catch(function(err) {
                  console.debug('Error while search identities, on extension point.');
                  console.error(err);
                  return idties;
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
                      memberDate: block.medianTime,
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

      getPending = function(size) {
        size = size || 20;
        return BMA.wot.member.pending()
          .then(function(res) {
            if (!res.memberships || !res.memberships.length) {
              return null;
            }
            var idtiesByBlock = {};
            var idtiesByPubkey = {};
            var idties = [];
            _.forEach(res.memberships, function(ms){
              if (ms.membership == 'IN') {
                var idty = {
                  uid: ms.uid,
                  pubkey: ms.pubkey,
                  block: ms.blockNumber,
                  blockHash: ms.blockHash
                };
                var otherIdtySamePubkey = idtiesByPubkey[ms.pubkey];
                if (otherIdtySamePubkey && idty.block > otherIdtySamePubkey.block) {
                  return; // skip
                }
                idtiesByPubkey[idty.pubkey] = idty;
                if (!idtiesByBlock[idty.block]) {
                  idtiesByBlock[idty.block] = [idty];
                }
                else {
                  idtiesByBlock[idty.block].push(idty);
                }

                // Remove previous idty from map
                if (otherIdtySamePubkey) {
                  idtiesByBlock[otherIdtySamePubkey.block] = idtiesByBlock[otherIdtySamePubkey.block].reduce(function(res, aidty){
                    if (aidty.pubkey == otherIdtySamePubkey.pubkey) return res; // if match idty to remove, to NOT add
                    return (res||[]).concat(aidty);
                  }, null);
                  if (idtiesByBlock[otherIdtySamePubkey.block] === null) {
                    delete idtiesByBlock[otherIdtySamePubkey.block];
                  }
                  return;
                }
                else {
                  idties.push(idty);
                }
              }
            });
            idties = _sortAndLimitIdentities(idtiesByPubkey, size);

            return  $q.all([
              // Get time from blocks
              BMA.blockchain.blocks(_.keys(idtiesByBlock))
              .then(function(blocks) {

                _.forEach(blocks, function(block){
                  _.forEach(idtiesByBlock[block.number], function(idty) {
                    idty.sigDate = block.medianTime;
                    if (block.number !== 0 && idty.blockHash !== block.hash) {
                      addEvent(idty, {type:'error', message: 'ERROR.WOT_PENDING_INVALID_BLOCK_HASH'});
                      console.debug("Invalid membership for uid={0}: block hash not match a real block (block cancelled)".format(idty.uid));
                    }
                  });
                });
              }),

              // Extension point
              api.data.raisePromise.search(null, idties)
                .catch(function(err) {
                  console.debug('Error while search identities, on extension point.');
                  console.error(err);
                })
              ])
              .then(function() {
                return idties;
              });
          });
      },

      getAll = function() {
        var letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','u','v','w','x','y','z'];
        return getAllRecursive(letters, 0, BMA.constants.LIMIT_REQUEST_COUNT);
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
                }, BMA.constants.LIMIT_REQUEST_DELAY);
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

      addEvent = function(data, event) {
        event = event || {};
        event.type = event.type || 'info';
        event.message = event.message || '';
        event.messageParams = event.messageParams || {};
        data.events = data.events || [];
        data.events.push(event);
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
      pending: getPending,
      all: getAll,
      // api extension
      api: api
    };
  };

  var service = factory('default');

  service.instance = factory;
  return service;
});
