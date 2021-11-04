
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
        },
        data: {
          silentLocationChange: true
        }
      })
    ;
  })

  .controller('ESBlockLookupCtrl', ESBlockLookupController)
;


function ESBlockLookupController($scope, $controller, $ionicPopover, $location, UIUtils, esBlockchain) {
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
    if ((!$scope.search.text || !$scope.search.text.trim().length) &&
      (!$scope.search.filters || !$scope.search.filters.length) ) {
      return $scope.doSearchLast();
    }

    $scope.search.type = 'text';

    $scope.doSearch();

    // Update location href
    $location.search({q: $scope.search.query}).replace();
  };

  $scope.doSearchLast = function() {
    $scope.hideActionsPopover();

    $scope.search.type = 'last';
    $scope.search.sort = undefined;
    $scope.doSearch();

    $location.search({q: undefined}).replace();
  };


  // This method override the base class method
  $scope.doSearch = function(from) {
    if ($scope.search.error) return;

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
      request.excludeCurrent = (from === 0);

      promise = esBlockchain.block.search($scope.currency, request);
    }

    // Full text search
    else if ($scope.search.type == 'text') {

      // Parse text search into filters array
      var res = esBlockchain.block.parseSearchText($scope.search.text, $scope.search.filters);
      $scope.search.filters = res.filters;
      var query = $scope.search.filters.reduce(function(query, filter){
        return query + ' AND ' + filter.text;
      }, '');
      if (res.text.length) {
        query += ' AND ' + res.text;
      }

      $scope.search.query = query.substr(5);
      $scope.search.text = res.text;

      request.from = from;

      // add sort
      if ($scope.search.sort) {
        request.sort = $scope.search.sort + ':' + (!$scope.search.asc ? "desc" : "asc");
      }
      else { // default sort
        request.sort = "number:desc";
      }
      request.excludeCurrent = true;

      promise = esBlockchain.block.searchText($scope.currency, $scope.search.query, request);
    }

    var now = Date.now();
    return promise
      .then(function(result) {
        // Apply transformation need by UI (e.g add avatar and name...)
        return $scope.doPrepareResult(result.hits)
          .then(function() {
            return result;
          });
      })
      .then(function(result) {
        $scope.showPubkey = ($scope.search.sort == 'issuer');
        // Compute time only once (on first page)
        $scope.search.took = (from === 0) ? (Date.now() - now) : $scope.search.took;
        // Keep previous total, when already computed (because of current, that is excluded only in the first page)
        var total = (from === 0) ? result.total : $scope.search.total;
        $scope.doDisplayResult(result.hits, from, total);
        $scope.search.loading = false;
      })
      .catch(function(err) {
        $scope.search.error = true;
        $scope.search.loading = false;
        UIUtils.onError('BLOCKCHAIN.ERROR.SEARCH_BLOCKS_FAILED')(err)
          .then(function() {
            $scope.search.error = false;
          });
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
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/es/templates/blockchain/lookup_popover_actions.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
  };

  /* -- manage click -- */


  // Cancel search filter
  $scope.itemRemove = function(index) {
    $scope.search.filters.splice(index, 1);
    $scope.doSearchText();
  };

  //Show the query
  $scope.toggleShowQuery = function() {
    $scope.showQuery = !$scope.showQuery;
  };
}

