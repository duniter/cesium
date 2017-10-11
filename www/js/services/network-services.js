
angular.module('cesium.network.services', ['ngApi', 'cesium.bma.services', 'cesium.http.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, $window, BMA, csHttp, Api, csCurrency) {
  'ngInject';

  factory = function(id) {

    var
      interval,
      constants = {
        UNKNOWN_BUID: -1
      },
      isHttpsMode = $window.location.protocol === 'https:',
      api = new Api(this, "csNetwork-" + id),

      data = {
        bma: null,
        websockets: [],
        loading: true,
        peers: [],
        filter: {
          member: true,
          mirror: true,
          endpointFilter: null,
          online: false,
          ssl: undefined,
          tor: undefined
        },
        sort:{
          type: null,
          asc: true
        },
        expertMode: false,
        knownBlocks: [],
        mainBlock: null,
        uidsByPubkeys: null,
        searchingPeersOnNetwork: false,
        difficulties: null,
        ws2pHeads: null
      },

      // Return the block uid
      buid = function(block) {
        return block && [block.number, block.hash].join('-');
      },

      resetData = function() {
        data.bma = null;
        data.websockets = [];
        data.peers.splice(0);
        data.filter = {
          member: true,
          mirror: true,
          endpointFilter: null,
          online: true
        };
        data.sort = {
          type: null,
          asc: true
        };
        data.expertMode = false;
        data.memberPeersCount = 0;
        data.knownBlocks = [];
        data.mainBlock = null;
        data.uidsByPubkeys = {};
        data.loading = true;
        data.searchingPeersOnNetwork = false;
        data.difficulties = null;
        data.ws2pHeads = null;
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
                var head = new Ws2pMessage(hit.message);
                res[[head.pubkey, head.ws2pid].join('-')] = head;
              }
              return res;
            }, {}) : {};
          })
          .catch(function(err) {
            // When too many request, retry in 3s
            if (err && err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
              return $timeout(function() {
                return loadW2spHeads();
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
                return loadDifficulties();
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

            console.debug('[network] Finish: {0} peers found.'.format(data.peers.length));
          }
        }, 1000);

        var initJobs = [
          // Load uids
          data.bma.wot.member.uids()
            .then(function(uids) {
              data.uidsByPubkeys = uids;
            }),
          // Load WS2P heads
          loadW2spHeads()
        ];

        // Get difficulties (expert mode only)
        if (data.expertMode) {
          initJobs.push(loadDifficulties());
        }

        return $q.all(initJobs)
          .then(function(){
            // online nodes
            if (data.filter.online) {
              /*return data.bma.network.peering.peers({leaves: true})
                .then(function(res){
                  return $q.all(res.leaves.map(function(leaf) {
                    return data.bma.network.peering.peers({ leaf: leaf })
                      .then(function(subres){
                        return addOrRefreshPeerFromJson(subres.leaf.value, newPeers);
                      });
                  }));
                });*/
              return data.bma.network.peers()
                .then(function(res){
                  var jobs = [];
                  _.forEach(res.peers, function(json) {
                    if (json.status == 'UP') {
                      jobs.push(addOrRefreshPeerFromJson(json, newPeers));
                    }
                  });
                  if (jobs.length) return $q.all(jobs);
                });
            }

            // offline nodes
            return data.bma.network.peers()
              .then(function(res){
                var jobs = [];
                _.forEach(res.peers, function(json) {
                  if (json.status !== 'UP') {
                    jobs.push(addOrRefreshPeerFromJson(json, newPeers));
                  }
                });
                if (jobs.length) return $q.all(jobs);
              });
          })

          .then(function(){
            data.searchingPeersOnNetwork = false;
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

        // Filter on endpoints
        if (data.filter.endpointFilter && !peer.hasEndpoint(data.filter.endpointFilter)) {
          return false;
        }

        // Filter on status
        if (!data.filter.online && peer.status == 'UP') {
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

        var peers = createPeerEntities(json);
        var hasUpdates = false;

        var jobs = peers.reduce(function(jobs, peer) {
            var existingPeer = _.findWhere(data.peers, {id: peer.id});
            var existingMainBuid = existingPeer ? existingPeer.buid : null;
            var existingOnline = existingPeer ? existingPeer.online : false;

            return jobs.concat(
              refreshPeer(peer)
                .then(function (refreshedPeer) {
                  if (existingPeer) {
                    // remove existing peers, when reject or offline
                    if (!refreshedPeer || (refreshedPeer.online !== data.filter.online && data.filter.online !== 'all')) {
                      console.debug('[network] Peer [{0}] removed (cause: {1})'.format(peer.server, !refreshedPeer ? 'filtered' : (refreshedPeer.online ? 'UP': 'DOWN')));
                      data.peers.splice(data.peers.indexOf(existingPeer), 1);
                      hasUpdates = true;
                    }
                    else if (refreshedPeer.buid !== existingMainBuid){
                      console.debug('[network] {0} endpoint [{1}] new current block'.format(
                        refreshedPeer.bma.useBma ? 'BMA' : 'WS2P',
                        refreshedPeer.server));
                      hasUpdates = true;
                    }
                    else if (existingOnline !== refreshedPeer.online){
                      console.debug('[network] {0} endpoint [{1}] is now {2}'.format(
                        refreshedPeer.bma.useBma ? 'BMA' : 'WS2P',
                        refreshedPeer.server,
                        refreshedPeer.online ? 'UP' : 'DOWN'));
                      hasUpdates = true;
                    }
                    else {
                      console.debug("[network] {0} endpoint [{1}] unchanged".format(
                        refreshedPeer.bma.useBma ? 'BMA' : 'WS2P',
                        refreshedPeer.server));
                    }
                  }
                  else if (refreshedPeer && (refreshedPeer.online === data.filter.online || data.filter.online === 'all')) {
                    console.debug("[network] {0} endpoint [{1}] is {2}".format(
                      refreshedPeer.bma.useBma ? 'BMA' : 'WS2P',
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

          // if only one bma endpoint: use it and continue
          ep = endpoints[0];
        }
        peer.bma = ep;
        peer.server = peer.getServer();
        peer.dns = peer.getDns();
        peer.blockNumber = peer.block.replace(/-.+$/, '');
        peer.uid = data.uidsByPubkeys[peer.pubkey];
        peer.id = peer.keyID();
        return [peer];
      },

      refreshPeer = function(peer) {

        // Apply filter
        if (!applyPeerFilter(peer)) return $q.when();

        if (!data.filter.online || (data.filter.online === 'all' && peer.status === 'DOWN') || !peer.getHost() /*fix #537*/) {
          peer.online = false;
          return $q.when(peer);
        }

        if (peer.bma.useWs2p && data.ws2pHeads) {
          var head = data.ws2pHeads[[peer.pubkey, peer.bma.ws2pid].join('-')];
          if (head) {
            peer.buid = head.buid;
            peer.currentNumber=peer.buid && peer.buid.split('-')[0];
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
        if (isHttpsMode && !peer.bma.useSsl) {
          peer.online = (peer.status === 'UP');
          peer.buid = constants.UNKNOWN_BUID;
          delete peer.version;

          if (peer.uid && data.expertMode && data.difficulties) {
            peer.difficulty = data.difficulties[peer.uid];
          }

          return $q.when(peer);
        }

        // Do not try to access TOR or WS2P endpoints
        if (peer.bma.useTor || peer.bma.useWs2p) {
          peer.online = (peer.status == 'UP');
          peer.buid = constants.UNKNOWN_BUID;
          delete peer.version;

          if (peer.uid && data.expertMode && data.difficulties) {
            peer.difficulty = data.difficulties[peer.uid];
          }
          return $q.when(peer);
        }

        peer.api = peer.api ||  BMA.lightInstance(peer.getHost(), peer.getPort(), peer.isSsl());

        // Get current block
        return peer.api.blockchain.current()
          .then(function(block) {
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
              if (bma.dns && peer.server.indexOf(bma.dns) == -1) {
                // try again, using DNS instead of IPv4 / IPV6
                peer.secondTry = true;
                peer.api = BMA.lightInstance(bma.dns, bma.port, bma.useSsl);
                return refreshPeer(peer); // recursive call
              }
            }

            peer.online=false;
            peer.currentNumber = null;
            peer.buid = null;
            peer.uid = data.uidsByPubkeys[peer.pubkey];
            return peer;
          })
          .then(function(peer) {
            // Exit if offline, or not expert mode or too small device
            if (!data.filter.online || !peer || !peer.online || !data.expertMode) return peer;
            var jobs = [];

            // Get hardship (only for a member peer)
            if (peer.uid) {
              jobs.push(peer.api.blockchain.stats.hardship({pubkey: peer.pubkey})
                .then(function (res) {
                  peer.difficulty = res ? res.level : null;
                })
                .catch(function() {
                  peer.difficulty = null; // continue
                }));
            }

            // Get Version
            jobs.push(peer.api.node.summary()
              .then(function(res){
                peer.version = res && res.duniter && res.duniter.version;
              })
              .catch(function() {
                peer.version = 'v?'; // continue
              }));

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
                count: 0,
                medianTime: peer.medianTime
              };
              buids[peer.buid] = buid;
            }
            // If not already done, try to fill medianTime (need to compute consensusBlockDelta)
            else if (!buid.medianTime && peer.medianTime) {
              buid.medianTime = peer.medianTime;
            }
            if (buid.buid != constants.UNKNOWN_BUID) {
              buid.count++;
            }
          }
          data.memberPeersCount += peer.uid ? 1 : 0;
        });
        // Compute pct of use, per buid
        _.forEach(_.values(buids), function(buid) {
          buid.pct = buid.count * 100 / data.peers.length;
        });
        var mainBlock = _.max(buids, function(obj) {
          return obj.count;
        });
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid == mainBlock.buid;
          peer.hasConsensusBlock = peer.buid && !peer.hasMainConsensusBlock && buids[peer.buid].count > 1;
          if (peer.hasConsensusBlock) {
            peer.consensusBlockDelta = buids[peer.buid].medianTime - mainBlock.medianTime;
          }
        });
        data.peers = _.uniq(data.peers, false, function(peer) {
          return peer.id;
        });
        data.peers = _.sortBy(data.peers, function(peer) {
          var score = 0;
          if (data.sort.type) {
            var sortScore = 0;
            sortScore += (data.sort.type == 'uid' ? computeScoreAlphaValue(peer.uid||peer.pubkey, 3, data.sort.asc) : 0);
            sortScore += (data.sort.type == 'api') &&
              ((peer.isWs2p() && (data.sort.asc ? 1 : -1) || 0) +
              (peer.hasEndpoint('ES_USER_API') && (data.sort.asc ? 0.01 : -0.01) || 0) +
              (peer.isSsl() && (data.sort.asc ? 0.75 : -0.75) || 0)) || 0;
            sortScore += (data.sort.type == 'difficulty' ? (peer.difficulty ? (data.sort.asc ? (10000-peer.difficulty) : peer.difficulty): 0) : 0);
            sortScore += (data.sort.type == 'current_block' ? (peer.currentNumber ? (data.sort.asc ? (1000000000 - peer.currentNumber) : peer.currentNumber) : 0) : 0);
            score += (10000000000 * sortScore);
          }
          score += (1000000000 * (peer.online ? 1 : 0));
          score += (100000000  * (peer.hasMainConsensusBlock ? 1 : 0));
          score += (1000000    * (peer.hasConsensusBlock ? buids[peer.buid].pct : 0));
          if (data.expertMode) {
            score += (100     * (peer.difficulty ? (10000-peer.difficulty) : 0));
            score += (1       * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
          }
          else {
            score += (100     * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
            score += (1       * (!peer.uid ? computeScoreAlphaValue(peer.pubkey, 2, true) : 0));
          }
          return -score;
        });

        // Raise event on new main block
        if (updateMainBuid && mainBlock.buid && (!data.mainBlock || data.mainBlock.buid !== mainBlock.buid)) {
          data.mainBlock = mainBlock;
          api.data.raise.mainBlockChanged(mainBlock);
        }

        // Raise event when changed
        api.data.raise.changed(data); // raise event
      },

      startListeningOnSocket = function() {
        // Listen for new block
        var wsBlock = data.bma.websocket.block();
        data.websockets.push(wsBlock);
        wsBlock.on(function(block) {
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
              }, 2000);
            }
          }
        });
        // Listen for new peer
        var wsPeer = data.bma.websocket.peer();
        data.websockets.push(wsPeer);
        wsPeer.on(function(json) {
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
        });
      },

      sort = function(options) {
        options = options || {};
        data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
        data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
        sortPeers(false);
      },

      start = function(bma, options) {
        options = options || {};
        return BMA.ready()
          .then(function() {
            close();
            data.bma = bma ? bma : BMA;
            data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
            data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
            data.expertMode = angular.isDefined(options.expertMode) ?options.expertMode : data.expertMode;
            console.info('[network] Starting network from [{0}]'.format(bma.server));
            var now = new Date();

            startListeningOnSocket();

            return loadPeers()
              .then(function(peers){
                console.debug('[network] Started in '+(new Date().getTime() - now.getTime())+'ms');
                return peers;
              });
          });
      },

      close = function() {
        if (data.bma) {
          console.info('[network] Stopping');

          _.forEach(data.websockets, function(ws){
            ws.close();
          });
          resetData();
        }
      },

      isStarted = function() {
        return !data.bma;
      },

      $q_started = function(callback) {
        if (!isStarted()) { // start first
          return start()
            .then(function() {
              return $q(callback);
            });
        }
        else {
          return $q(callback);
        }
      },

      getMainBlockUid = function() {
        return $q_started(function(resolve, reject){
          resolve (data.mainBuid);
        });
      },

      // Get peers on the main consensus blocks
      getTrustedPeers = function() {
        return $q_started(function(resolve, reject){
          resolve(data.peers.reduce(function(res, peer){
            return (peer.hasMainConsensusBlock && peer.uid) ? res.concat(peer) : res;
          }, []));
        });
      }
      ;

    // Register extension points
    api.registerEvent('data', 'changed');
    api.registerEvent('data', 'mainBlockChanged');
    api.registerEvent('data', 'rollback');

    return {
      id: id,
      data: data,
      start: start,
      close: close,
      hasPeers: hasPeers,
      getPeers: getPeers,
      sort: sort,
      getTrustedPeers: getTrustedPeers,
      getKnownBlocks: getKnownBlocks,
      getMainBlockUid: getMainBlockUid,
      loadPeers: loadPeers,
      isBusy: isBusy,
      // api extension
      api: api
    };
  };

  var service = factory('default');

  service.instance = factory;
  return service;
});
