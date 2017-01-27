
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.view_network', {
      url: "/network",
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_network.html",
          controller: 'NetworkLookupCtrl'
        }
      }
    })

    .state('app.view_peer', {
      url: "/network/peer/:server",
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_peer.html",
          controller: 'PeerCtrl'
        }
      }
    });
})

.controller('NetworkLookupCtrl', NetworkLookupController)

.controller('PeerCtrl', PeerController)

.controller('NetworkLookupModalCtrl', NetworkLookupModalController)

;

function NetworkLookupController($scope, $timeout, $state, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  'ngInject';

  $scope.ionItemClass = '';
  $scope.search = {
    text: '',
    loading: true,
    type: undefined,
    results: [],
    endpointFilter: null,
    sort : 'uid',
    asc: true
  };

  $scope.init = function() {
    csCurrency.default()
      .then(function (currency) {
        if (currency) {
          $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
            BMA.instance(currency.peer.host, currency.peer.port) : BMA;
          $scope.load();
        }
      })
      .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    $scope.init();
  });
  $scope.$on('$ionicView.beforeLeave', function(){
    csNetwork.close();
  });

  $scope.$on('$ionicParentView.enter', function(e, state) {
    $scope.init();
  });

  $scope.$on('$ionicParentView.beforeLeave', function(){
    csNetwork.close();
  });

  $scope.load = function() {

    if ($scope.search.loading){
      csNetwork.start($scope.node, {
        filter: {
          member: (!$scope.search.type || $scope.search.type === 'member'),
          mirror: (!$scope.search.type || $scope.search.type === 'mirror'),
          endpointFilter : (angular.isDefined($scope.search.endpointFilter) ? $scope.search.endpointFilter : null)
        },
        sort: {
          type : $scope.search.sort,
          asc : $scope.search.asc
        }
      });

      // Catch event on new peers
      $scope.refreshing = false;
      csNetwork.api.data.on.changed($scope, function(data){
        if (!$scope.refreshing) {
          $scope.refreshing = true;
          $timeout(function() { // Timeout
            $scope.updateView(data);
            $scope.refreshing = false;
           }, 1100);
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
    $scope.search.loading = csNetwork.isBusy();
  };

  $scope.refresh = function() {
    // Network
    $scope.search.loading = true;
    csNetwork.loadPeers();
  };

  $scope.sort = function() {
    $scope.search.loading = true;
    $scope.refreshing = true;
    csNetwork.sort({
      filter: {
        member: (!$scope.search.type || $scope.search.type === 'member'),
        mirror: (!$scope.search.type || $scope.search.type === 'mirror'),
        endpointFilter : (angular.isDefined($scope.search.endpointFilter) ? $scope.search.endpointFilter : null)
      },
      sort: {
        type : $scope.search.sort,
        asc : $scope.search.asc
      }
    });
    $scope.updateView(csNetwork.data);
  };

  $scope.toggleSearchType = function(type){
    $scope.hideActionsPopover();
    if ($scope.search.type === type || type === 'none') {
      $scope.search.type = false;
    }
    else {
      $scope.search.type = type;
    }
    csNetwork.close();
    $scope.search.loading = true;
    $scope.load();

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
    $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
    $scope.search.sort = sort;
    $scope.sort();
  };

  $scope.selectPeer = function(peer) {
    $state.go('app.view_peer', {server: peer.server});
  };

  $scope.$on('NetworkLookupCtrl.action', function(event, action) {
    if (action == 'refresh') {
      $scope.refresh();
    }
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


function NetworkLookupModalController($scope, $timeout, $state, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork, parameters) {
  'ngInject';

  NetworkLookupController.call(this, $scope, $timeout, $state, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork);

  // Read parameters
  parameters = parameters || {};
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : true;
  $scope.search.type = angular.isDefined(parameters.type) ? parameters.type : $scope.search.type;
  $scope.search.endpointFilter = angular.isDefined(parameters.endpointFilter) ? parameters.endpointFilter : $scope.search.endpointFilter;

  $scope.ionItemClass = parameters.ionItemClass || 'item-border-large';

  $scope.selectPeer = function(peer) {
    $scope.closeModal(peer);
  };

  $scope.$on('modal.hidden', function(){
    csNetwork.close();
  });

  // Disable this unsed method - called by load()
  $scope.showHelpTip = function() {};

  // Init
  $scope.init();
}
