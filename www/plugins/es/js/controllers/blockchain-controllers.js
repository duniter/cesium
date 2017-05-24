
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

  $scope.activeLookupPeriod=false;
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

  // Cancel search filter
  $scope.itemRemove = function(itemType) {
    if(itemType === $scope.dynamicSearchFilter[0][0])
      $scope.dynamicSearchFilter[0][3] = false;
    else if(itemType === $scope.dynamicSearchFilter[1][0])
      $scope.dynamicSearchFilter[0][3] = false;
    $scope.newQuery = $scope.query.replace(itemType, '');
    $scope.newQuery = $scope.newQuery.replace(/^ AND /, '');
    $scope.newQuery = $scope.newQuery.replace(/ AND $/, '');
    $scope.search.text = $scope.newQuery;
    $scope.doSearchText();
  };


  $scope.filterConstructor = function() {

    $scope.dynamicSearchFilter = new Array(2);

    for (var i = 0; i < $scope.dynamicSearchFilter.length; i++) {
      $scope.dynamicSearchFilter[i] = new Array(5)
    }

    /*
              +-----------+--------+
              | period    | pubkey |
     +--------+-----------+--------+
     | regex  |           |        |
     +--------+-----------+--------+
     | query  |           |        |
     +--------+-----------+--------+
     | key    |           |        |
     +--------+-----------+--------+
     | params | startDate | pubkey |
     +--------+-----------+--------+
     |        | endDate   |        |
     +--------+-----------+--------+
     */

    //Period
    $scope.dynamicSearchFilter[0][0] = /_exists_:transactions AND medianTime:>=([0-9]+) AND medianTime:<([0-9]+)/;
    var matches = $scope.search.text.match($scope.dynamicSearchFilter[0][0]);
    if (matches){
      $scope.dynamicSearchFilter[0][1] = matches[0];
      $scope.dynamicSearchFilter[0][2] = 'TX_SEARCH.PERIOD';
      $scope.dynamicSearchFilter[0][3] = true;
      $scope.dynamicSearchFilter[0][4] = matches[1];
      $scope.dynamicSearchFilter[0][5] = matches[2];
    }
    //Pubkey
    $scope.dynamicSearchFilter[1][0] = /issuer:([a-zA-Z0-9]+)/;
    var matches = $scope.search.text.match($scope.dynamicSearchFilter[1][0]);
    if (matches){
      $scope.dynamicSearchFilter[1][1] = matches[0];
      $scope.dynamicSearchFilter[1][2] = 'TX_SEARCH.PUBKEY';
      $scope.dynamicSearchFilter[1][3] = true;
      $scope.dynamicSearchFilter[1][4] = matches[1];
    }
    $scope.params ={
      date : {
        startDate : $scope.dynamicSearchFilter[0][4],
        endDate : $scope.dynamicSearchFilter[0][5]
      },
      pubkey: $scope.dynamicSearchFilter[1][4]
    }
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
      request.excludeCurrent = (from === 0);

      $scope.filterConstructor();

      promise = esBlockchain.block.search($scope.currency, request);
      $scope.query = $scope.search.text;
      $scope.search.text = null;
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

      $scope.filterConstructor();

      promise = esBlockchain.block.searchText($scope.currency, $scope.search.text, request);
      $scope.query = $scope.search.text;
      $scope.search.text = null;
    }

    var time = new Date().getTime();
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
        $scope.search.took = (from === 0) ? (new Date().getTime() - time) : $scope.search.took;
        // Keep previous total, when already computed (because of current, that is excluded only in the first page)
        var total = (from === 0) ? result.total : $scope.search.total;
        $scope.doDisplayResult(result.hits, from, total);
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

