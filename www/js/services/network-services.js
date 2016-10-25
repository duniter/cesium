
angular.module('cesium.network.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, BMA, Api, csSettings) {
  'ngInject';

  factory = function(id) {

    var
      interval,
      api = new Api(this, "csNetwork-" + id),

      data = {
        bma: null,
        peers: [],
        newPeers: [],
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
        data.newPeers = [];
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

      sortPeers = function() {
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
        data.mainBuid = mainBlock.buid;
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid == data.mainBuid;
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
      },

      processPeer = function(peer, refresh) {
        if (!peer) return;
        peer = new Peer(peer);
        var server = peer.getServer();
        // Test each peer only once
        if (!refresh && data.knownPeers[server]) return;
        var skipPushToNew = refresh && !data.knownPeers[server];
        data.knownPeers[server] = true;
        peer.dns = peer.getDns();
        peer.server = server;
        peer.blockNumber = peer.block.replace(/-.+$/, '');
        peer.uid = data.uidsByPubkeys[peer.pubkey];
        var node = BMA.instance(peer.getHost(), peer.getPort(), false);
        var jobs  = [
          node.blockchain.current()
          .then(function(block){
            peer.currentNumber = block.number;
            peer.online = true;
            peer.buid = buid(block);
            if (data.knownBlocks.indexOf(peer.buid) === -1) {
              data.knownBlocks.push(peer.buid);
            }
          })
         ];
        if (csSettings.data.expertMode) {
          // Get Version
          jobs.push(node.node.summary()
            .then(function(res){
              peer.version = res && res.duniter && res.duniter.version;
            }));

          // Get hardship
          if (peer.uid) {
            jobs.push(node.blockchain.stats.hardship({pubkey: peer.pubkey})
              .then(function(res){
                peer.level = res && res.level;
              }).catch(function() {
                peer.level = null;
              })
            );
          }
        }
        $q.all(jobs)
          .then(function() {
            if (!skipPushToNew) data.newPeers.push(peer);
            console.debug('[network] Peer [' + server + ']    status [UP]   block [' + peer.buid.substring(0, 20) + ']');
          })
          .catch(function(err) {
            // node is DOWN
            peer.online=false;
            peer.buid = null;
            peer.uid = data.uidsByPubkeys[peer.pubkey];
            if (!skipPushToNew) data.newPeers.push(peer);
            console.debug('[network] Peer [' + server + '] status [DOWN]');
          });
      },

      refreshPeers = function() {
        if (interval) {
          $interval.cancel(interval);
        }

        interval = $interval(function() {
          console.debug('[network] check if finish...');
          if (data.newPeers.length) {
            data.peers = data.peers.concat(data.newPeers.splice(0));
            console.debug('[network] New peers found: sort and ad them to result...');
            sortPeers();
            api.data.raise.changed(data); // send event to plugins
          } else if (data.updatingPeers && !data.searchingPeersOnNetwork) {
            console.debug('[network] Finish : all peers found. Stopping new peers check.');
            // The peer lookup end, we can make a clean final report
            sortPeers();
            data.updatingPeers = false;
            api.data.raise.changed(data); // send event to plugins
            $interval.cancel(interval);
          }
        }, 1000);

        data.knownPeers = {};
        data.peers = [];
        data.searchingPeersOnNetwork = true;
        data.updatingPeers = true;
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
                  processPeer(peer);
                });
            }))
              .then(function(){
                data.searchingPeersOnNetwork = false;
              });
          })
          .catch(function(err) {
            data.searchingPeersOnNetwork = false;
          });
      },

      startListeningOnSocket = function() {
        // Listen for new block
        data.bma.websocket.block().on('block', function(block) {
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
                refreshPeers();
              }, 2000);
            }
          }
        });
        // Listen for new peer
        data.bma.websocket.peer().on('peer', function(peer) {
          // Waiting block propagation
          $timeout(function() {
            var promise = processPeer(peer, true);
            if (promise) promise.then(function() {
              if (!data.updatingPeers && data.newPeers.length) {
                data.peers = data.peers.concat(data.newPeers.splice(0));
                console.debug('[network] New peers found: sort and ad them to result...');
              }
              sortPeers();
              api.data.raise.changed(data); // send event to plugins
            }, 500);
          })
        });
      },

      start = function(bma) {
        return $q(function(resolve, reject) {
          close();
          data.bma = bma ? bma : BMA;
          console.info('[network] Starting network [' + bma.node.server + ']');
          var now = new Date();
          startListeningOnSocket(resolve, reject);
          refreshPeers()
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
      refreshPeers: refreshPeers,
      isBusy: isBusy,
      // api extension
      api: api
    };
  };

  var service = factory('default');

  service.instance = factory;
  return service;
});
