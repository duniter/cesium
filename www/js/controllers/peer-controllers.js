
function PeerController($scope, $rootScope, $ionicSlideBoxDelegate, $ionicModal, BMA, $controller) {
  'ngInject';

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.showPeer($state.stateParams.server);
  });

  $scope.showPeer = function(server) {
    $scope.node = BMA.instance(server);
    // Get the peers
    $scope.node.network.peers()
      .then(function(json){
        $scope.loaded = true;
        var peers = json.peers.map(function(p) {
          var peer = new Peer(p);
          peer.online = p.status == 'UP';
          peer.blockNumber = peer.block.replace(/-.+$/, '');
          peer.dns = peer.getDns();
          peer.uid = $rootScope.memberUidsByPubkeys[peer.pubkey];
          return peer;
        });
        $scope.peers = _.sortBy(peers, function(p) {
          var score = 1;
          score += 10000 * (p.online ? 1 : 0);
          score += 1000  * (p.hasMainConsensusBlock ? 1 : 0);
          score += 100   * (p.uid ? 1 : 0);
          return -score;
        });
      });
  };
}
