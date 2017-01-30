
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
          endpointFilter: null,
          online: false
        },
        sort:{
          type: null,
          asc: true
        },
        knownBlocks: [],
        mainBlock: null,
        uidsByPubkeys: null,
        searchingPeersOnNetwork: false
      },

      // Return the block uid
      buid = function(block) {
        return block && [block.number, block.hash].join('-');
      },

      resetData = function() {
        data.bma = null;
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
        data.memberPeersCount = 0;
        data.knownBlocks = [];
        data.mainBlock = null;
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

      loadPeers = function() {
        data.peers.splice(0);
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

        return data.bma.wot.member.uids()
          .then(function(uids){
            data.uidsByPubkeys = uids;

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
        if (data.filter.endpointFilter) {
          return peer.hasEndpoint(data.filter.endpointFilter);
        }

        // Filter on status
        if (!data.filter.online && peer.status == 'UP') {
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
                    if (!refreshedPeer || (refreshedPeer.online !== data.filter.online)) {
                      console.debug('[network] Peer [{0}] removed (cause: {1})'.format(peer.server, refreshedPeer ? 'filtered' : (refreshedPeer.online ? 'UP': 'DOWN')));
                      data.peers.splice(data.peers.indexOf(existingPeer), 1);
                      hasUpdates = true;
                    }
                    else if (refreshedPeer.buid !== existingMainBuid){
                      console.debug('[network] Peer [{0}] changed current block'.format(refreshedPeer.server));
                      hasUpdates = true;
                    }
                    else if (existingOnline !== refreshedPeer.online){
                      console.debug('[network] Peer [{0}] is now UP'.format(refreshedPeer.server));
                      hasUpdates = true;
                    }
                    else {
                      console.debug("[network] Peer [{0}] not changed".format(refreshedPeer.server));
                    }
                  }
                  else if (refreshedPeer && (refreshedPeer.online === data.filter.online)) {
                    console.debug("[network] Peer [{0}] is UP".format(refreshedPeer.server));
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

          // if many bma endpoint: recursive call
          if (bmas.length > 1) {
            return bmas.reduce(function (res, bma) {
              return res.concat(createPeerEntities(json, bma));
            }, []);
          }

          // if only one bma endpoint: use it and continue
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

        if (!data.filter.online) {
          peer.online = false;
          return $q.when(peer);
        }

        peer.api = peer.api || BMA.lightInstance(peer.getHost(), peer.getPort());

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
                peer.api = BMA.lightInstance(bma.dns, bma.port);
                return refreshPeer(peer); // recursive call
              }
            }
            // node is DOWN
            peer.online=false;
            peer.currentNumber = null;
            peer.buid = null;
            peer.uid = data.uidsByPubkeys[peer.pubkey];
            return peer;
          })
          .then(function(peer) {
            // Exit if offline, or not expert mode or too small device
            if (!data.filter.online || !peer || !peer.online || !csSettings.data.expertMode || UIUtils.screen.isSmall()) return peer;
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

      getAlphanumeralValueScore = function(value, nbChars) {
        if (!value) return 0;
        var score = 0;
        value = value.toLowerCase();
        for (var i=0; i < nbChars; i++) {
          score += Math.pow(0.001, i) * value.charCodeAt(i);
        }
        return score;
      },

      sortPeers = function(updateMainBuid) {
        // Construct a map of buid, with peer count and medianTime
        var buids = {};
        data.memberPeersCount = 0;
        _.forEach(data.peers, function(peer){
          if (peer.buid) {
            var buid = buids[peer.buid];
            if (!buid) {
              buid = {
                buid: peer.buid,
                count: 0,
                medianTime: peer.medianTime
              };
              buids[peer.buid] = buid;
            }
            buid.count++;
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
          peer.hasConsensusBlock = !peer.hasMainConsensusBlock && buids[peer.buid].count > 1;
        });
        data.peers = _.uniq(data.peers, false, function(peer) {
          return peer.id;
        });
        data.peers = _.sortBy(data.peers, function(peer) {
          var score = 0;
          if (data.sort.type) {
            var sign = data.sort.asc ? 1 : -1;
            var sortScore = 0;
            sortScore += (data.sort.type == 'uid' ? getAlphanumeralValueScore(peer.uid||peer.pubkey, 3) : 0);
            sortScore += (data.sort.type == 'api' ? (peer.hasEndpoint('ES_USER_API') ? 0 : 1) : 0);
            sortScore += (data.sort.type == 'difficulty' ? (peer.difficulty ? peer.difficulty : sign * 99999) : 0);
            sortScore += (data.sort.type == 'current_block' ? (peer.currentNumber ? peer.currentNumber : 0) : 0);
            score += (1000000000 * sortScore);
          }
          score += (100000000 * (peer.online ? 1 : 0));
          score += (10000000  * (peer.hasMainConsensusBlock ? 0 : 1));
          score += (100000    * (peer.hasConsensusBlock ? buids[peer.buid].pct : 0));
          score += (100       * (peer.difficulty ? peer.difficulty : 999));
          score += (1         * (peer.uid ? getAlphanumeralValueScore(peer.uid, 2) : 0));
          return score;
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
        return $q(function(resolve, reject) {
          close();
          data.bma = bma ? bma : BMA;
          data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
          data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
          console.info('[network] Starting network from [{0}]'.format(bma.node.server));
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
