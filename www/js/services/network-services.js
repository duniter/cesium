
angular.module('cesium.network.services', ['ngApi', 'cesium.currency.services', 'cesium.http.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, $window, csConfig, csSettings, BMA, Device, csHttp, csCurrency, Api) {
  'ngInject';

   var
    interval,
    constants = {
      UNKNOWN_BUID: -1,
      MAX_BLOCK_OFFSET: 1000
    },
    isHttpsMode = $window.location.protocol === 'https:',
    api = new Api(this, "csNetwork"),
    startPromise,

    data = {
      pid: 0, // = not started
      bma: null,
      listeners: [],
      loading: true,
      peers: [],
      filter: {
        member: true,
        mirror: true,
        endpoint: null,
        online: false,
        bma: false,
        ssl: undefined,
        tor: undefined
      },
      sort:{
        type: null,
        asc: true,
        compact: true
      },
      groupBy: 'pubkey',
      expertMode: false,
      knownBlocks: [],
      mainBlock: null,
      minOnlineBlockNumber: 0,
      uidsByPubkeys: null,
      searchingPeersOnNetwork: false,
      difficulties: null,
      ws2pHeads: null,
      timeout: csConfig.timeout,
      startTime: null
    },

    // Return the block uid
    buid = function(block) {
      return block && [block.number, block.hash].join('-');
    },

    // Return the block uid
    buidBlockNumber = function(buid) {
      return (typeof buid === 'string') && parseInt(buid.split('-')[0]);
    },

    remainingTime = function() {
      return Math.max(0, data.timeout - (Date.now() - data.startTime));
    },

    resetData = function() {
      data.starCounter = 0;
      data.bma = null;
      data.listeners = [];
      data.peers.splice(0);
      data.filter = {
        member: true,
        mirror: true,
        endpoint: null,
        online: true,
        bma: false,
        ssl: undefined,
        tor: undefined
      };
      data.sort = {
        type: null,
        asc: true
      };
      data.groupBy = 'pubkey';
      data.expertMode = false;
      data.memberPeersCount = 0;
      data.knownBlocks = [];
      data.mainBlock = null;
      data.minOnlineBlockNumber = 0;
      data.uidsByPubkeys = {};
      data.loading = true;
      data.searchingPeersOnNetwork = false;
      data.difficulties = null;
      data.ws2pHeads = null;
      data.timeout = getDefaultTimeout();
      data.startTime = null;
    },

   /**
    * Compute a timeout, depending on connection type (wifi, ethernet, cell, etc.)
    */
   getDefaultTimeout = function () {
     // Using timeout from settings
     if (csSettings.data.expertMode && csSettings.data.timeout > 0) {
       console.debug('[network] Using user defined timeout: {0}ms'.format(csSettings.data.timeout));
       return csSettings.data.timeout;
     }

     // Computing timeout from the connection type
     return Device.network.timeout();
    },

    hasPeers = function() {
      return data.peers && data.peers.length > 0;
    },

    getPeers = function() {
      return data.peers;
    },

    isBusy = function() {
      return data.loading;
    },

    getKnownBlocks = function() {
      return data.knownBlocks;
    },

    // Load WS2P heads
    loadW2spHeads = function() {
      return data.bma.network.ws2p.heads()
        .then(function (res) {
          data.ws2pHeads = res.heads ? res.heads.reduce(function (res, hit) {
            if (hit.message && hit.sig) {
              try {
                var head = new Ws2pMessage(hit.message);
                res[[head.pubkey, head.ws2pid].join('-')] = head;
              }
              catch(err) {
                // just log, then ignore
                console.error('[network] Ignoring WS2P head.', err && err.message || err);
              }
            }
            return res;
          }, {}) : {};
        })
        .catch(function(err) {
          // When too many request, retry in 3s
          if (err && err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
            return $timeout(function() {
              if (remainingTime() > 0) return loadW2spHeads();
            }, 3000);
          }
          console.error(err); // can occur on duniter v1.6
          data.ws2pHeads = {};
        });
    },

    // Load personal difficulties
    loadDifficulties = function() {
      return data.bma.blockchain.stats.difficulties()
        .then(function (res) {
          data.difficulties = res.levels ? res.levels.reduce(function (res, hit) {
            if (hit.uid && hit.level) res[hit.uid] = hit.level;
            return res;
          }, {}) : {};
        })
        .catch(function(err) {
          // When too many request, retry in 3s
          if (err && err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
            return $timeout(function() {
              if (remainingTime() > 0) return loadDifficulties();
            }, 3000);
          }
          console.error(err);
          data.difficulties = {};
        });
    },

    loadPeers = function() {
      data.peers = [];
      data.searchingPeersOnNetwork = true;
      data.loading = true;
      data.bma = data.bma || BMA;
      var newPeers = [];
      var pid = data.pid;

      if (interval) {
        $interval.cancel(interval);
      }

      interval = $interval(function() {
        // not same job instance
        if (newPeers.length) {
          flushNewPeersAndSort(newPeers);
        }
        else if (data.loading && !data.searchingPeersOnNetwork) {
          data.loading = false;
          $interval.cancel(interval);

          // The peer lookup end, we can make a clean final report
          sortPeers(true/*update main buid*/);

          console.debug('[network] [#{0}] {1} peer(s) found.'.format(pid, data.peers.length));
        }
      }, 1000);

      var initJobs = [
        // Load uids
        data.bma.wot.member.uids()
          .then(function(uids) {
            data.uidsByPubkeys = uids;
          })
          .catch(function(err) {
            console.error(err);
            data.uidsByPubkeys = {};
          }),

        // Load WS2P heads
        loadW2spHeads()
      ];

      // Get difficulties (expert mode only)
      if (data.expertMode) {
        initJobs.push(loadDifficulties());
      }

      return $q.all(initJobs)
        .then(function() {
          return data.bma && data.bma.network.peers();
        })
        .then(function(res){
          if (!res || !res.peers || !res.peers.length) return;

          // If filter online peers
          if (data.filter.online) {
            var jobs = [];
            _.forEach(res.peers, function(json) {
              // Exclude, if not UP or on a too old block
              if (json.status !== 'UP') return;

              // Exclude if too old peering document
              json.blockNumber = buidBlockNumber(json.block);
              if (json.blockNumber && json.blockNumber < data.minOnlineBlockNumber) {
                console.debug("[network] [#{0}] Exclude a too old peering document, on pubkey {1}".format(pid, json.pubkey.substring(0,8)));
                return;
              }

              jobs.push(addOrRefreshPeerFromJson(json, newPeers));

              // Mark WS2P
              _.forEach(json.endpoints||[], function(ep) {
                if (ep.startsWith('WS2P')) {
                  var key = json.pubkey + '-' + ep.split(' ')[1];
                  if (data.ws2pHeads && data.ws2pHeads[key]) {
                    data.ws2pHeads[key].hasEndpoint = true;
                  }
                }
              });
            });

            // Add private WS2P endpoints
            var privateWs2pHeads = _.values(data.ws2pHeads);
            if (privateWs2pHeads && privateWs2pHeads.length) {
              var privateEPCount = 0;
              //console.debug("[network] Found WS2P endpoints without endpoint:", data.ws2pHeads);
              _.forEach(privateWs2pHeads, function(head) {

                if (!head.hasEndPoint) {
                  var currentNumber = buidBlockNumber(head.buid);
                  // Exclude if on a too old block
                  if (currentNumber && currentNumber < data.minOnlineBlockNumber) {
                    console.debug("[network] [#{0}] Exclude a too old WS2P message, on pubkey {1}".format(pid, head.pubkey.substring(0,8)));
                    return;
                  }

                  var peer = new Peer({
                    buid: head.buid,
                    currentNumber: currentNumber,
                    pubkey: head.pubkey,
                    version: head.version,
                    powPrefix: head.powPrefix,
                    online: true,
                    uid: data.uidsByPubkeys[head.pubkey],
                    bma: {
                      useWs2p: true,
                      private: true,
                      ws2pid: head.ws2pid
                    },
                    endpoints: [
                      // fake endpoint
                      'WS2P ' + head.ws2pid
                    ]
                  });
                  peer.id = peer.keyID();
                  if (peer.uid && data.expertMode && data.difficulties) {
                    peer.difficulty = data.difficulties[peer.uid];
                  }
                  if (applyPeerFilter(peer)) {
                    newPeers.push(peer);
                    privateEPCount++;
                  }
                }
              });

              if (privateEPCount) {
                console.debug("[network] [#{0}] Found {1} WS2P endpoints without endpoint (private ?)".format(pid, privateEPCount));
              }
            }

            if (jobs.length) return $q.all(jobs);
          }

          // If filter offline peers
          else {
            return $q.all(_(res && res.peers || []).reduce(function(res, json) {
              return res.concat(addOrRefreshPeerFromJson(json, newPeers));
            }, []));
          }
        })
        .then(function(){
          if (!isStarted()) return; // Skip if stopped
          data.searchingPeersOnNetwork = false;
          data.loading = false;
          if (newPeers.length) {
            flushNewPeersAndSort(newPeers, true/*update main buid*/);
          }
          return data.peers;
        })
        .catch(function(err){
          console.error(err);
          data.searchingPeersOnNetwork = false;
        });
    },

    /**
     * Apply filter on a peer. (peer uid should have been filled BEFORE)
     */
    applyPeerFilter = function(peer) {
      // no filter
      if (!data.filter) return true;

      // Filter member and mirror
      if ((data.filter.member && !data.filter.mirror && !peer.uid) ||
          (data.filter.mirror && !data.filter.member && peer.uid)) {
        return false;
      }

      // Filter on endpoint
      if (data.filter.endpoint && !peer.hasEndpoint(data.filter.endpoint)) {
        return false;
      }

      // Filter on status
      if ((data.filter.online && peer.status !== 'UP' && peer.oldBlock) || (!data.filter.online && peer.status === 'UP' && !peer.oldBlock)) {
        return false;
      }

      // Filter on bma
      if (angular.isDefined(data.filter.bma) && peer.isBma() != data.filter.bma) {
        return false;
      }

      // Filter on ws2p
      if (angular.isDefined(data.filter.ws2p) && peer.isWs2p() != data.filter.ws2p) {
        return false;
      }

      // Filter on ssl
      if (angular.isDefined(data.filter.ssl) && peer.isSsl() != data.filter.ssl) {
        return false;
      }

      // Filter on tor
      if (angular.isDefined(data.filter.tor) && peer.isTor() != data.filter.tor) {
        return false;
      }

      return true;
    },

    addOrRefreshPeerFromJson = function(json, list) {
      list = list || data.newPeers;

      // Analyze the peer document, and exclude using the online filter
      json.blockNumber = buidBlockNumber(json.block);
      json.oldBlock = (json.status === 'UP' && json.blockNumber && json.blockNumber < data.minOnlineBlockNumber);
      delete json.version; // DO not keep peering document version

      var peers = createPeerEntities(json);
      var hasUpdates = false;
      var pid = data.pid;

      var jobs = peers.reduce(function(jobs, peer) {
          var existingPeer = _.findWhere(data.peers, {id: peer.id});
          var existingMainBuid = existingPeer ? existingPeer.buid : null;
          var existingOnline = existingPeer ? existingPeer.online : false;

          return jobs.concat(
            refreshPeer(peer)
              .then(function (refreshedPeer) {
                var api = refreshedPeer &&
                  refreshedPeer.bma && (
                    (refreshedPeer.bma.useBma && 'BMA') ||
                    (refreshedPeer.bma.useGva && 'GVA') ||
                    (refreshedPeer.bma.useWs2p && 'WS2P')
                  ) || 'null';

                if (existingPeer) {
                  // remove existing peers, when reject or offline
                  if (!refreshedPeer || (refreshedPeer.online !== data.filter.online && data.filter.online !== 'all')) {
                    var existingIndex = data.peers.indexOf(existingPeer);
                    if (existingIndex !== -1) {
                      console.debug('[network] [#{0}] Peer [{1}] removed (cause: {2})'.format(pid, peer.server, !refreshedPeer ? 'filtered' : (refreshedPeer.online ? 'UP' : 'DOWN')));
                      data.peers.splice(existingIndex, 1);
                      hasUpdates = true;
                    }
                  }
                  else if (refreshedPeer.buid !== existingMainBuid){
                    console.debug('[network] [#{0}] {1} endpoint [{2}] new current block'.format(
                      pid,
                      api,
                      refreshedPeer.server));
                    hasUpdates = true;
                  }
                  else if (existingOnline !== refreshedPeer.online){
                    console.debug('[network] [#{0}] {1} endpoint [{2}] is now {3}'.format(
                      pid,
                      api,
                      refreshedPeer.server,
                      refreshedPeer.online ? 'UP' : 'DOWN'));
                    hasUpdates = true;
                  }
                  else {
                    console.debug("[network] [#{0}] {1} endpoint [{2}] unchanged".format(
                      pid,
                      api,
                      refreshedPeer.server));
                  }
                }
                else if (refreshedPeer && (refreshedPeer.online === data.filter.online || data.filter.online === 'all')) {
                  console.debug("[network] [#{0}] {1} endpoint [{2}] is {3}".format(
                    pid,
                    api,
                    refreshedPeer.server,
                    refreshedPeer.online ? 'UP' : 'DOWN'
                  ));
                  list.push(refreshedPeer);
                  hasUpdates = true;
                }
              })
         );
      }, []);
      return (jobs.length === 1 ? jobs[0] : $q.all(jobs))
        .then(function() {
          return hasUpdates;
        });
    },

    createPeerEntities = function(json, ep) {
      if (!json) return [];
      var peer = new Peer(json);

      // Read bma endpoints
      if (!ep) {
        var endpointsAsString = peer.getEndpoints();
        if (!endpointsAsString) return []; // no BMA

        var endpoints = endpointsAsString.reduce(function (res, epStr) {
          var ep = BMA.node.parseEndPoint(epStr);
          return ep ? res.concat(ep) : res;
        }, []);

        // recursive call, on each endpoint
        if (endpoints.length > 1) {
          return endpoints.reduce(function (res, ep) {
            return res.concat(createPeerEntities(json, ep));
          }, []);
        }
        else {
          // if only one endpoint: use it and continue
          ep = endpoints[0];
        }
      }
      peer.bma = ep;
      peer.server = peer.getServer();
      peer.dns = peer.getDns();
      peer.buid = peer.buid || peer.block;
      peer.blockNumber = buidBlockNumber(peer.buid);
      peer.uid = peer.pubkey && data.uidsByPubkeys[peer.pubkey];
      peer.id = peer.keyID();
      return [peer];
    },

    refreshPeer = function(peer) {

      // Apply filter
      if (!applyPeerFilter(peer)) return $q.when();

      if (!data.filter.online || (!data.filter.online && peer.status === 'DOWN') || !peer.getHost() /*fix #537*/) {
        peer.online = false;
        return $q.when(peer);
      }

      if (peer.bma.useWs2p && data.ws2pHeads) {
        var ws2pHeadKey = [peer.pubkey, peer.bma.ws2pid].join('-');
        var head = data.ws2pHeads[ws2pHeadKey];
        delete data.ws2pHeads[ws2pHeadKey];
        if (head) {
          peer.buid = head.buid;
          peer.currentNumber = buidBlockNumber(head.buid);
          peer.version = head.version;
          peer.powPrefix = head.powPrefix;
        }
        peer.online = !!peer.buid;

        if (peer.uid && data.expertMode && data.difficulties) {
          peer.difficulty = data.difficulties[peer.uid];
        }

        return $q.when(peer);
      }

      // Cesium running in SSL: Do not try to access not SSL node,
      if (peer.bma.useBma && isHttpsMode && !peer.bma.useSsl) {
        peer.online = (peer.status === 'UP');
        peer.buid = constants.UNKNOWN_BUID;
        delete peer.version;

        if (peer.uid && data.expertMode && data.difficulties) {
          peer.difficulty = data.difficulties[peer.uid];
        }

        return $q.when(peer);
      }

      // Do not try to access TOR, WS2P or GVA endpoints
      if (peer.bma.useTor || peer.bma.useWs2p || peer.bma.useGva) {
        peer.online = (peer.status === 'UP');
        peer.buid = constants.UNKNOWN_BUID;
        delete peer.version;

        if (peer.uid && data.expertMode && data.difficulties) {
          peer.difficulty = data.difficulties[peer.uid];
        }
        return $q.when(peer);
      }

      var timeout = Math.max(500, remainingTime()); // >= 500ms
      peer.api = peer.api || BMA.lightInstance(peer.getHost(), peer.getPort(), peer.getPath(), peer.isSsl(), timeout);

      // Get current block
      return peer.api.blockchain.current(false/*no cache*/)
        .then(function(block) {
          if (!block) throw new Error('Wrong response for /blockchain/current (empty)');
          peer.currentNumber = block.number;
          peer.online = true;
          peer.buid = buid(block);
          peer.medianTime = block.medianTime;
          if (data.knownBlocks.indexOf(peer.buid) === -1) {
            data.knownBlocks.push(peer.buid);
          }
          return peer;
        })
        .catch(function(err) {
          // Special case for currency init (root block not exists): use fixed values
          if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
            peer.online = true;
            peer.buid = buid({number:0, hash: BMA.constants.ROOT_BLOCK_HASH});
            peer.difficulty  = 0;
            return peer;
          }
          if (!peer.secondTry) {
            var bma = peer.bma || peer.getBMA();

            // Retry using DNS (instead of IP v4 or v6)
            if (bma.dns && peer.server.indexOf(bma.dns) === -1) {
              var secondTryTimeout = remainingTime();

              // try again, using DNS instead of IPv4 / IPV6
              if (secondTryTimeout > 0) {
                peer.secondTry = true;
                peer.api = BMA.lightInstance(bma.dns, bma.port, bma.path, bma.useSsl, secondTryTimeout);
                return refreshPeer(peer); // recursive call
              }
            }
          }

          peer.buid = null;
          peer.blockNumber = null;
          peer.currentNumber = null;
          peer.online=false;
          peer.uid = data.uidsByPubkeys[peer.pubkey];
          return peer;
        })
        .then(function(peer) {
          // Exit if offline, or not expert mode
          if (!peer || (data.filter.online && !peer.online)) return peer;
          var jobs = [];

          // Get hardship (only for a member peer, and expert mode)
          if (peer.uid && data.expertMode) {
            jobs.push(peer.api.blockchain.stats.hardship({pubkey: peer.pubkey})
              .then(function (res) {
                peer.difficulty = res ? res.level : null;
              })
              .catch(function() {
                peer.difficulty = null; // continue
              }));
          }

          // Get software, version and storage
          if (data.expertMode || data.filter.bma) {
            jobs.push(peer.api.node.summary()
              .then(function (res) {
                peer.software = res && res.duniter && res.duniter.software || undefined;
                peer.version = res && res.duniter && res.duniter.version || '?';
                peer.storage = res && res.duniter && res.duniter.storage || {transactions: false, wotwizard: false};
              })
              .catch(function () {
                peer.software = undefined;
                peer.version = '?';
                peer.storage = {transactions: false, wotwizard: false};
                // continue
              }));
          }

          // Get sandboxes
          if (data.expertMode) {
            jobs.push(peer.api.node.sandboxes()
              .catch(function(err) {
                return {}; // continue
              })
              .then(function(res) {
                peer.sandboxes = res || {};
                peer.sandboxes.identities = peer.sandboxes.identities || {};
                peer.sandboxes.memberships = peer.sandboxes.memberships || {};
                peer.sandboxes.transactions = peer.sandboxes.transactions || {};

                var full = false;
                Object.keys(peer.sandboxes).forEach(function (key) {
                  var sandbox = peer.sandboxes[key];
                  sandbox.free = sandbox.free || -1;
                  sandbox.size = sandbox.size || 0;
                  if (sandbox.free >= 0 && sandbox.free <= sandbox.size) {
                    sandbox.count = sandbox.size - sandbox.free;
                    sandbox.percentage = (sandbox.count / sandbox.size) * 100;
                  }
                  full = full || sandbox.free === 0;
                });
                // Mark as full, if one sandbox is full
                peer.sandboxes.full = full;
              })
            );
          }

          if (!jobs.length) return peer;

          return $q.all(jobs)
            .then(function(){
              return peer;
            });
        });
    },

    flushNewPeersAndSort = function(newPeers, updateMainBuid) {
      newPeers = newPeers || data.newPeers;
      if (!newPeers.length) return;
      var ids = _.map(data.peers, function(peer){
        return peer.id;
      });
      var hasUpdates = false;
      var newPeersAdded = 0;
      _.forEach(newPeers.splice(0), function(peer) {
        if (!ids[peer.id]) {
          data.peers.push(peer);
          ids[peer.id] = peer;
          hasUpdates = true;
          newPeersAdded++;
        }
      });
      if (hasUpdates) {
        console.debug('[network] Flushing {0} new peers...'.format(newPeersAdded));
        sortPeers(updateMainBuid);
      }
    },

    computeScoreAlphaValue = function(value, nbChars, asc) {
      if (!value) return 0;
      var score = 0;
      value = value.toLowerCase();
      if (nbChars > value.length) {
        nbChars = value.length;
      }
      score += value.charCodeAt(0);
      for (var i=1; i < nbChars; i++) {
        score += Math.pow(0.001, i) * value.charCodeAt(i);
      }
      return asc ? (1000 - score) : score;
    },

    sortPeers = function(updateMainBuid) {
      // Construct a map of buid, with peer count and medianTime
      var buids = {};
      data.memberPeersCount = 0;
      _.forEach(data.peers, function(peer){
        if (peer.buid) {
          var buid = buids[peer.buid];
          if (!buid || !buid.medianTime) {
            buid = {
              buid: peer.buid,
              medianTime: peer.medianTime,
              count: 0
            };
            buids[peer.buid] = buid;
          }
          // If not already done, try to fill medianTime (need to compute consensusBlockDelta)
          else if (!buid.medianTime && peer.medianTime) {
            buid.medianTime = peer.medianTime;
          }
          if (buid.buid !== constants.UNKNOWN_BUID) {
            buid.count++;
          }
        }
        data.memberPeersCount += peer.uid ? 1 : 0;
      });
      var mainBlock = data.mainBlock;
      if (data.filter.online) {
        // Compute pct of use, per buid
        _.forEach(_.values(buids), function(buid) {
          buid.pct = buid.count * 100 / data.peers.length;
        });
        mainBlock = _.max(buids, function(obj) {
          return obj.count;
        });
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid === mainBlock.buid;
          peer.hasConsensusBlock = peer.buid && !peer.hasMainConsensusBlock && buids[peer.buid].count > 1;
          if (peer.hasConsensusBlock) {
            peer.consensusBlockDelta = buids[peer.buid].medianTime - mainBlock.medianTime;
          }
        });
      }
      data.peers = _.uniq(data.peers, false, function(peer) {
        return peer.id;
      });
      data.peers = _.sortBy(data.peers, function(peer) {
        var score = 0;
        if (data.sort.type) {
          score += (data.sort.type === 'uid' ? computeScoreAlphaValue(peer.uid||peer.pubkey, 3, data.sort.asc) : 0);
          score += (data.sort.type === 'api') &&
            ((peer.isWs2p() && (data.sort.asc ? 1 : -1) || 0) +
            (peer.hasEndpoint('ES_USER_API') && (data.sort.asc ? 0.01 : -0.01) || 0) +
            (peer.isSsl() && (data.sort.asc ? 0.75 : -0.75) || 0)) || 0;
          score += (data.sort.type === 'difficulty' ? (peer.difficulty ? (data.sort.asc ? (10000-peer.difficulty) : peer.difficulty): 0) : 0);
          score += (data.sort.type === 'current_block' ? (peer.currentNumber ? (data.sort.asc ? (1000000000 - peer.currentNumber) : peer.currentNumber) : 0) : 0);
        }
        score =  (10000000000 * score);
        score += (1000000000 * (peer.online ? 1 : 0));
        score += (100000000  * (peer.hasMainConsensusBlock ? 1 : 0));
        score += (1000000    * (peer.hasConsensusBlock ? buids[peer.buid].pct : 0));
        if (data.expertMode) {
          score += (100     * (peer.difficulty ? (10000-peer.difficulty) : 0));
          score += (1       * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
          score += (0.001       * (!peer.uid ? computeScoreAlphaValue(peer.pubkey, 3, true) : 0));
        }
        else {
          score += (100     * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
          score += (0.001       * (!peer.uid ? computeScoreAlphaValue(peer.pubkey, 3, true) : 0));
        }
        score += (0.00001     * (peer.isBma() ? (peer.isSsl() ? 1 : 0.5) :0)); // If many endpoints: BMAS first, then BMA

        peer.score = score;

        return -score;
      });

      if (data.groupBy) {
        var previousPeer;
        data.peers.forEach(function(peer) {
          peer.compacted = (previousPeer && peer[data.groupBy] && peer[data.groupBy] === previousPeer[data.groupBy]);
          previousPeer = peer;
        });
      }

      // Raise event on new main block
      if (updateMainBuid && mainBlock && mainBlock.buid && (!data.mainBlock || data.mainBlock.buid !== mainBlock.buid)) {
        data.mainBlock = mainBlock;
        api.data.raise.mainBlockChanged(mainBlock);
      }

      // Raise event when changed
      api.data.raise.changed(data); // raise event
    },

    removeListeners = function() {
      _.forEach(data.listeners, function(remove){
        remove();
      });
      data.listeners = [];
    },

    addListeners = function() {
      data.listeners = [

        // Listen for new block
        data.bma.websocket.block().onListener(function(block) {
          if (!block || data.loading) return;
          var buid = [block.number, block.hash].join('-');
          if (data.knownBlocks.indexOf(buid) === -1) {
            console.debug('[network] Receiving block: ' + buid.substring(0, 20));
            data.knownBlocks.push(buid);
            // If first block: do NOT refresh peers (will be done in start() method)
            var skipRefreshPeers = data.knownBlocks.length === 1;
            if (!skipRefreshPeers) {
              data.loading = true;
              // We wait 2s when a new block is received, just to wait for network propagation
              $timeout(function() {
                console.debug('[network] new block received by WS: will refresh peers');
                loadPeers();
              }, 2000, false /*invokeApply*/);
            }
          }
        }),

        // Listen for new peer
        data.bma.websocket.peer().onListener(function(json) {
          if (!json || data.loading) return;
          var newPeers = [];
          addOrRefreshPeerFromJson(json, newPeers)
            .then(function(hasUpdates) {
              if (!hasUpdates) return;
              if (newPeers.length>0) {
                flushNewPeersAndSort(newPeers, true);
              }
              else {
                console.debug('[network] [ws] Peers updated received');
                sortPeers(true);
              }
            });
        })
      ];
    },

    sort = function(options) {
      options = options || {};
      data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
      data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
      sortPeers(false);
    },

    start = function(bma, options) {
      if (startPromise) {
        console.warn('[network-service] Waiting previous start to be closed...');
        return startPromise.then(function() {
          return start(bma, options);
        });
      }

      options = options || {};
      bma = bma || BMA;
      var pid = 0;

      startPromise = bma.ready()
        .then(function() {
          // Stop previous network scan (if running)
          close(data.pid);

          // Compute next PID
          pid = ++data.pid;

          // Prepare data
          data.bma = bma;
          data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
          data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
          data.expertMode = angular.isDefined(options.expertMode) ? options.expertMode : data.expertMode;
          data.timeout = angular.isDefined(options.timeout) ? options.timeout : getDefaultTimeout();
          data.startTime = Date.now();

          // Init a min block number
          var mainBlockNumber = data.mainBlock && buidBlockNumber(data.mainBlock.buid);
          data.minOnlineBlockNumber = mainBlockNumber && Math.max(0, (mainBlockNumber - constants.MAX_BLOCK_OFFSET)) || undefined;
          if (data.minOnlineBlockNumber === undefined) {
            return csCurrency.blockchain.current(true/*use cache*/)
              .then(function(current) {
                data.minOnlineBlockNumber = Math.max(0, current.number - constants.MAX_BLOCK_OFFSET);
                if (Date.now() - data.startDate > 2000) {
                  console.warn('[network-service] Resetting network start date, because blockchain.current() take more than 2s to respond');
                  data.startTime = Date.now(); // Reset the startTime (use to compute remainingTime)
                }
              });
          }
        })
        .then(function() {
          var now = Date.now();
          console.info('[network] [#{0}] Starting from [{1}{2}] {ssl: {3}}'.format(pid, bma.server, bma.path, bma.useSsl));

          addListeners();

          return loadPeers()
            .then(function(peers){
              if (peers) console.debug('[network] [#{0}] Started - {1} peer(s) found, in {2}ms'.format(
                pid,
                peers.length,
                Date.now() - now));
              return data;
            });
        });
      return startPromise;
    },

    close = function(pid) {
      console.info(pid > 0 ? '[network] [#{0}] Stopping...'.format(pid) : '[network] Stopping...');
      if (data.bma) {
        removeListeners();
        resetData();
      }
      if (interval && pid === data.pid && pid > 0) {
        $interval.cancel(interval);
      }
      startPromise = null;
    },

    isStarted = function() {
      return !!data.bma;
    },

    startIfNeed = function(bma, options) {
      if (startPromise) return startPromise;
      // Start if need
      if (!isStarted()) {
        return start(bma, options);
      }
      else {
        return $q.resolve(data);
      }
    },

    getMainBlockUid = function(bma, options) {
      var wasStarted = isStarted();
      var pid = wasStarted ? data.pid : data.pid + 1;
      return startIfNeed(bma, options)
        .then(function(data) {
          var buid = data.mainBlock && data.mainBlock.buid;
          if (!wasStarted) close(pid);
          return buid;
        })
        .catch(function(err) {
          console.error('[network] [#{0}] Failed to get main block'.format(pid));
          if (!wasStarted) close(pid);
          throw err;
        });
    },

    // Get peers on the main consensus blocks
    getSynchronizedBmaPeers = function(bma, options) {
      options = options || {};
      options.filter = options.filter || {};
      options.filter.bma = angular.isDefined(options.filter.bma) ? options.filter.bma : true;
      options.filter.ssl = isHttpsMode ? true : undefined /*= all */;
      options.filter.online = true;
      options.filter.expertMode = false; // Difficulties not need
      options.timeout = angular.isDefined(options.timeout) ? options.timeout : getDefaultTimeout();

      var wasStarted = isStarted();
      var pid = wasStarted ? data.pid : data.pid + 1;

      var now = Date.now();
      console.info('[network] [#{0}] Getting synchronized BMA peers... {timeout: {1}}'.format(pid, options.timeout));

      return startIfNeed(bma, options)
        .then(function(data){
          var peerUrls = [];
          var peers = data && data.peers.reduce(function(res, peer) {
            // Exclude if not BMA or not on the main consensus block
            if (!peer || !peer.isBma() || !peer.hasMainConsensusBlock) return res;

            // Fill some properties compatible
            peer.compatible = isCompatible(peer);
            peer.url = peer.getUrl();

            // Clean unused properties (e.g. the API, created by BMA.lightInstance())
            delete peer.api;

            // Remove duplicate
            if (peerUrls.includes(peer.url)) return res;
            peerUrls.push(peer.url);

            return res.concat(peer);
          }, []);

          // Log
          if (peers && peers.length > 0) {
            var mainConsensusBlock = peers[0] && peers[0].buid;
            console.info('[network] [#{0}] Found {0}/{1} BMA peers on main consensus block #{2} - in {3}ms'.format(
              peers.length,
              data.peers.length,
              mainConsensusBlock,
              Date.now() - now));
          }
          else {
            console.warn('[network] [#{0}] No synchronized BMA peers found - in {1}ms'.format(pid, Date.now() - now));
          }

          if (!wasStarted) close(pid);
          return peers;
        })
        .catch(function(err) {
          console.error('[network] [#{0}] Error while getting synchronized BMA peers'.format(pid), err);
          if (!wasStarted) close(pid);
          throw err;
        });
    },

   /**
    * Is the peer compatible with Cesium (should be a BMA endpoint )
    * @param peer
    * @returns {*}
    */
    isCompatible = function(peer) {
      if (!peer && !peer.isBma() || !peer.version) return false;

      // CHeck version compatible, from min version
     if (!peer.version || !csHttp.version.isCompatible(csSettings.data.minVersionAtStartup || csSettings.data.minVersion, peer.version) ||
         // Exclude beta versions (1.9.0* and 1.8.7-rc*)
         peer.version.startsWith('1.9.0') || peer.version.startsWith('1.8.7-rc')
       ) {
        console.debug('[network] [#{0}] BMA endpoint [{1}] is EXCLUDED (incompatible version {2})'.format(data.pid, peer.getServer(), peer.version));
        return false;
      }

      // Exclude if transactions not stored
      if (!peer.storage && peer.storage.transactions !== true) {
        console.debug('[network] [#{0}] BMA endpoint [{1}] is EXCLUDED (no transactions storage)'.format(data.pid, peer.getServer()));
        return false;
      }

      // Exclude g1.duniter.org, because of fail-over config, that can switch node
      if (peer.host === 'g1.duniter.org') {
        console.debug('[network] [#{0}] BMA endpoint [{1}] is EXCLUDED (load-balancing nightmare)'.format(data.pid, peer.getServer()));
        return false;
      }

      // Exclude if one sandbox is full
      if (peer.sandboxes && peer.sandboxes.full) {
        console.debug('[network] [#{0}] BMA endpoint [{1}] is EXCLUDED (one sandbox is full)'.format(data.pid, peer.getServer()));
        return false;
      }

      return true;
    };

  // Register extension points
  api.registerEvent('data', 'changed');
  api.registerEvent('data', 'mainBlockChanged');
  api.registerEvent('data', 'rollback');

  return {
    data: data,
    start: start,
    close: close,
    hasPeers: hasPeers,
    getPeers: getPeers,
    sort: sort,
    getSynchronizedBmaPeers: getSynchronizedBmaPeers,
    getKnownBlocks: getKnownBlocks,
    getMainBlockUid: getMainBlockUid,
    loadPeers: loadPeers,
    isBusy: isBusy,
    // api extension
    api: api
  };
});
