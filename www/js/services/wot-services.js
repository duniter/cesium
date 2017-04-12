
angular.module('cesium.wot.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])

.factory('csWot', function($q, $timeout, BMA, Api, CacheFactory, csConfig, csSettings, csCache) {
  'ngInject';

  factory = function(id) {

    var
      api = new Api(this, "csWot-" + id),
      identityCache = csCache.get('csWot-idty-', csCache.constants.SHORT),

      // Add id, and remove duplicated id
      _addUniqueIds = function(idties) {
        var idtyKeys = {};
        return idties.reduce(function(res, idty) {
          idty.id = idty.uid + '-' + idty.pubkey;
          if (!idtyKeys[idty.id]) {
            idtyKeys[idty.id] = true;
            return res.concat(idty);
          }
          return res;
        }, []);
      },

      _sortAndSliceIdentities = function(idties, offset, size) {
        offset = offset || 0;

        // Add unique ids
        idties = _addUniqueIds(idties);

        // Sort by block and
        idties = _.sortBy(idties, function(idty){
          var score = 1;
          score += (1000000 * (idty.block));
          score += (10      * (900 - idty.uid.toLowerCase().charCodeAt(0)));
          return -score;
        });
        if (angular.isDefined(size) && idties.length > size) {
          idties = idties.slice(offset, offset+size); // limit if more than expected size
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
        if (!pubkey) return $q.when({});
        // Get requirements
        return BMA.wot.requirements({pubkey: pubkey})
          .then(function(res){
            if (!res.identities || !res.identities.length)  return;

            // Sort to select the best identity
            if (res.identities.length > 1) {
              // Select the best identity, by sorting using this order
              //  - same wallet uid
              //  - is member
              //  - has a pending membership
              //  - is not expired (in sandbox)
              //  - is not outdistanced
              //  - if has certifications
              //      max(count(certification)
              //    else
              //      max(membershipPendingExpiresIn) = must recent membership
              res.identities = _.sortBy(res.identities, function(idty) {
                var score = 0;
                score += (10000000000 * ((uid && idty.uid === uid) ? 1 : 0));
                score += (1000000000  * (idty.membershipExpiresIn > 0 ? 1 : 0));
                score += (100000000   * (idty.membershipPendingExpiresIn > 0 ? 1 : 0));
                score += (10000000    * (!idty.expired ? 1 : 0));
                score += (1000000     * (!idty.outdistanced ? 1 : 0));
                var certCount = !idty.expired && idty.certifications ? idty.certifications.length : 0;
                score += (1         * (certCount ? certCount : 0));
                score += (1         * (!certCount && idty.membershipPendingExpiresIn > 0 ? idty.membershipPendingExpiresIn/1000 : 0));
                return -score;
              });
              console.debug('Found {0} identities. Will selected the best one'.format(res.identities.length));
            }
            var requirements = res.identities[0];
            // Add useful custom fields
            requirements.hasSelf = true;
            requirements.needMembership = (requirements.membershipExpiresIn <= 0 &&
                                           requirements.membershipPendingExpiresIn <= 0 );
            requirements.needRenew = (!requirements.needMembership &&
                                      requirements.membershipExpiresIn <= csSettings.data.timeWarningExpire &&
                                      requirements.membershipPendingExpiresIn <= 0 );
            requirements.canMembershipOut = (requirements.membershipExpiresIn > 0);
            requirements.pendingMembership = (requirements.membershipExpiresIn <= 0 && requirements.membershipPendingExpiresIn > 0);
            requirements.isMember = (requirements.membershipExpiresIn > 0);
            // Force certification count to 0, is not a member yet - fix #269
            requirements.certificationCount = (requirements.isMember && requirements.certifications) ? requirements.certifications.length : 0;
            requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
              if (cert.expiresIn <= csSettings.data.timeWarningExpire) {
                cert.willExpire = true;
                return count + 1;
              }
              return count;
            }, 0) : 0;
            requirements.pendingRevocation = !requirements.revoked && !!requirements.revocation_sig;

            return requirements;
          })
          .catch(function(err) {
            // If not a member: continue
            if (!!err &&
                (err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER ||
                 err.ucode == BMA.errorCodes.NO_IDTY_MATCHING_PUB_OR_UID)) {
              return {
                hasSelf: false,
                needMembership: true,
                canMembershipOut: false,
                needRenew: false,
                pendingMembership: false,
                needCertifications: false,
                needCertificationCount: 0,
                willNeedCertificationCount: 0
              };
            }
            throw err;
          });
      },

      loadIdentityByLookup = function(pubkey, uid) {
        return BMA.wot.lookup({ search: pubkey||uid })
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
                  revocationNumber: idty.revoked_on,
                  sig: idty.self
                });
              }, []));
            }, []);

            // Sort identities if need
            if (identities.length) {
              // Select the best identity, by sorting using this order
              //  - same given uid
              //  - not revoked
              //  - max(block_number)
              identities = _.sortBy(identities, function(idty) {
                var score = 0;
                score += (10000000000 * ((uid && idty.uid === uid) ? 1 : 0));
                score += (1000000000  * (!idty.revoked ? 1 : 0));
                score += (1           * (idty.number ? idty.number : 0));
                return -score;
              });
            }
            var identity = identities[0];

            identity.hasSelf = !!(identity.uid && identity.timestamp && identity.sig);
            identity.lookup = {};

            // Store received certifications
            var certPubkeys = [];
            identity.lookup.certifications = !res.results ? {} : res.results.reduce(function(certsMap, res) {
              return res.uids.reduce(function(certsMap, idty) {
                var idtyFullKey = idty.uid + '-' + (idty.meta ? idty.meta.timestamp : '');
                certsMap[idtyFullKey] = idty.others.reduce(function(certs, cert) {
                  var result = {
                    pubkey: cert.pubkey,
                    uid: cert.uids[0],
                    cert_time:  {
                      block: (cert.meta && cert.meta.block_number)  ? cert.meta.block_number : 0,
                      block_hash: (cert.meta && cert.meta.block_hash)  ? cert.meta.block_hash : null
                    },
                    isMember: cert.isMember,
                    wasMember: cert.wasMember,
                  };
                  if (!certPubkeys[cert.pubkey]) {
                    certPubkeys[cert.pubkey] = result;
                  }
                  else { // if duplicated cert: keep the most recent
                    if (result.cert_time.block > certPubkeys[cert.pubkey].cert_time.block) {
                      certPubkeys[cert.pubkey] = result;
                      certs.splice(_.findIndex(certs, {pubkey: cert.pubkey}), 1, result);
                      return certs;
                    }
                    else {
                      return certs; // skip this cert
                    }
                  }
                  return certs.concat(result);
                }, []);
                return certsMap;
              }, certsMap);
            }, {});

            // Store given certifications
            certPubkeys = [];
            identity.lookup.givenCertifications = !res.results ? [] : res.results.reduce(function(certs, res) {
              return res.signed.reduce(function(certs, cert) {
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
              }, certs);
            }, []);

            // Retrieve time (self and revocation)
            var blocks = [identity.number];
            if (identity.revocationNumber) {
              blocks.push(identity.revocationNumber);
            }
            return BMA.blockchain.blocks(blocks)
              .then(function(blocks){
                identity.sigDate = blocks[0].medianTime;

                // Check if self has been done on a valid block
                if (identity.number !== 0 && identity.hash !== blocks[0].hash) {
                  identity.hasBadSelfBlock = true;
                }

                // Set revocation time
                if (identity.revocationNumber) {
                  identity.revocationTime = blocks[1].medianTime;
                }

                return identity;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND && identity.number === 0) {
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

            // Special case for initPhase - issue #
            if (csConfig.initPhase) {
              return pendingCertifications.reduce(function(res, cert) {
                return res.concat({
                  pubkey: cert.pubkey,
                  uid: cert.uid,
                  isMember: cert.isMember,
                  wasMember: cert.wasMember,
                  time: null,
                  expiresIn: parameters.sigWindow,
                  willExpire: false,
                  pending: true,
                  block: 0,
                  valid: true
                });
              }, certifications);
            }

            var pendingCertByBlocks = pendingCertifications.reduce(function(res, cert){
              var block = lookupHasCertTime && cert.cert_time ? cert.cert_time.block :
                (cert.sigDate ? cert.sigDate.split('-')[0] : null);
              if (angular.isDefined(block)) {
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

      finishLoadRequirements = function(data) {
        data.requirements.needCertificationCount = (!data.requirements.needMembership && (data.requirements.certificationCount < data.sigQty)) ?
          (data.sigQty - data.requirements.certificationCount) : 0;
        data.requirements.willNeedCertificationCount = (!data.requirements.needMembership && !data.requirements.needCertificationCount &&
          (data.requirements.certificationCount - data.requirements.willExpireCertificationCount) < data.sigQty) ?
          (data.sigQty - data.requirements.certificationCount + data.requirements.willExpireCertificationCount) : 0;
        data.requirements.pendingCertificationCount = data.received_cert_pending ? data.received_cert_pending.length : 0;

        // Use /wot/lookup.revoked when requirements not filled
        data.requirements.revoked = angular.isDefined(data.requirements.revoked) ? data.requirements.revoked : data.revoked;

        // Add events
        if (data.requirements.revoked) {
          delete data.hasBadSelfBlock;
          addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_REVOKED', messageParams: {revocationTime: data.revocationTime}});
          console.debug("[wot] Identity [{0}] has been revoked".format(data.uid));
        }
        else if (data.requirements.pendingRevocation) {
          addEvent(data, {type:'error', message: 'ERROR.IDENTITY_PENDING_REVOCATION'});
          console.debug("[wot] Identity [{0}] has pending revocation".format(data.uid));
        }
        else if (data.hasBadSelfBlock) {
          delete data.hasBadSelfBlock;
          if (!data.isMember) {
            addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_INVALID_BLOCK_HASH'});
            console.debug("[wot] Invalid membership for {0}: block hash changed".format(data.uid));
          }
        }
        else if (data.requirements.expired) {
          addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_EXPIRED'});
          console.debug("[wot] Identity {0} expired (in sandbox)".format(data.uid));
        }
        else if (data.requirements.willNeedCertificationCount > 0) {
          addEvent(data, {type: 'error', message: 'INFO.IDENTITY_WILL_MISSING_CERTIFICATIONS', messageParams: data.requirements});
          console.debug("[wot] Identity {0} will need {1} certification(s)".format(data.uid, data.requirements.willNeedCertificationCount));
        }
      },

      loadSources = function(pubkey) {
        return BMA.tx.sources({pubkey: pubkey})
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
            return {
              sources: sources,
              sourcesIndexByKey: sourcesIndexByKey,
              balance: balance
            };
          });
      },

      loadData = function(pubkey, withCache, uid, force) {

        var data;

        if (!pubkey && uid && !force) {
          return BMA.wot.member.getByUid(uid)
            .then(function(member) {
              if (member) return loadData(member.pubkey, withCache, member.uid); // recursive call
              //throw {message: 'NOT_A_MEMBER'};
              return loadData(pubkey, withCache, uid, true/*force*/);
            });
        }

        // Check cached data
        if (pubkey) {
          data = withCache ? identityCache.get(pubkey) : null;
          if (data && (!uid || data.uid == uid)) {
            console.debug("[wot] Identity " + pubkey.substring(0, 8) + " found in cache");
            return $q.when(data);
          }
          console.debug("[wot] Loading identity " + pubkey.substring(0, 8) + "...");
          data = {pubkey: pubkey};
        }
        else {
          console.debug("[wot] Loading identity from uid " + uid);
          data = {};
        }

        var now = new Date().getTime();

        var parameters;
        var medianTime;

        return $q.all([
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
            loadIdentityByLookup(pubkey, uid)
              .then(function (identity) {
                  angular.merge(data, identity);
              })
          ])
          .then(function() {
            if (!data.requirements.uid) return;

            var idtyFullKey = data.requirements.uid + '-' + data.requirements.meta.timestamp;

            return $q.all([
              // Get received certifications
              loadCertifications(BMA.wot.certifiersOf, data.pubkey, data.lookup ? data.lookup.certifications[idtyFullKey] : null, parameters, medianTime, true /*certifiersOf*/)
                .then(function (res) {
                  data.received_cert = res.valid;
                  data.received_cert_pending = res.pending;
                  data.received_cert_error = res.error;
                }),

              // Get given certifications
              loadCertifications(BMA.wot.certifiedBy, data.pubkey, data.lookup ? data.lookup.givenCertifications : null, parameters, medianTime, false/*certifiersOf*/)
                .then(function (res) {
                  data.given_cert = res.valid;
                  data.given_cert_pending = res.pending;
                  data.given_cert_error = res.error;
                })

              // Get sources
               // NOT NEED for now
              /*loadSources(pubkey)
                .then(function (sources) {
                  data.sources = sources;
                })
              */
            ]);
          })
          .then(function() {
            // Add compute some additional requirements (that required all data like certifications)
            finishLoadRequirements(data);

            // API extension
            return api.data.raisePromise.load(data)
              .catch(function(err) {
                console.debug('Error while loading identity data, on extension point.');
                console.error(err);
              });
          })
          .then(function() {
            if (!data.pubkey) return undefined; // not found
            delete data.lookup; // not need anymore
            identityCache.put(data.pubkey, data); // add to cache
            console.debug('[wot] Identity '+ data.pubkey.substring(0, 8) +' loaded in '+ (new Date().getTime()-now) +'ms');
            return data;
          });
      },

      search = function(text, options) {
        if (!text || text.trim() !== text) {
          return $q.when(undefined);
        }

        // Remove first special characters (to avoid request error)
        var safeText = text.replace(/(^|\s)#\w+/g, ''); // remove tags
        safeText = safeText.replace(/[^a-zA-Z0-9_-\s]+/g, '');
        safeText = safeText.replace(/\s+/g, ' ').trim();

        options = options || {};
        options.addUniqueId = angular.isDefined(options.addUniqueId) ? options.addUniqueId : true;
        options.allowExtension = angular.isDefined(options.allowExtension) ? options.allowExtension : true;
        options.excludeRevoked = angular.isDefined(options.excludeRevoked) ? options.excludeRevoked : false;

        var promise;
        if (!safeText) {
          promise = $q.when([]);
        }
        else {
          promise = $q.all(
            safeText.split(' ').reduce(function(res, text) {
              console.debug('[wot] Will search on: \'' + text + '\'');
              return res.concat(BMA.wot.lookup({ search: text }));
            }, [])
          ).then(function(res){
              return res.reduce(function(idties, res) {
                return idties.concat(res.results.reduce(function(idties, res) {
                  return idties.concat(res.uids.reduce(function(uids, idty) {
                    var blocUid = idty.meta.timestamp.split('-', 2);
                    var revoked = !idty.revoked && idty.revocation_sig;
                    if (!options.excludeRevoked || !revoked) {
                      return uids.concat({
                        uid: idty.uid,
                        pubkey: res.pubkey,
                        number: blocUid[0],
                        hash: blocUid[1],
                        revoked: revoked
                      });
                    }
                    return uids;
                  }, []));
                }, []));
              }, []);
            })
            .catch(function(err) {
              if (err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) {
                return [];
              }
              else {
                throw err;
              }
            });
        }

        return promise
          .then(function(idties) {
            if (!options.allowExtension) {
              // Add unique id (if enable)
              return options.addUniqueId ? _addUniqueIds(idties) : idties;
            }
            // call extension point
            return api.data.raisePromise.search(text, idties, 'pubkey')
              .then(function() {
                // Add unique id (if enable)
                return options.addUniqueId ? _addUniqueIds(idties) : idties;
              });
          });
      },

      getNewcomers = function(offset, size) {
        offset = offset || 0;
        size = size || 20;
        return BMA.blockchain.stats.newcomers()
          .then(function(res) {
            if (!res.result.blocks || !res.result.blocks.length) {
              return null;
            }
            var blocks = _.sortBy(res.result.blocks, function (n) {
              return -n;
            });
            return getNewcomersRecursive(blocks, 0, 5, offset+size);
          })
          .then(function(idties){
            if (!idties || !idties.length) {
              return null;
            }
            idties = _sortAndSliceIdentities(idties, offset, size);

            // Extension point
            return extendAll(idties, 'pubkey', true/*skipAddUid*/);
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
                    var idtyKey = parts[parts.length-1]/*uid*/ + '-' + parts[0]/*pubkey*/;
                    result.push({
                      id: idtyKey,
                      uid: parts[parts.length-1],
                      pubkey:parts[0],
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

      getPending = function(offset, size) {
        offset = offset || 0;
        size = size || 20;
        return $q.all([
          BMA.wot.member.uids(),
          BMA.wot.member.pending()
            .then(function(res) {
              return (res.memberships && res.memberships.length) ? res.memberships : undefined;
            })
          ])
          .then(function(res) {
            var uids = res[0];
            var memberships = res[1];
            if (!memberships) return;

            var idtiesByBlock = {};
            var idtiesByPubkey = {};
            _.forEach(memberships, function(ms){
              if (ms.membership == 'IN' && !uids[ms.pubkey]) {
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
                }
              }
            });
            var idties = _sortAndSliceIdentities(_.values(idtiesByPubkey), offset, size);
            var blocks = idties.reduce(function(res, aidty) {
              return res.concat(aidty.block);
            }, []);

            return  $q.all([
              // Get time from blocks
              BMA.blockchain.blocks(_.uniq(blocks))
              .then(function(blocks) {

                _.forEach(blocks, function(block){
                  _.forEach(idtiesByBlock[block.number], function(idty) {
                    idty.sigDate = block.medianTime;
                    if (block.number !== 0 && idty.blockHash !== block.hash) {
                      addEvent(idty, {type:'error', message: 'ERROR.WOT_PENDING_INVALID_BLOCK_HASH'});
                      console.debug("Invalid membership for uid={0}: block hash changed".format(idty.uid));
                    }
                  });
                });
              }),

              // Extension point
              extendAll(idties, 'pubkey', true/*skipAddUid*/)
            ])
            .then(function() {
              return idties;
            });
          });
      },

      getAll = function() {
        var letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','u','v','w','x','y','z'];
        return getAllRecursive(letters, 0, BMA.constants.LIMIT_REQUEST_COUNT)
          .then(function(idties) {
            return extendAll(idties, 'pubkey', true/*skipAddUid*/)
              .then(function() {
                return _addUniqueIds(idties);
              });
          });
      },

      getAllRecursive = function(letters, offset, size) {
        return $q(function(resolve, reject) {
          var result = [];
          var pubkeys = {};
          var jobs = [];
          _.each(letters.slice(offset, offset+size), function(letter) {
            jobs.push(
              search(letter, {
                addUniqueId: false, // will be done in parent method
                allowExtension: false // extension point will be called in parent method
              })
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

      extendAll = function(idties, pubkeyAttributeName, skipAddUid) {

        pubkeyAttributeName = pubkeyAttributeName || 'pubkey';

        var jobs = [];
        if (!skipAddUid) jobs.push(BMA.wot.member.uids());

        jobs.push(api.data.raisePromise.search(null, idties, pubkeyAttributeName)
          .catch(function(err) {
            console.debug('Error while search identities, on extension point.');
            console.error(err);
          }));

        return $q.all(jobs)
        .then(function(res) {
          if (!skipAddUid) {
            var uidsByPubkey = res[0];
            // Set uid (on every data)
            _.forEach(idties, function(data) {
              if (!data.uid && data[pubkeyAttributeName]) {
                data.uid = uidsByPubkey[data[pubkeyAttributeName]];
                // Remove name if redundant with uid
                if (data.uid && data.uid == data.name) {
                  delete data.name;
                }
              }
            });
          }

          return idties;
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
      extendAll: extendAll,
      // api extension
      api: api
    };
  };

  var service = factory('default');

  service.instance = factory;
  return service;
});
