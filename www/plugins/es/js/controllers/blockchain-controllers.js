
angular.module('cesium.es.blockchain.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.lookup_blocks_currency', {
        url: "/currencies/:currency/blocks?q",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/blockchain/lookup.html",
            controller: 'ESBlockLookupCtrl'
          }
        }
      })

      .state('app.blockchain_search', {
        url: "/blockchain/search?q&type",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/blockchain/lookup.html",
            controller: 'ESBlockLookupCtrl'
          }
        }
      })
    ;
  })

  .controller('ESBlockLookupCtrl', ESBlockLookupController)
;


function ESBlockLookupController($scope, $state, $controller, $ionicPopover, UIUtils, esBlockchain, $ionicHistory) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('BlockLookupCtrl', {$scope: $scope}));

  $scope.search.text = null;
  $scope.search.type = 'last';
  $scope.search.sort = undefined;
  $scope.search.asc = true;
  $scope.searchTextId = 'blockchainSearchText';
  $scope.compactMode = true;
  $scope.enableFilter = true;

  $scope.doSearchText = function() {
    if (!$scope.search.text || $scope.search.text.trim().length === 0) {
      return $scope.doSearchLast();
    }

    $scope.search.type = 'text';
    $scope.doSearch();

    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });
    $state.go('app.blockchain_search', {q: $scope.search.text}, {
      reload: false,
      inherit: true,
      notify: false});
  };

  $scope.doSearchLast = function() {
    $scope.hideActionsPopover();

    $scope.search.type = 'last';
    $scope.search.sort = undefined;
    $scope.doSearch();

    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });
    $state.go('app.blockchain_search', {q: undefined}, {
      reload: false,
      inherit: true,
      notify: false});
  };

  // This method override the base class method
  $scope.doSearch = function(from) {
    from = angular.isDefined(from) ? from : 0;
    var promise;
    var request = {};

    $scope.search.loading = (from === 0);
    request.size = $scope.defaultSizeLimit;

    // last block
    if ($scope.search.type == 'last') {
      // Add '+1' to skip the indexed block with _id='current'
      request.from = (from === 0) ? 0 : from+1;
      // add sort
      if ($scope.search.sort) {
        request.sort = {};
        request.sort[$scope.search.sort] = !$scope.search.asc ? "desc" : "asc";
      }
      else { // default sort
        request.sort = {
          "number": "desc"
        };
      }
      request.excludeCurrent = true;
      promise = esBlockchain.block.search($scope.currency, request);
    }

    // Full text search
    else if ($scope.search.type == 'text') {

      request.from = from;

      // add sort
      if ($scope.search.sort) {
        request.sort = $scope.search.sort + ':' + (!$scope.search.asc ? "desc" : "asc");
      }
      else { // default sort
        request.sort = "number:desc";
      }
      request.excludeCurrent = true;
      promise = esBlockchain.block.searchText($scope.currency, $scope.search.text, request);
    }

    var time = new Date().getTime();
    return promise
      .then(function(result) {
        return $scope.doPrepareResult(result.hits)
          .then(function() {
            // remove 'name' if
            return result;
          });
      })
      .then(function(result) {
        $scope.showPubkey = ($scope.search.sort == 'issuer');
        $scope.search.took = (new Date().getTime() - time);
        $scope.doDisplayResult(result.hits, from, result.total);
        $scope.search.loading = false;
      })
      .catch(function(err) {
        UIUtils.onError('BLOCKCHAIN.ERROR.SEARCH_BLOCKS_FAILED')(err);
        $scope.search.loading = false;
      });
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
    $scope.doSearch();
  };

  $scope.showHelpTip = function() {

  };

  /* -- popups -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/blockchain/lookup_popover_actions.html', {
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
}

