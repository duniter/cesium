
angular.module('cesium.network.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, BMA, Api, csSettings, UIUtils) {
  'ngInject';

  factory = function(id) {

    var
      interval,
      api = new Api(this, "csNetwork-" + id),

      data = {
        bma: null,
        peers: [],
        knownBlocks: [],
        knownPeers: {},
        mainBuid: null,
        uidsByPubkeys: null,
        updatingPeers: true,
        searchingPeersOnNetwork: false
      },

      resetData = function() {
        data.bma = null;
        data.peers = [];
        data.knownBlocks = [];
        data.knownPeers = {};
        data.mainBuid = null;
        data.uidsByPubkeys = {};
        data.updatingPeers = true;
        data.searchingPeersOnNetwork = false;
      },

      // Return the block uid
      buid = function(block) {
        return block && [block.number, block.hash].join('-');
      },

      hasPeers = function() {
        return data.peers && data.peers.length > 0;
      },

      getPeers = function() {
        return data.peers;
      },

      isBusy = function() {
        return data.updatingPeers;
      },

      getKnownBlocks = function() {
        return data.knownBlocks;
      },

      loadPeers = function() {
        data.knownPeers = {};
        data.peers = [];
        data.searchingPeersOnNetwork = true;
        data.updatingPeers = true;

        var newPeers = [];

        if (interval) {
          $interval.cancel(interval);
        }

        interval = $interval(function() {
          // not same job instance
          if (newPeers.length) {
            flushNewPeersAndSort(newPeers);
          }
          else if (data.updatingPeers && !data.searchingPeersOnNetwork) {
            data.updatingPeers = false;
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
                  var peer = subres.leaf.value;
                  addIfNewAndOnlinePeer(peer, newPeers);
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

      addIfNewAndOnlinePeer = function(peer, list) {
        list = list || data.newPeers;
        if (!peer) return;
        peer = new Peer(peer);
        var server = peer.getServer();
        if (data.knownPeers[server]) return; // already processed: exit
        refreshPeer(peer)
          .then(function() {
            if (peer.online) list.push(peer);
          });
      },

      refreshPeer = function(peer) {
        peer.server = peer.getServer();
        peer.dns = peer.getDns();
        peer.blockNumber = peer.block.replace(/-.+$/, '');
        peer.uid = data.uidsByPubkeys[peer.pubkey];
        var node = new BMA.instance(peer.getHost(), peer.getPort(), false);



        // Get current block
        return node.blockchain.current()
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
              peer.level  = 0;
              return peer;
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
            // Exit, if offline, not expert mode, or too small device
            if (!peer.online || !csSettings.data.expertMode || UIUtils.screen.isSmall()) return peer;
            var jobs = [];
            // Get Version
            jobs.push(node.node.summary()
              .then(function(res){
                peer.version = res && res.duniter && res.duniter.version;
              })
              .catch(function() {
                peer.version = null; // continue
              }));

            // Get hardship (only for a member peer)
            if (peer.uid) {
              jobs.push(node.blockchain.stats.hardship({pubkey: peer.pubkey})
                .then(function (res) {
                  peer.level = res && res.level;
                })
                .catch(function() {
                  peer.level = null; // continue
                }));
            }

            $q.all(jobs);
            return peer;
          });
      },

      flushNewPeersAndSort = function(newPeers) {
        newPeers = newPeers || data.newPeers;
        if (newPeers.length) {
          data.peers = data.peers.concat(newPeers.splice(0));
          console.debug('[network] New peers found: add them to result and sort...');
          sortPeers();
        }
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
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid == mainBlock.buid;
          peer.hasConsensusBlock = !peer.hasMainConsensusBlock && currents[peer.buid] > 1;
        });
        data.peers = _.uniq(data.peers, false, function(peer) {
          return peer.pubkey;
        });
        data.peers = _.sortBy(data.peers, function(peer) {
          var score = 1;
          score += (100000000 * (peer.online ? 1 : 0));
          score += (10000000  * (peer.hasMainConsensusBlock ? 1 : 0));
          score += (1000     * (peer.hasConsensusBlock ? currents[peer.buid] : 0));
          score += (-1       * (peer.uid ? peer.uid.charCodeAt(0) : 999)); // alphabetical order
          return -score;
        });
        if (updateMainBuid) {
          // TODO: raise a special event if changed ?
          data.mainBuid = mainBlock.buid;
          //api.data.raise.changed(data); // raise event
        }
        api.data.raise.changed(data); // raise event
      },



      startListeningOnSocket = function() {
        // Listen for new block
        data.bma.websocket.block().on(function(block) {
          if (data.updatingPeers) return;
          var uid = buid(block);
          if (data.knownBlocks.indexOf(uid) === -1) {
            console.debug('[network] Receiving block: ' + uid.substring(0, 20));
            data.knownBlocks.push(uid);
            // If first block: do NOT refresh peers (will be done in start() method)
            var skipRefreshPeers = data.knownBlocks.length === 1;
            if (!skipRefreshPeers) {
              data.updatingPeers = true;
              // We wait 2s when a new block is received, just to wait for network propagation
              $timeout(function() {
                console.debug('[network] new block received by WS: will refresh peers');
                loadPeers();
              }, 2000);
            }
          }
        });
        // Listen for new peer
        data.bma.websocket.peer().on(function(peer) {
          if (!peer || data.updatingPeers) return;
          peer = new Peer(peer);
          var existingPeer = _.where(data.peers, {server: peer.getServer()});
          if (existingPeer && existingPeer.length == 1) {
            peer = existingPeer[0];
            existingPeer = true;
          }
          refreshPeer(peer).then(function() {
            if (data.updatingPeers) return; // skip if load has been started

            if (existingPeer) {
              if (!peer.online) {
                data.peers.splice(data.peers.indexOf(peer), 1); // remove existing peers
              }
              sortPeers();
            }
            else if(peer.online) {
              data.peers.push(peer);
              sortPeers();
            }
          });
        });
      },

      start = function(bma) {
        return $q(function(resolve, reject) {
          close();
          data.bma = bma ? bma : BMA;
          console.info('[network] Starting network [' + bma.node.server + ']');
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
