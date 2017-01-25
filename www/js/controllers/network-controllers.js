
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.view_peer', {
      url: "/network/peer/:server",
      nativeTransitions: {
          "type": "flip",
          "direction": "right"
      },
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
    results: [],
    endpoint: null,
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
          endpoint : (angular.isDefined($scope.search.endpoint) ? $scope.search.endpoint : null)
        },
        sort: {
          type : $scope.search.sort,
          asc : $scope.search.asc
        }
      });

      // Catch event on new peers
      var refreshing = false;
      csNetwork.api.data.on.changed($scope, function(data){
        if (!refreshing) {
          refreshing = true;
          $timeout(function() { // Timeout avoid to quick updates
            console.debug("[peers] Updating UI");
            $scope.search.results = data.peers;
            $scope.search.memberPeersCount = data.memberPeersCount;
            $scope.search.loading = csNetwork.isBusy();
            refreshing = false;
           }, 1100);
        }
      });
    }

    // Show help tip
    $scope.showHelpTip();
  };

  $scope.refresh = function() {
    // Network
    $scope.search.loading = true;
    csNetwork.loadPeers();
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
    if ($scope.search.endpoint === endpoint || endpoint === null) {
      $scope.search.endpoint = null;
    }
    else {
      $scope.search.endpoint = endpoint;
    }
    csNetwork.close();
    $scope.search.loading = true;
    $scope.load();
  };

  $scope.toggleSort = function(sort){
    $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
    $scope.search.sort = sort;

    csNetwork.close();
    $scope.search.loading = true;
    $scope.load();
  };

  $scope.selectPeer = function(peer) {
    $state.go('app.view_peer', {server: peer.server});
  };

  $scope.$on('NetworkLookupCtrl.action', function(event, action) {
    if (action === 'refresh') {
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
