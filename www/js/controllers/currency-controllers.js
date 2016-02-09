
angular.module('cesium.currency.controllers', ['cesium.services'])

.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider

    .state('app.explore_currency', {
      url: "/home/explore",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/explore_currency.html",
          controller: 'CurrenciesCtrl'
        }
      }
    })

    .state('app.explore_tabs', {
      url: "/currency",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/explore_tabs.html",
          controller: 'ExploreCtrl'
        }
      }
    })

    .state('app.view_peer', {
      url: "/peer/:server",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/view_peer.html",
          controller: 'PeerCtrl'
        }
      }
    })
})

.controller('CurrenciesCtrl', CurrenciesController)

.controller('ExploreCtrl', ExploreController)

.controller('PeerCtrl', PeerController)

;

function CurrenciesController($scope, $state) {

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $state.go('app.explore_tabs');
  };
}

function ExploreController($scope, $rootScope, $state, BMA, $q, UIUtils, $interval, $timeout) {

  var USE_RELATIVE_DEFAULT = true;

  CurrenciesController.call(this, $scope, $state);
  WotLookupController.call(this, $scope, BMA, $state);
  PeersController.call(this, $scope, $rootScope, BMA, UIUtils, $q, $interval, $timeout);

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];
  $scope.formData = { useRelative: false };
  $scope.knownBlocks = [];
  $scope.entered = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered) {
      $scope.entered = true;
      $scope.startListeningOnSocket();
    }
    $timeout(function() {
      if ((!$scope.search.peers || $scope.search.peers.length == 0) && $scope.search.lookingForPeers){
        $scope.updateExploreView();
      }
    }, 2000);
  });

  $scope.startListeningOnSocket = function() {

    // Currency OK
    BMA.websocket.block().on('block', function(block) {
      var theFPR = fpr(block);
      if ($scope.knownBlocks.indexOf(theFPR) === -1) {
        $scope.knownBlocks.push(theFPR);
        // We wait 2s when a new block is received, just to wait for network propagation
        var wait = $scope.knownBlocks.length === 1 ? 0 : 2000;
        $timeout(function() {
          $scope.updateExploreView();
        }, wait);
      }
    });
    BMA.websocket.peer().on('peer', function(peer) {
      console.log(peer);
    });
  };

  $scope.$watch('formData.useRelative', function() {
    if ($scope.formData.useRelative) {
      $scope.M = $scope.M / $scope.currentUD;
      $scope.MoverN = $scope.MoverN / $scope.currentUD;
      $scope.UD = $scope.UD / $scope.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.baseUnit;
    } else {
      $scope.M = $scope.M * $scope.currentUD;
      $scope.MoverN = $scope.MoverN * $scope.currentUD;
      $scope.UD = $scope.UD * $scope.currentUD;
      $scope.unit = $scope.baseUnit;
      $scope.udUnit = '';
    }
  }, true);

  $scope.doUpdate = function() {
    $scope.updateExploreView();
  };

  $scope.updateExploreView = function() {

    UIUtils.loading.show();
    $scope.formData.useRelative = false;

    $q.all([

      // Get the currency parameters
      BMA.currency.parameters()
        .then(function(json){
          $scope.c = json.c;
          $scope.baseUnit = json.currency;
          $scope.unit = json.currency;
        }),

      // Get the current block informations
      BMA.blockchain.current()
        .then(function(block){
          $scope.M = block.monetaryMass;
          $scope.N = block.membersCount;
          $scope.time  = moment(block.medianTime*1000).format('YYYY-MM-DD HH:mm');
          $scope.difficulty  = block.powMin;
        }),

      // Get the UD informations
      BMA.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return BMA.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                $scope.currentUD = block.dividend;
                $scope.UD = block.dividend;
                $scope.Nprev = block.membersCount;
              });
          }
        })
    ])

      // Done
      .then(function(){
        $scope.M = $scope.M - $scope.UD*$scope.Nprev;
        $scope.MoverN = $scope.M / $scope.Nprev;
        $scope.cactual = 100 * $scope.UD / $scope.MoverN;
        $scope.formData.useRelative = USE_RELATIVE_DEFAULT;
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        console.error('>>>>>>>' , err);
        UIUtils.alert.error('Could not fetch informations from remote uCoin node.');
        UIUtils.loading.hide();
      })
      .then(function(){
        // Network
        $scope.searchPeers();
      });
  };
}


