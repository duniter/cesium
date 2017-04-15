
angular.module('cesium.graph.blockchain.controllers', ['chart.js', 'cesium.services', 'cesium.graph.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.blockchain_stats', {
        url: "/blockchain/stats?currency",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/blockchain/view_stats.html",
            controller: 'GpBlockchainCtrl'
          }
        }
      })

      .state('app.currency_blockchain_stats', {
        url: "/:currency/blockchain/stats",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/blockchain/view_stats.html",
            controller: 'GpBlockchainCtrl'
          }
        }
      })
    ;

  })

  .controller('GpBlockchainCtrl', GpBlockchainController)
;


function GpBlockchainController($scope, $q, $state, $translate, csCurrency, gpData, $filter) {
  'ngInject';

  $scope.loading = true;
  $scope.blocksByIssuer = {};

  $scope.enter = function(e, state) {
    if ($scope.loading) {

      if (state && state.stateParams && state.stateParams.currency) { // Currency parameter
        $scope.currency = state.stateParams.currency;
      }

      // Make sure there is currency, or load it not
      if (!$scope.currency) {
        return csCurrency.default()
          .then(function(currency) {
            $scope.currency = currency ? currency.name : null;
            return $scope.enter(e, state);
          });
      }

      $scope.load();
    }

  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function() {

    return $q.all([
      $scope.loadBlocksByIssuer()
        .then(function(res) {
          $scope.blocksByIssuer = res;
        })
      /*, $scope.loadMonetaryMass()
        .then(function(res) {
          $scope.monetaryMass = res;
        })*/
      ])
      .then(function() {
        $scope.loading = false;
      });

  };

  $scope.loadBlocksByIssuer = function() {
    return gpData.blockchain.countByIssuer($scope.currency)
      .then(function(result) {
        if (!result || !result.data) return;

        // Block by issuer
        result.bar = {
          options: {
            title: {
              display: true
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero:true
                }
              }]
            }
          }
        };

        // Compute color
        if (result.data.length) {
          result.colors = gpData.util.colors.custom(result.data.length);
        }

        // Compute graph title
        return $translate('GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_TITLE', {
          issuerCount: result.data.length,
          blockCount: result.blockCount
        })
          .then(function(title) {
          result.bar.options.title.text = title;
          return result;
        });
      });

  };
/*
  $scope.loadMonetaryMass = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return gpData.block.monetaryMass($scope.currency, {
      from: from,
      size: size
    })
      .then(function(result) {

        if (!result || !result.data) return;

        // Block by issuer
        result.line = {
          options: {
            title: {
              display: true
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero:true
                }
              }]
            }
          }
        };

        // Format time
        var formDateFilter = $filter('formatDateShort');
        result.labels = result.labels.reduce(function(res, time) {
          return res.concat(formDateFilter(time));
        }, []);

        // Compute color
        if (result.data.length) {
          result.colors = gpData.util.colors.custom(result.data.length);
        }

        // Compute graph title
        return $translate('GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_TITLE', {
          issuerCount: result.data.length,
          blockCount: result.blockCount
        })
          .then(function(title) {
            result.line.options.title.text = title;
            return result;
          });
      });

  };*/

  $scope.showBlockIssuer = function(data, e, item) {
    if (!item) return
    var issuer = $scope.blocksByIssuer.issuers[item._index];
    $state.go('app.wot_identity', issuer);
  };

  /* -- popups -- */



}

