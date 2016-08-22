
angular.module('cesium.network.services', ['ngResource', 'ngApi', 'cesium.bma.services'])

.factory('csNetwork', function($rootScope, $q, $interval, $timeout, BMA, Api) {
  'ngInject';

  CSNetwork = function(id) {

    var
    data = {
      peers: [],
      newPeers: [],
      knownBlocks: []
    },
    interval,
    updatingPeers = false,
    searchingPeersOnNetwork = false,
    api = new Api(this, "csNetwork-" + id),

    buid = function(block) {
      return block && [block.number, block.hash].join('-');
    },

    processPeers = function() {
      // Count peer by current block uid
      var currents = {}, block;
      _.forEach(data.peers, function(peer){
        if (peer.buid) {
          currents[peer.buid] = currents[peer.buid] || 0;
          currents[peer.buid]++;
        }
      });
      var buids = _.keys(currents).map(function(key) {
        return { buid: key, count: currents[key] };
      });
      var mainBuid = _.max(buids, function(obj) {
        return obj.count;
      }).buid;
      var p;
      _.forEach(data.peers, function(peer){
        peer.hasMainConsensusBlock = peer.buid == mainBuid;
        peer.hasConsensusBlock = !peer.hasMainConsensusBlock && currents[peer.buid] > 1;
      });
      data.peers = _.uniq(data.peers, false, function(peer) {
        return peer.pubkey;
      });
      data.peers = _.sortBy(data.peers, function(peer) {
        var score = 1;
        score += (10000000 * (peer.online ? 1 : 0));
        score += (1000000  * (peer.hasMainConsensusBlock ? 1 : 0));
        score += (100      * (peer.hasConsensusBlock ? currents[peer.buid] : 0));
        score += (10       * (peer.uid ? 1 : 0));
        return -score;
      });
    },

    getPeers = function() {
      return $q(function(resolve, reject){

        if (interval) {
          $interval.cancel(interval);
        }

        interval = $interval(function() {
          if (data.newPeers.length) {
            data.peers = data.peers.concat(data.newPeers.splice(0));
            processPeers();
          } else if (updatingPeers && !searchingPeersOnNetwork) {
            // The peer lookup endend, we can make a clean final report
            $timeout(function(){
              updatingPeers = false;
              processPeers();
              resolve(data.peers);
              $interval.cancel(interval);
            }, 1000);
          }
        }, 1000);

        var known = {};
        data.peers = [];
        searchingPeersOnNetwork = true;
        updatingPeers = true;
        var uidsByPubkeys;
        return BMA.wot.member.uids(true/*cache*/)
          .then(function(uids){
            uidsByPubkeys = uids;
            return BMA.network.peering.peers({ leaves: true });
          })
          .then(function(res){
            return $q.all(res.leaves.map(function(leaf) {
              return BMA.network.peering.peers({ leaf: leaf })
                .then(function(subres){
                  var peer = subres.leaf.value;
                  if (peer) {
                    peer = new Peer(peer);
                    // Test each peer only once
                    if (!known[peer.getURL()]) {
                      peer.dns = peer.getDns();
                      peer.blockNumber = peer.block.replace(/-.+$/, '');
                      data.newPeers.push(peer);
                      var node = BMA.instance(peer.getHost(), peer.getPort());
                      return node.blockchain.current()
                        .then(function(block){
                          peer.current = block;
                          peer.online = true;
                          peer.server = peer.getURL();
                          peer.buid = buid(block);
                          peer.uid = uidsByPubkeys[peer.pubkey];
                          if (data.knownBlocks.indexOf(peer.buid) === -1) {
                            data.knownBlocks.push(peer.buid);
                          }
                        })
                        .catch(function(err) {
                          // nothing to do (node is DOWN ?)
                        });
                    }
                  }
                });
            }))
              .then(function(){
                searchingPeersOnNetwork = false;
              });
          })
          .catch(function(err) {
            //console.log(err);
            searchingPeersOnNetwork = false;
          });
      });
    };

    // Register extension points
    //api.registerEvent('data', 'load');

    return {
      id: id,
      buid: buid,
      data: data,
      getPeers: getPeers,
      // api extension
      api: api
    };
  };

  var service = CSNetwork('default');

  service.instance = CSNetwork;
  return service;
});
