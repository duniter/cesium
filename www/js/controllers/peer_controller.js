
function PeerController($scope, $rootScope, $ionicSlideBoxDelegate, $ionicModal, BMA, $controller) {


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
          var member = _.findWhere($rootScope.members, { pubkey: peer.pubkey });
          peer.uid = member && member.uid;
          return peer;
        });
        $scope.peers = _.sortBy(peers, function(p) {
          var score = 1
            + 10000 * (p.online ? 1 : 0)
            + 1000  * (p.hasMainConsensusBlock ? 1 : 0) +
            + 100   * (p.uid ? 1 : 0);
          return -score;
        });
      })
  };
}
