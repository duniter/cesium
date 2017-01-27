
angular.module('cesium.blockchain.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.view_currency_block_hash', {
        url: "/:currency/block/:number/:hash",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      })

      .state('app.view_block', {
        url: "/block/:number",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      })

      .state('app.view_block_hash', {
        url: "/block/:number/:hash",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      });
  })

  .controller('BlockViewCtrl', BlockViewController)

;

function BlockViewController($scope, UIUtils, BMA, csCurrency) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};

  /**
   * Enter on view
   */
  $scope.enter = function(e, state) {
    if (!$scope.loading) return; // call once

    $scope.currency = state && state.stateParams ? state.stateParams.currency : undefined;
    $scope.number = state && state.stateParams && angular.isDefined(state.stateParams.number) ? state.stateParams.number : 'current';
    $scope.hash = state && state.stateParams && state.stateParams.hash ? state.stateParams.hash : undefined;

    if (!$scope.currency) {
      csCurrency.default()
        .then(function (currency) {
          if (currency) {
            $scope.currency = currency.name;
            $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
              BMA.instance(currency.peer.host, currency.peer.port) : BMA;
            $scope.load();
          }
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
    }
    else {
      $scope.node = BMA;
      $scope.load();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  /**
   * Leave the view
   */
  $scope.leave = function() {

  };
  $scope.$on('$ionicParentView.beforeLeave', $scope.leave);

  $scope.load = function() {
    if (!$scope.number) return;

    var promise = $scope.number == 'current' ?
      $scope.node.blockchain.current() :
      $scope.node.blockchain.block({block: $scope.number});

    return promise
      .then(function(block) {
        if (!block || !angular.isDefined(block.number) || !block.hash) {
          $scope.loading = false;
          UIUtils.alert.error('ERROR.GET_BLOCK_FAILED');
          return;
        }
        if ($scope.hash && block.hash != $scope.hash) {
          $scope.loading = false;
          UIUtils.alert.error('ERROR.INVALID_BLOCK_HASH');
          return;
        }

        console.log(block);
        angular.copy(block, $scope.formData);
        $scope.loading = false;
      })
      .catch(UIUtils.onError('ERROR.GET_BLOCK_FAILED'));
  };

  /* -- popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/blockchain/block_popover_actions.html', {
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
    index = csSettings.data.helptip.block;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    /*return helptipScope.startBlockTour(index, false)
     .then(function(endIndex) {
     helptipScope.$destroy();
     csSettings.data.helptip.block = endIndex;
     csSettings.store();
     });*/
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
