
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

      .state('app.lookup_blocks', {
        url: "/blocks?q",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/blockchain/lookup.html",
            controller: 'ESBlockLookupCtrl'
          }
        }
      });
  })


  .controller('ESBlockLookupCtrl', ESBlockLookupController)

;


function ESBlockLookupController($scope, $scope, $timeout, $focus, $filter, $state, $anchorScroll, UIUtils, BMA, csCurrency, csWot, esBlockchain) {
  'ngInject';

  BlockLookupController.call(this, $scope, $timeout, $focus, $filter, $state, $anchorScroll, UIUtils, BMA, csCurrency, csWot);

  $scope.searchTextId = 'blockchainSearchText';
  $scope.compactMode = true;

  $scope.doSearchText = function() {
    if (!$scope.search.text || $scope.search.text.trim().length === 0) {
      return $scope.doSearchLast();
    }

    $scope.search.type = 'text';
    return $scope.doSearch();
  };

  $scope.doSearch = function(from) {
    var promise;
    var request = {
      _source: '*' // TODO : faire mieux ?
    };
    request.from= from || 0;
    request.size= $scope.defaultSizeLimit;

    $scope.search.loading = (from === 0);

    // last block
    if ($scope.search.type == 'last') {
      request.sort = {
          "number" : !$scope.search.sort ? "desc" : "asc"
        };
      //request._source = ['number', 'hash', 'medianTime', 'issuer'];
      promise = esBlockchain.block.search($scope.currency, request);
    }

    // Full text search
    else if ($scope.search.type == 'text') {
      promise = esBlockchain.block.searchText($scope.currency, $scope.search.text, request);
    }

    return promise
      .then(function(result) {
        $scope.doPrepareResult(result.hits);
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
}