function PeersController($scope, $rootScope, BMA, UIUtils, $q, $interval, $timeout) {

  var newPeers = [], interval, lookingForPeers;
  $scope.search.lookingForPeers = false;
  $scope.search.peers = [];

  $scope.overviewPeers = function() {
    var currents = {}, block;
    for (var i = 0, len = $scope.search.peers.length; i < len; i++) {
      block = $scope.search.peers[i].current;
      if (block) {
        var bid = fpr(block);
        currents[bid] = currents[bid] || 0;
        currents[bid]++;
      }
    }
    var fprs = _.keys(currents).map(function(key) {
      return { fpr: key, qty: currents[key] };
    });
    var best = _.max(fprs, function(obj) {
      return obj.qty;
    });
    var p;
    for (var j = 0, len2 = $scope.search.peers.length; j < len2; j++) {
      p = $scope.search.peers[j];
      p.hasMainConsensusBlock = fpr(p.current) == best.fpr;
      p.hasConsensusBlock = !p.hasMainConsensusBlock && currents[fpr(p.current)] > 1;
    }
    $scope.search.peers = _.uniq($scope.search.peers, false, function(peer) {
      return peer.pubkey;
    });
    $scope.search.peers = _.sortBy($scope.search.peers, function(p) {
      var score = 1
        + 10000 * (p.online ? 1 : 0)
        + 1000  * (p.hasMainConsensusBlock ? 1 : 0) +
        + 100   * (p.uid ? 1 : 0);
      return -score;
    });
  };

  $scope.searchPeers = function() {

    if (interval) {
      $interval.cancel(interval);
    }

    interval = $interval(function() {
      if (newPeers.length) {
        $scope.search.peers = $scope.search.peers.concat(newPeers.splice(0));
        $scope.overviewPeers();
      } else if (lookingForPeers && !$scope.search.lookingForPeers) {
        // The peer lookup endend, we can make a clean final report
        $timeout(function(){
          lookingForPeers = false;
          $scope.overviewPeers();
        }, 1000);
      }
    }, 1000);

    var known = {};
    $rootScope.members = [];
    $scope.search.peers = [];
    $scope.search.lookingForPeers = true;
    lookingForPeers = true;
    return BMA.network.peering.peers({ leaves: true })
      .then(function(res){
        return BMA.wot.members()
          .then(function(json){
            $rootScope.members = json.results;
            return res;
          });
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
                  var member = _.findWhere($rootScope.members, { pubkey: peer.pubkey });
                  peer.uid = member && member.uid;
                  newPeers.push(peer);
                  var node = BMA.instance(peer.getURL());
                  return node.blockchain.current()
                    .then(function(block){
                      peer.current = block;
                      peer.online = true;
                      peer.server = peer.getURL();
                      if ($scope.knownBlocks.indexOf(fpr(block)) === -1) {
                        $scope.knownBlocks.push(fpr(block));
                      }
                    })
                    .catch(function(err) {
                    })
                }
              }
            })
        }))
          .then(function(){
            $scope.search.lookingForPeers = false;
          })
      })
      .catch(function(err) {
        //console.log(err);
        //UIUtils.alert.error('Could get peers from remote uCoin node.');
        //$scope.search.lookingForPeers = false;
      });
  };

  $scope.viewPeer = function() {

  };
}

function fpr(block) {
  return block && [block.number, block.hash].join('-');
}
