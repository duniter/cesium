
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider, csConfig) {
  'ngInject';

  $stateProvider

    .state('app.network', {
      url: "/network?type&expert",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_network.html",
          controller: 'NetworkLookupCtrl'
        }
      }
    })

    .state('app.view_peer', {
      url: "/network/peer/:server",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_peer.html",
          controller: 'PeerViewCtrl'
        }
      },
      data: {
        preferHttp: true // avoid HTTPS if config has httpsMode=clever
      }
    });
})

.controller('NetworkLookupCtrl', NetworkLookupController)

.controller('PeerViewCtrl', PeerViewController)

.controller('NetworkLookupModalCtrl', NetworkLookupModalController)

;

function NetworkLookupController($scope,  $state, $ionicHistory, $ionicPopover, $window,
                                 BMA, UIUtils, csSettings, csCurrency, csNetwork, csWot) {
  'ngInject';

  $scope.networkStarted = false;
  $scope.ionItemClass = '';
  $scope.expertMode = csSettings.data.expertMode && !UIUtils.screen.isSmall();
  $scope.isHttps = ($window.location.protocol === 'https:');
  $scope.search = {
    text: '',
    loading: true,
    type: undefined,
    results: [],
    endpointFilter: null,
    sort : undefined,
    asc: true
  };

  /**
   * Enter in view
   */
  $scope.enter = function(e, state) {
    if ($scope.networkStarted) return;
    $scope.networkStarted = true;
    $scope.search.loading = true;
    csCurrency.default()
      .then(function (currency) {
        if (currency) {
          $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
            BMA.instance(currency.peer.host, currency.peer.port) : BMA;
          if (state && state.stateParams) {
            if (state.stateParams.type && ['mirror', 'member', 'offline'].indexOf(state.stateParams.type) != -1) {
              $scope.search.type = state.stateParams.type;
            }
            if (state.stateParams.expert) {
              $scope.expertMode = (state.stateParams.expert == 'true');
            }
          }
          $scope.load();
        }
      })
      .catch(function(err) {
        UIUtils.onError('ERROR.GET_CURRENCY_FAILED')(err);
        $scope.networkStarted = false;
      });

  };
  //$scope.$on('$ionicView.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

  /**
   * Leave the view
   */
  $scope.leave = function() {
    if (!$scope.networkStarted) return;
    csNetwork.close();
    $scope.networkStarted = false;
    $scope.search.loading = true;
  };
  $scope.$on('$ionicView.beforeLeave', $scope.leave);
  $scope.$on('$ionicParentView.beforeLeave', $scope.leave);
  $scope.$on('$destroy', $scope.leave);

  $scope.computeOptions = function() {
    var options = {
      filter: {
        member: (!$scope.search.type || $scope.search.type === 'member'),
        mirror: (!$scope.search.type || $scope.search.type === 'mirror'),
        endpointFilter : (angular.isDefined($scope.search.endpointFilter) ? $scope.search.endpointFilter : null),
        online: !($scope.search.type && $scope.search.type === 'offline')
      },
      sort: {
        type : $scope.search.sort,
        asc : $scope.search.asc
      },
      expertMode: $scope.expertMode
    };
    return options;
  };

  $scope.load = function() {

    if ($scope.search.loading){
      csNetwork.start($scope.node, $scope.computeOptions());

      // Catch event on new peers
      $scope.refreshing = false;
      csNetwork.api.data.on.changed($scope, function(data){
        if (!$scope.refreshing) {
          $scope.refreshing = true;
          csWot.extendAll(data.peers)
            .then(function() {
              // Avoid to refresh if view has been leaving
              if ($scope.networkStarted) {
                $scope.updateView(data);
              }
              $scope.refreshing = false;
            });
        }
      });
    }

    // Show help tip
    $scope.showHelpTip();
  };

  $scope.updateView = function(data) {
    console.debug("[peers] Updating UI");
    $scope.search.results = data.peers;
    $scope.search.memberPeersCount = data.memberPeersCount;
    // Always tru if network not started (e.g. after leave+renter the view)
    $scope.search.loading = !$scope.networkStarted || csNetwork.isBusy();
    if ($scope.motion && $scope.search.results && $scope.search.results.length > 0) {
      $scope.motion.show({selector: '.item-peer'});
    }
  };

  $scope.refresh = function() {
    // Network
    $scope.search.loading = true;
    csNetwork.loadPeers();
  };

  $scope.sort = function() {
    $scope.search.loading = true;
    $scope.refreshing = true;
    csNetwork.sort($scope.computeOptions());
    $scope.updateView(csNetwork.data);
  };

  $scope.toggleSearchType = function(type){
    $scope.hideActionsPopover();
    if ($scope.search.type === type || type === 'none') {
      $scope.search.type = undefined;
    }
    else {
      $scope.search.type = type;
    }
    csNetwork.close();
    $scope.search.loading = true;
    $scope.load();

    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });
    $state.go('app.network', {type: $scope.search.type}, {
      reload: false,
      inherit: true,
      notify: false});

  };

  $scope.toggleSearchEndpoint = function(endpoint){
    $scope.hideActionsPopover();
    if ($scope.search.endpointFilter === endpoint || endpoint === null) {
      $scope.search.endpointFilter = null;
    }
    else {
      $scope.search.endpointFilter = endpoint;
    }
    $scope.sort();
  };

  $scope.toggleSort = function(sort){
    if ($scope.search.sort === sort && !$scope.search.asc) {
      $scope.search.asc = undefined;
      $scope.search.sort = undefined;
    }
    else {
      $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
      $scope.search.sort = sort;
    }
    $scope.sort();
  };

  $scope.selectPeer = function(peer) {
    $state.go('app.view_peer', {server: peer.getServer()});
  };

  $scope.$on('csView.action.refresh', function(event, context) {
    if (context == 'peers') {
      $scope.refresh();
    }
  });

  $scope.$on('csView.action.showActionsPopover', function(event, clickEvent) {
    $scope.showActionsPopover(clickEvent);
  });

  /* -- popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/network/lookup_popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  /* -- help tip -- */

  // Show help tip
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    index = csSettings.data.helptip.currency;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startCurrencyTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.currency = endIndex;
        csSettings.store();
      });
  };
}


