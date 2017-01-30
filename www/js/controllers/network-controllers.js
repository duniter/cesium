
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

     .state('app.network', {
      url: "/network?type",
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
          controller: 'PeerCtrl'
        }
      }
    });
})

.controller('NetworkLookupCtrl', NetworkLookupController)

.controller('PeerCtrl', PeerController)

.controller('NetworkLookupModalCtrl', NetworkLookupModalController)

;

function NetworkLookupController($scope, $timeout, $state, $ionicHistory, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  'ngInject';

  $scope.networkStarted = false;
  $scope.ionItemClass = '';
  $scope.expertMode = csSettings.data.expertMode && !UIUtils.screen.isSmall();
  $scope.search = {
    text: '',
    loading: true,
    type: undefined,
    results: [],
    endpointFilter: null,
    sort : undefined,
    asc: true
  };
  $scope.mainBlock = {};

  /**
   * Enter in view
   */
  $scope.enter = function(e, state) {
    if ($scope.networkStarted) return;
    $scope.networkStarted = true;
    csCurrency.default()
      .then(function (currency) {
        if (currency) {
          $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
            BMA.instance(currency.peer.host, currency.peer.port) : BMA;
          if (state && state.stateParams && state.stateParams.type) {
            $scope.search.type = state.stateParams.type;
          }
          $scope.load();
        }
      })
      .catch(function(err) {
        UIUtils.onError('ERROR.GET_CURRENCY_FAILED')(err);
        $scope.networkStarted = false;
      });

  };
  $scope.$on('$ionicView.enter', $scope.enter);
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
    console.log(options);
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
          $timeout(function() { // Timeout
            $scope.updateView(data);
            $scope.refreshing = false;
           }, 1100);
        }
      });

      csNetwork.api.data.on.mainBlockChanged($scope, function(mainBlock){
        $scope.mainBlock = mainBlock;
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
    csNetwork.sort($scope.computeOptions());
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
      $scope.sort();
      return;
    }
    else {
      $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
      $scope.search.sort = sort;
      $scope.sort();
    }
  };

  $scope.selectPeer = function(peer) {
    $state.go('app.view_peer', {server: peer.server});
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


function NetworkLookupModalController($scope, $timeout, $state, $ionicHistory, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork, parameters) {
  'ngInject';

  NetworkLookupController.call(this, $scope, $timeout, $state, $ionicHistory, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork);

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
