
angular.module('cesium.network.services', ['ngResource', 'ngApi', 'cesium.bma.services', 'cesium.http.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, BMA, csHttp, Api, csSettings, UIUtils) {
  'ngInject';

  factory = function(id) {

    var
      interval,
      api = new Api(this, "csNetwork-" + id),

      data = {
        bma: null,
        loading: true,
        peers: [],
        filter: {
          member: true,
          mirror: true,
          endpointFilter: null
        },
        sort:{
          type: null,
          asc: true
        },
        knownBlocks: [],
        knownPeers: {},
        mainBuid: null,
        uidsByPubkeys: null,
        searchingPeersOnNetwork: false
      },

      // Return the block uid
      buid = function(block) {
        return block && [block.number, block.hash].join('-');
      },

      resetData = function() {
        data.bma = null;
        data.peers = [];
        data.filter = {
          member: true,
          mirror: true,
          endpointFilter: null
        };
        data.sort = {
          type: null,
          asc: true
        },
        data.memberPeersCount = 0;
        data.knownBlocks = [];
        data.knownPeers = {};
        data.mainBuid = null;
        data.uidsByPubkeys = {};
        data.loading = true;
        data.searchingPeersOnNetwork = false;
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

      newLightBMA = function(host, port) {
        return {
          node: {
            summary: csHttp.getWithCache(host, port, '/node/summary', csHttp.cache.LONG)
          },
          blockchain: {
            current: csHttp.get(host, port, '/blockchain/current'),
            stats: {
              hardship: csHttp.get(host, port, '/blockchain/hardship/:pubkey')
            }
          }
        };
      },

      loadPeers = function() {
        data.knownPeers = {};
        data.peers = [];
        data.searchingPeersOnNetwork = true;
        data.loading = true;

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
            console.debug('[network] Finish : all peers found. Stopping new peers check.');
            // The peer lookup end, we can make a clean final report
            sortPeers(true/*update main buid*/);
          }
        }, 1000);

        return data.bma.wot.member.uids()
          .then(function(uids){
            data.uidsByPubkeys = uids;
            return data.bma.network.peering.peers({ leaves: true });
          })
          .then(function(res){
            return $q.all(res.leaves.map(function(leaf) {
              return data.bma.network.peering.peers({ leaf: leaf })
                .then(function(subres){
                  var json = subres.leaf.value;
                  addOrRefreshPeerFromJson(json, newPeers)
                    .then(function() {
                      // If load has already finiseh (because of response time of some nodes)
                      // Flush new peers here
                      if (!data.loading) {
                        flushNewPeersAndSort(newPeers, true);
                      }
                    });
                });
            }))
              .then(function(){
                data.searchingPeersOnNetwork = false;
              });
          })
          .catch(function() {
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
        if (data.filter.endpointFilter) {
          return peer.hasEndpoint(data.filter.endpointFilter);
        }

        return true;
      },

      addOrRefreshPeerFromJson = function(json, list) {
        list = list || data.newPeers;

        var peers = createPeerEntities(json);
        var hasUpdates = false;

        return $q.all(
          peers.reduce(function(jobs, peer) {
            var existingPeer = data.knownPeers[peer.id];
            var existingMainBuid = existingPeer ? existingPeer.buid : null;
            var existingOnline = existingPeer ? existingPeer.online : false;

            return jobs.concat(
              refreshPeer(peer)
                .then(function (refreshedPeer) {
                  if (existingPeer) {
                    // remove existing peers, when reject or offline
                    if (!refreshedPeer || !refreshedPeer.online) {
                      data.peers.splice(data.peers.indexOf(existingPeer), 1);
                      delete data.knownPeers[existingPeer.id];
                      hasUpdates = true;
                    }
                    else if (refreshedPeer.buid !== existingMainBuid ||
                      existingOnline !== refreshedPeer.online){
                      hasUpdates = true;
                    }
                    else {
                      console.debug("Ce noeud n'a pas changé:" + refreshedPeer.id);
                    }
                  }
                  else if (refreshedPeer && refreshedPeer.online) {
                    list.push(refreshedPeer);
                    hasUpdates = true;
                  }
                })
           );
        }, []))
        .then(function() {
          return hasUpdates;
        });
      },

      createPeerEntities = function(json, bma) {
        if (!json) return [];
        var peer = new Peer(json);

        // Read bma endpoints
        if (!bma) {
          var endpoints = peer.getEndpoints();
          if (!endpoints) return []; // no BMA

          var bmas = endpoints.reduce(function (res, ep) {
            var bma = BMA.node.parseEndPoint(ep);
            return bma ? res.concat(bma) : res;
          }, []);

          if (bmas.length > 1) {
            return bmas.reduce(function (res, bma) {
              return res.concat(createPeerEntities(json, bma));
            }, []);
          }
          bma = bmas[0];
        }
        peer.bma = bma;
        peer.server = peer.getServer();
        peer.dns = peer.getDns();
        peer.blockNumber = peer.block.replace(/-.+$/, '');
        peer.uid = data.uidsByPubkeys[peer.pubkey];
        peer.id = [peer.pubkey, bma.dns, bma.ipv6, bma.ipv4, bma.port].join('-');
        return [peer];
      },

      refreshPeer = function(peer) {

        // Apply filter
        if (!applyPeerFilter(peer)) return $q.when();

        peer.api = peer.api || newLightBMA(peer.getHost(), peer.getPort());

        // Get current block
        return peer.api.blockchain.current()
          .then(function(block) {
            peer.currentNumber = block.number;
            peer.online = true;
            peer.buid = buid(block);
            if (data.knownBlocks.indexOf(peer.buid) === -1) {
              data.knownBlocks.push(peer.buid);
            }
            console.debug('[network] Peer [' + peer.server + ']    status [UP]   block [' + peer.buid.substring(0, 20) + ']');
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
              var bma = peer.getBMA();
              if (bma.dns && peer.server.indexOf(bma.dns) == -1) {
                // try again, using DNS instead of IPv4 / IPV6
                peer.secondTry = true;
                peer.api = newLightBMA(bma.dns, bma.port);
                return refreshPeer(peer); // recursive call
              }
            }
            // node is DOWN
            peer.online=false;
            peer.currentNumber = null;
            peer.buid = null;
            peer.uid = data.uidsByPubkeys[peer.pubkey];
            console.debug('[network] Peer [' + peer.server + '] status [DOWN]');
            return peer;
          })
          .then(function(peer) {
            // Exit if offline, or not expert mode or too small device
            if (!peer.online || !csSettings.data.expertMode || UIUtils.screen.isSmall()) return peer;
            var jobs = [];

            // Get hardship (only for a member peer)
            if (peer.uid) {
              jobs.push(peer.api.blockchain.stats.hardship({pubkey: peer.pubkey})
                .then(function (res) {
                  peer.difficulty = res && res.level;
                })
                .catch(function() {
                  peer.difficulty = '?'; // continue
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

            $q.all(jobs);
            return peer;
          });
      },

      flushNewPeersAndSort = function(newPeers, updateMainBuid) {
        newPeers = newPeers || data.newPeers;
        if (!newPeers.length) return;
        var peerstoAdd = newPeers.splice(0);
        _.forEach(peerstoAdd, function(peer) {
          data.knownPeers[peer.id] = peer;
        });
        data.peers = data.peers.concat(peerstoAdd);
        console.debug('[network] New peers found: add them to result and sort...');
        sortPeers(updateMainBuid);
      },

      sortPeers = function(updateMainBuid) {
        // Count peer by current block uid
        var currents = {};
        _.forEach(data.peers, function(peer){
          if (peer.buid) {
            currents[peer.buid] = currents[peer.buid] || 0;
            currents[peer.buid]++;
          }
        });
        var buids = _.keys(currents).map(function(key) {
          return { buid: key, count: currents[key] };
        });
        var mainBlock = _.max(buids, function(obj) {
          return obj.count;
        });
        data.memberPeersCount = 0;
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid == mainBlock.buid;
          peer.hasConsensusBlock = !peer.hasMainConsensusBlock && currents[peer.buid] > 1;
          data.memberPeersCount += peer.uid ? 1 : 0;
        });
        data.peers = _.uniq(data.peers, false, function(peer) {
          return peer.id;
        });
        data.peers = _.sortBy(data.peers, function(peer) {
          var score = 1;
          if (data.sort.type === 'api'){
            score += (1000000000 * (peer.hasEndpoint('ES_USER_API')? 1 : 0));
          }
          else if (data.sort.type === 'difficulty'){
            score += (1000000000 * (peer.level ? peer.level : 0));
          }
          else if (data.sort.type === 'current_block'){
            score += (1000000000 * (peer.currentNumber ? peer.currentNumber : 0));
          }

          score += (100000000 * (peer.online ? 1 : 0));
          score += (10000000  * (peer.hasMainConsensusBlock ? 1 : 0));
          score += (1000     * (peer.hasConsensusBlock ? currents[peer.buid] : 0));
          score += (-1       * (peer.uid ? peer.uid.charCodeAt(0) : 999)); // alphabetical order

          if (!data.sort.asc) {
            return score;
          }
          else {
            return -score;
          }
        });

        // Raise event on new main block
        if (updateMainBuid && mainBlock.buid && data.mainBuid !== mainBlock.buid) {
          data.mainBuid = mainBlock.buid;
          api.data.raise.mainBlockChanged(data);
        }

        // Raise event when changed
        api.data.raise.changed(data); // raise event
      },

      startListeningOnSocket = function() {
        // Listen for new block
        data.bma.websocket.block().on(function(block) {
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
        data.bma.websocket.peer().on(function(json) {
          if (data.loading) return;
          var newPeers = [];
          addOrRefreshPeerFromJson(json, newPeers)
            .then(function(hasUpdates) {
              if (!hasUpdates) return;
              if (newPeers.length>0) {
                flushNewPeersAndSort(newPeers, true);
              }
              else {
                sortPeers(true);
              }
            });
        });
      },

      start = function(bma, options) {
        options = options || {};
        return $q(function(resolve, reject) {
          close();
          data.bma = bma ? bma : BMA;
          data.filter = options.filter;
          data.sort = options.sort;
          console.info('[network] Starting network [{0}] filetered on [{1}]'.format(bma.node.server,
            data.filter ? data.filter : 'none'));
          var now = new Date();
          startListeningOnSocket(resolve, reject);
          loadPeers()
            .then(function(peers){
              resolve(peers);
              console.debug('[network] Started in '+(new Date().getTime() - now.getTime())+'ms');
            });
        });
      },

      close = function() {
        if (data.bma) {
          console.info('[network] Stopping');
          data.bma.websocket.close();
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
