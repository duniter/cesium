
angular.module('cesium.wot.services', ['ngApi', 'cesium.bma.services', 'cesium.crypto.services', 'cesium.utils.services',
  'cesium.settings.services'])

.factory('csWot', function($rootScope, $q, $timeout, BMA, Api, CacheFactory, csConfig, csCurrency, csSettings, csCache) {
  'ngInject';

  function factory(id) {

    var
      api = new Api(this, "csWot-" + id),
      cachePrefix = 'csWot-',
      identityCache = csCache.get(cachePrefix + 'idty-', csCache.constants.MEDIUM),
      requirementsCache = csCache.get(cachePrefix + 'requirements-', csCache.constants.MEDIUM),

      // Add id, and remove duplicated id
      _addUniqueIds = function(idties) {
        var idtyKeys = {};
        return idties.reduce(function(res, idty) {
          idty.id = idty.id || idty.uid + '-' + idty.pubkey;
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

      _resetRequirements = function(data) {
        data.requirements = {
          loaded: false,
          meta: {},
          hasSelf: false,
          needSelf: true,
          needMembership: true,
          canMembershipOut: false,
          needRenew: false,
          pendingMembership: false,
          isMember: false,
          wasMember: false,
          certificationCount: 0,
          needCertifications: false,
          needCertificationCount: 0,
          willNeedCertificationCount: 0,
          alternatives: undefined
        };
        data.blockUid = null;
        data.isMember = false;
        data.sigDate = null;
        data.hasSelf = false;
      },

      _fillRequirements = function(requirements, currencyParameters) {
        // Add useful custom fields
        requirements.hasSelf = !!requirements.meta.timestamp;
        requirements.needSelf = !requirements.hasSelf || requirements.meta.invalid;
        requirements.wasMember = angular.isDefined(requirements.wasMember) ? requirements.wasMember : false; // Compat with Duniter 0.9
        requirements.needMembership = (!requirements.revoked && requirements.membershipExpiresIn <= 0 && requirements.membershipPendingExpiresIn <= 0 && !requirements.wasMember);
        requirements.needRenew = (!requirements.needMembership && !requirements.revoked &&
          requirements.membershipExpiresIn <= csSettings.data.timeWarningExpireMembership &&
          requirements.membershipPendingExpiresIn <= 0) ||
          (requirements.wasMember && !requirements.revoked && requirements.membershipExpiresIn === 0 &&
          requirements.membershipPendingExpiresIn === 0);
        requirements.canMembershipOut = (!requirements.revoked && requirements.membershipExpiresIn > 0);
        requirements.pendingMembership = (!requirements.revoked && requirements.membershipExpiresIn <= 0 && requirements.membershipPendingExpiresIn > 0);
        requirements.isMember = (!requirements.revoked && requirements.membershipExpiresIn > 0);
        requirements.blockUid = requirements.meta.timestamp;
        // Force certification count to 0, is not a member yet - fix #269
        requirements.certificationCount = ((requirements.isMember || (requirements.wasMember && !requirements.expired)) && requirements.certifications) ? requirements.certifications.length : 0;
        requirements.willExpireCertificationCount = requirements.certifications ? requirements.certifications.reduce(function(count, cert){
          return count + (cert.expiresIn <= csSettings.data.timeWarningExpire ? 1 : 0);
        }, 0) : 0;
        requirements.willExpire = requirements.willExpireCertificationCount > 0;
        requirements.pendingRevocation = !requirements.revoked && !!requirements.revocation_sig;
        //requirements.outdistanced = requirements.outdistanced; // outdistanced is always present in requirement - see #777

        // Fix pending certifications count - Fix #624
        if (!requirements.isMember && !requirements.wasMember) {
          var certifiers = _.union(
            _.pluck(requirements.pendingCerts || [], 'from'),
            _.pluck(requirements.certifications || [], 'from')
          );
          requirements.pendingCertificationCount = _.size(certifiers);
        }
        else {
          requirements.pendingCertificationCount = angular.isDefined(requirements.pendingCerts) ? requirements.pendingCerts.length : 0 ;
        }

        // Compute
        requirements.needCertificationCount = (!requirements.needSelf && (requirements.certificationCount < currencyParameters.sigQty)) ?
          (currencyParameters.sigQty - requirements.certificationCount) : 0;
        requirements.willNeedCertificationCount = (!requirements.needMembership && !requirements.needCertificationCount &&
        (requirements.certificationCount - requirements.willExpireCertificationCount) < currencyParameters.sigQty) ?
          (currencyParameters.sigQty - requirements.certificationCount + requirements.willExpireCertificationCount) : 0;

        // Mark as loaded - need by csWallet.isDataLoaded()
        requirements.loaded = true;


        return requirements;
      },

      _fillIdentitiesMeta = function(identities) {
        if (!identities) return $q.when(identities);

        var blocks = [];
        _.forEach(identities, function(identity) {
          var blockUid = identity.meta.timestamp.split('-', 2);
          identity.meta.number = parseInt(blockUid[0]);
          identity.meta.hash = blockUid[1];
          identity.meta.sig = identity.meta.sig || identity.sig;
          delete identity.sig;
          blocks.push(identity.meta.number);
        });

        // Get identities blocks, to fill self and revocation time
        return BMA.blockchain.blocks(_.uniq(blocks))
          .then(function(blocks) {
            _.forEach(identities, function(identity) {
              var block = _.findWhere(blocks, {number: identity.meta.number});
              identity.meta.time = block && block.medianTime;

              // Check if self has been done on a valid block
              if (block && identity.meta.number !== 0 && identity.meta.hash !== block.hash) {
                identity.meta.invalid = true;
              }
            });

            return identities;
          })
          .catch(function(err){
            // Special case for currency init (root block not exists): use now
            if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND) {
              _.forEach(identities, function(identity) {
                if (identity.number === 0) {
                  identity.meta.time = moment().utc().unix();
                }
              });
              return identities;
            }
            else {
              throw err;
            }
          });
      },

      loadRequirements = function(inputData, withCache) {
        if (!inputData || (!inputData.pubkey && !inputData.uid)) return $q.when(inputData);

        var cacheKey =  inputData.pubkey||inputData.uid;
        var data = (withCache !== false) ? requirementsCache.get(cacheKey) : null;
        if (data) {
          console.debug("[wot] Requirements " + cacheKey + " found in cache");
          // Update data with cache
          angular.merge(inputData, data);
          return $q.when(data)
        }
        data = {pubkey: inputData.pubkey, uid: inputData.uid};

        var now = Date.now();

        return $q.all([
          // Get currency
          csCurrency.get(),

          // Get requirements
          BMA.wot.requirements({pubkey: data.pubkey||data.uid}, false/*no cache*/)
            .then(function(res) {
              return _fillIdentitiesMeta(res && res.identities);
            })
        ])
          .then(function(res){
            var currency = res[0];
            var identities = res[1];

            if (!identities || !identities.length) return;

            // Sort to select the best identity
            if (identities.length > 1) {
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
              identities = _.sortBy(identities, function(idty) {
                var score = 0;
                score += (1000000000000* ((data.uid && idty.uid === data.uid) ? 1 : 0));
                score += (100000000000 * (!idty.meta.invalid ? 1 : 0));
                score += (10000000000  * ((data.blockUid && idty.meta.timestamp && idty.meta.timestamp === data.blockUid) ? 1 : 0));
                score += (1000000000   * (idty.membershipExpiresIn > 0 ? 1 : 0));
                score += (100000000    * (idty.membershipPendingExpiresIn > 0 ? 1 : 0));
                score += (10000000     * (!idty.expired ? 1 : 0));
                score += (1000000      * (!idty.outdistanced ? 1 : 0));
                score += (100000       * (idty.wasMember ? 1 : 0));
                var certCount = !idty.expired && idty.certifications ? idty.certifications.length : 0;
                score += (1            * (certCount ? certCount : 0));
                score += (1            * (!certCount && idty.membershipPendingExpiresIn > 0 ? idty.membershipPendingExpiresIn/1000 : 0));
                return -score;
              });
              console.debug('[wot] Found {0} identities (in requirements). Will selected the best one'.format(identities.length));
            }

            // Select the first identity
            data.requirements = _fillRequirements(identities[0], currency.parameters);

            // Copy some useful properties into data
            data.pubkey = data.requirements.pubkey;
            data.uid = data.requirements.uid;
            data.isMember =  data.requirements.isMember;
            data.blockUid =  data.requirements.meta &&  data.requirements.meta.timestamp;
            data.hasSelf =  data.requirements.hasSelf;
            data.sigDate =  data.requirements.meta && data.requirements.meta.time;

            // Prepare alternatives identities if any
            if (!data.requirements.isMember && !data.requirements.wasMember && identities.length > 1) {
              data.requirements.alternatives = identities.splice(1);
              _.forEach(data.requirements.alternatives, function(requirements) {
                _fillRequirements(requirements, currency.parameters);
              });
            }

            /// Save to cache
            requirementsCache.put(cacheKey, data);

            angular.merge(inputData, data); // Update the input data

            console.debug("[wot] Requirements for '{0}' loaded in {1}ms".format((data.pubkey && data.pubkey.substring(0,8))||data.uid, Date.now() - now));

            return inputData;
          })
          .catch(function(err) {
            _resetRequirements(inputData);
            // If not a member: continue
            if (!!err &&
                (err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER ||
                 err.ucode == BMA.errorCodes.NO_IDTY_MATCHING_PUB_OR_UID)) {
              inputData.requirements.loaded = true;
              return inputData;
            }
            throw err;
          });
      },



      loadIdentityByLookup = function(pubkey, uid) {
        var data = {
          pubkey: pubkey,
          uid: uid,
          hasSelf: false
        };
        return BMA.wot.lookup({ search: pubkey||uid })
          .then(function(res){
            var identities = res.results.reduce(function(idties, res) {
              return idties.concat(res.uids.reduce(function(uids, idty) {
                var blockUid = idty.meta.timestamp.split('-', 2);
                var blockNumber = parseInt(blockUid[0]);
                return uids.concat({
                  uid: idty.uid,
                  pubkey: res.pubkey,
                  meta: {
                    timestamp: idty.meta.timestamp,
                    number: blockNumber,
                    hash: blockUid[1],
                    sig: idty.self
                  },
                  revoked: idty.revoked,
                  revoked_on: idty.revoked_on
                });
              }, []));
            }, []);

            // Fill identities meta (self)
            return _fillIdentitiesMeta(identities)
              .then(function(identities) {
                return {
                  identities: identities,
                  results: res.results
                };
              });
          })
          .then(function(res){
            var identities = res.identities;

            // Sort identities if need
            if (identities.length > 1) {
              // Select the best identity, by sorting using this order
              //  - valid block
              //  - same given uid
              //  - not revoked
              //  - max(block_number)
              res.identities = _.sortBy(identities, function(idty) {
                var score = 0;
                score += (100000000000 * ((data.uid && idty.uid === data.uid) ? 1 : 0));
                score += (10000000000  * (!idty.meta.invalid ? 1 : 0));
                score += (1000000000  * ((data.blockUid && idty.meta.timestamp && idty.meta.timestamp === data.blockUid) ? 1 : 0));
                score += (100000000   * (!idty.revoked ? 1 : 0));
                score += (1            * (idty.meta.number ? idty.meta.number : 0) / 1000);
                return -score;
              });
              console.debug('[wot] Found {0} identities (in lookup). Will selected the best one'.format(identities.length));
            }

            // Prepare alternatives identities
            _.forEach(identities, function(idty) {
              idty.hasSelf = !!(idty.uid && idty.meta.timestamp && idty.meta.sig);
            });

            // Select the first identity
            data.requirements = identities[0];

            // Copy some useful properties into data
            data.pubkey = data.requirements.pubkey;
            data.uid = data.requirements.uid;
            data.blockUid = data.requirements.meta && data.requirements.meta.timestamp;
            data.hasSelf = data.requirements.hasSelf;
            data.sigDate =  data.requirements.meta && data.requirements.meta.time;

            if (identities.length > 1) {
              data.requirements.alternatives = identities.splice(1);
            }

            // Store additional data (e.g. certs)
            data.lookup = {};

            // Store received certifications (can be usefull later)
            var certPubkeys = {};
            data.lookup.certifications = (res.results || []).reduce(function(certsMap, res) {
              return res.uids.reduce(function(certsMap, idty) {
                var idtyFullKey = idty.uid + '-' + (idty.meta ? idty.meta.timestamp : '');
                certsMap[idtyFullKey] = (idty.others||[]).reduce(function(certs, cert) {
                  var certFullKey = idtyFullKey + '-' + cert.pubkey;
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
                  if (!certPubkeys[certFullKey]) {
                    certPubkeys[certFullKey] = result;
                  }
                  else { // if duplicated cert: keep the most recent
                    if (result.cert_time.block > certPubkeys[certFullKey].cert_time.block) {
                      certPubkeys[certFullKey] = result;
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
            certPubkeys = {};
            data.lookup.givenCertifications = (res.results || []).reduce(function(certs, res) {
              return (res.signed || []).reduce(function(certs, cert) {
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
                }
                else { // if duplicated cert: keep the most recent
                  if (result.block > certPubkeys[cert.pubkey].block) {
                    certPubkeys[cert.pubkey] = result;
                    // TODO: Replace the existing one ? May be not, to be able to see renewal
                    // (see issue #806)
                    //  If yes (need to replace), check this code works:
                    //certs.splice(_.findIndex(certs, {pubkey: cert.pubkey}), 1, result);
                    //return certs;
                  }
                  else {
                    return certs; // skip this cert
                  }
                }
                return certs.concat(result);
              }, certs);
            }, []);

            return data;
          })
          .catch(function(err) {
            if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) { // Identity not found (if no self)
              _resetRequirements(data);
              return data;
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
            return (res && res.certifications || []).reduce(function (res, cert) {
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
            /*FIXME: workaround for Duniter issue #1309 */
            else if (!!err && err.ucode == 1002) {
              console.warn("[wallet-service] Detecting Duniter issue #1309 ! Applying workaround... ");
              isMember = false;
              return []; // not found
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
            if (csCurrency.data.initPhase) {
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

      // Add events on given account
      addEvents = function(data) {

        if (data.requirements.revoked) {
          delete data.requirements.meta.invalid;
          if (data.requirements.revoked_on) {
            addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_REVOKED_WITH_TIME', messageParams: {revocationTime: data.requirements.revoked_on}});
            console.debug("[wot] Identity [{0}] has been revoked on {1}".format(data.uid, data.requirements.revoked_on));
          }
          else {
            addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_REVOKED'});
            console.debug("[wot] Identity [{0}] has been revoked".format(data.uid));
          }
        }
        else if (data.requirements.pendingRevocation) {
          delete data.requirements.meta.invalid;
          addEvent(data, {type:'error', message: 'ERROR.IDENTITY_PENDING_REVOCATION'});
          console.debug("[wot] Identity [{0}] has pending revocation".format(data.uid));
        }
        else if (data.requirements.meta && data.requirements.meta.invalid) {
          if (!data.isMember) {
            addEvent(data, {type: 'error', message: 'ERROR.IDENTITY_INVALID_BLOCK_HASH'});
            console.debug("[wot] Invalid membership for uid {0}: block hash changed".format(data.uid));
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
        else if (!data.requirements.needSelf && data.requirements.needMembership) {
          addEvent(data, {type: 'error', message: 'INFO.IDENTITY_NEED_MEMBERSHIP'});
          console.debug("[wot] Identity {0} has a self but no membership".format(data.uid));
        }
        if (!data.isMember && data.requirements.alternatives) {
          addEvent(data, {type: 'info', message: 'INFO.HAS_ALTERNATIVE_IDENTITIES'});
        }
      },

      loadData = function(pubkey, uid, options) {

        options = options || {};
        var data;

        if (!pubkey && uid && !options.force) {
          return BMA.wot.member.getByUid(uid)
            .then(function(member) {
              if (member) return loadData(member.pubkey, member.uid, options); // recursive call, with a pubkey
              //throw {message: 'NOT_A_MEMBER'};
              var options = angular.copy(options || {});
              options.force = true;
              return loadData(pubkey, uid, options); // Loop with force=true
            });
        }

        // Check cached data
        if (pubkey) {
          data = (options.cache !== false) ? identityCache.get(pubkey) : null;
          if (data && (!uid || data.uid === uid) && (!options.blockUid || data.blockUid === options.blockUid)) {
            console.debug("[wot] Identity " + pubkey.substring(0, 8) + " found in cache");
            return $q.when(data);
          }
          console.debug("[wot] Loading identity " + pubkey.substring(0, 8) + "...");
          data = {
            pubkey: pubkey,
            uid: uid
          };
        }
        else {
          console.debug("[wot] Loading identity from uid " + uid);
          data = {
            uid: uid
          };
        }
        if (options.blockUid) {
          data.blockUid = options.blockUid;
        }

        var now = Date.now();
        var parameters;
        var medianTime;

        return $q.all([
            // Get parameters
            csCurrency.parameters()
              .then(function(res) {
                parameters = res;
              }),
            // Get current time
            csCurrency.blockchain.current()
              .then(function(current) {
                medianTime = current.medianTime;
              })
              .catch(function(err){
                // Special case for currency init (root block not exists): use now
                if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
                  medianTime = moment.utc().unix();
                }
                else {
                  throw err;
                }
              }),

            // Get requirements
            loadRequirements(data, options.cache !== false),

            // Get identity using lookup
            loadIdentityByLookup(pubkey, uid)

          ])
          .then(function(res) {
            var dataByLookup = res[3];

            // If no requirements found: copy from lookup data
            if (!data.requirements.uid) {
              console.debug("[wot] No requirements found: using data from lookup");
              angular.merge(data, dataByLookup);
              delete data.lookup; // not need
              return;
            }

            var idtyFullKey = data.requirements.uid + '-' + data.requirements.meta.timestamp;

            return $q.all([
              // Get received certifications
              loadCertifications(BMA.wot.certifiersOf, data.pubkey, dataByLookup.lookup ? dataByLookup.lookup.certifications[idtyFullKey] : null, parameters, medianTime, true /*certifiersOf*/)
                .then(function (res) {
                  data.received_cert = res.valid;
                  data.received_cert_pending = res.pending;
                  data.received_cert_error = res.error;
                }),

              // Get given certifications
              loadCertifications(BMA.wot.certifiedBy, data.pubkey, dataByLookup.lookup ? dataByLookup.lookup.givenCertifications : null, parameters, medianTime, false/*certifiersOf*/)
                .then(function (res) {
                  data.given_cert = res.valid;
                  data.given_cert_pending = res.pending;
                  data.given_cert_error = res.error;
                })
            ]);
          })
          .then(function() {

            // Add compute some additional requirements (that required all data like certifications)
            data.requirements.pendingCertificationCount = data.received_cert_pending ? data.received_cert_pending.length : data.requirements.pendingCertificationCount;
            // Use /wot/lookup.revoked when requirements not filled
            data.requirements.revoked = angular.isDefined(data.requirements.revoked) ? data.requirements.revoked : data.revoked;

            // Add account events
            addEvents(data);

            // API extension
            return api.data.raisePromise.load(data)
              .catch(function(err) {
                console.debug('Error while loading identity data, on extension point.');
                console.error(err);
              });
          })
          .then(function() {
            if (!data.pubkey) return undefined; // not found
            identityCache.put(data.pubkey, data); // add to cache
            console.debug('[wot] Identity '+ data.pubkey.substring(0, 8) +' loaded in '+ (Date.now()-now) +'ms');
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
            var lookupResultCount = idties.length;
            // call extension point
            return api.data.raisePromise.search(text, idties, 'pubkey')
              .then(function() {

                // Make sure to add uid to new results - fix #488
                if (idties.length > lookupResultCount) {
                  var idtiesWithoutUid = _.filter(idties, function(idty) {
                    return !idty.uid && idty.pubkey;
                  });
                  if (idtiesWithoutUid.length) {
                    return BMA.wot.member.uids()
                      .then(function(uids) {
                        _.forEach(idties, function(idty) {
                          if (!idty.uid && idty.pubkey) {
                            idty.uid = uids[idty.pubkey];
                          }
                        });
                      });
                  }
                }
              })
              .then(function() {
                // Add unique id (if enable)
                return options.addUniqueId ? _addUniqueIds(idties) : idties;
              });
          });
      },

      getNewcomers = function(offset, size) {
        offset = offset || 0;
        size = size || 20;
        var total;
        return $q.all([
            csCurrency.blockchain.current(true)
              .then(function(block) {
                total = block.membersCount || 0;
              }),
            BMA.blockchain.stats.newcomers()
          ])
          .then(function(res) {
            res = res[1];
            if (!res || !res.result || !res.result.blocks || !res.result.blocks.length) return null; // no result
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
          })
          .then(function(idties) {
            return {
              hits: idties,
              total: total
            };
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
        var now = Date.now();
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

            var idties = _.values(idtiesByPubkey);
            var total = idties.length; // get total BEFORE slice

            idties = _sortAndSliceIdentities(idties, offset, size);
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
              console.debug("[ES] [wot] Loaded {0}/{1} pending identities in {2} ms".format(idties && idties.length || 0, total, Date.now() - now));
              return {
                hits: idties,
                total: total
              };
            });
          });
      },

      getAll = function() {
        var letters = ['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','u','v','w','x','y','z'];
        return getAllRecursive(letters, 0, BMA.constants.LIMIT_REQUEST_COUNT)
          .then(function(idties) {
            return extendAll(idties, 'pubkey', true/*skipAddUid*/);
          })
          .then(_addUniqueIds)
          .then(function() {
            return {
              hits: idties,
              total: idties.length
            };
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

      extend = function(idty, pubkeyAttributeName, skipAddUid) {
        return extendAll([idty], pubkeyAttributeName, skipAddUid)
          .then(function(res) {
            return res[0];
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
      },

      cleanCache = function() {
        console.debug("[wot] Cleaning cache...");
        csCache.clear(cachePrefix);
      }
    ;

    // Register extension points
    api.registerEvent('data', 'load');
    api.registerEvent('data', 'search');

    // Listen if node changed
    BMA.api.node.on.restart($rootScope, cleanCache, this);

    return {
      id: id,
      load: loadData,
      loadRequirements: loadRequirements,
      search: search,
      newcomers: getNewcomers,
      pending: getPending,
      all: getAll,
      extend: extend,
      extendAll: extendAll,
      // api extension
      api: api
    };
  }

  var service = factory('default', BMA);

  service.instance = factory;
  return service;
});
