
angular.module('cesium.currency-charts.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.currency_ud', {
      url: "/currency/ud",
      nativeTransitions: {
          "type": "flip",
          "direction": "up"
      },
      views: {
        'menuContent': {
          templateUrl: "templates/currency/charts/ud.html",
          controller: 'CurrencyUdCtrl'
        }
      }
    })
    ;
})

.controller('CurrencyUdCtrl', CurrencyUdController)

;

function CurrencyUdController($scope, BMA, $q) {
  'ngInject';

  $scope.$on('$ionicView.enter', function() {
      $scope.loadUds()
      .then(function (dataXY) {
        // TODO: plot
      });
    });

  $scope.loadUds = function() {
    return $q(function(resolve, reject) {
      BMA.blockchain.stats.ud()
      .then(function (res) {
        if (res.result.blocks.length) {
          var uds = [];
          var blockRequests = [];
          res.result.blocks.forEach(function(number) {
            blockRequests.push(
              BMA.blockchain.block({ block: number })
              .then(function(block){
                uds.push({
                  number: block.number,
                  dividend: block.dividend,
                  medianTime: block.medianTime
                });
              })
            );
          });
          $q.all(blockRequests)
          .then(function() {
            _.sortBy(uds, function(b){return b.number;});
            var x = uds.reduce(function(values, block) {
              return values.concat(block.medianTime);
            }, []);
            var y = uds.reduce(function(values, block) {
              return values.concat(block.dividend);
            }, []);
            resolve({x: x, y: y});
          });
        }
        else {
          resolve([]);
        }
      });
    });
  };

}