function NetworkLookupModalController($scope, $controller, parameters) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('NetworkLookupCtrl', {$scope: $scope}));

  // Read parameters
  parameters = parameters || {};
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : true;
  $scope.search.type = angular.isDefined(parameters.type) ? parameters.type : $scope.search.type;
  $scope.search.endpointFilter = angular.isDefined(parameters.endpointFilter) ? parameters.endpointFilter : $scope.search.endpointFilter;
  $scope.expertMode = angular.isDefined(parameters.expertMode) ? parameters.expertMode : $scope.expertMode;
  $scope.ionItemClass = parameters.ionItemClass || 'item-border-large';

  $scope.selectPeer = function(peer) {
    $scope.closeModal(peer);
  };

  $scope.$on('modal.hidden', function(){
    $scope.leave();
  });

  // Disable this unsed method - called by load()
  $scope.showHelpTip = function() {};

  // Enter the modal
  $scope.enter();
}


function PeerViewController($scope, BMA) {
  'ngInject';

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!$scope.memberUidsByPubkeys) {
      BMA.wot.member.uids()
        .then(function(uids){
          $scope.memberUidsByPubkeys = uids;
          $scope.showPeer(state.stateParams.server);
        });
    }
    else {
      $scope.showPeer(state.stateParams.server);
    }
  });

  $scope.showPeer = function(server) {
    var serverParts = server.split(':');
    if (serverParts.length == 2) {
      $scope.node = BMA.lightInstance(serverParts[0], serverParts[1]);
    }
    else {
      $scope.node = BMA.lightInstance(server);
    }
    // Get the peers
    $scope.node.network.peers()
      .then(function(json){
        $scope.loaded = true;
        var peers = json.peers.map(function(p) {
          var peer = new Peer(p);
          peer.online = p.status == 'UP';
          peer.blockNumber = peer.block.replace(/-.+$/, '');
          peer.dns = peer.getDns();
          peer.uid = $scope.memberUidsByPubkeys[peer.pubkey];
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
