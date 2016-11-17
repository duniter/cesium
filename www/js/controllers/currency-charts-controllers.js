
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

function CurrencyUdController($scope, BMA, $q, csHttp) {
  'ngInject';

  $scope.$on('$ionicView.enter', function() {
      $scope.loadUds()
      .then(function (res) {
        // TODO: plot
        console.log(res);
      });
    });

  $scope.loadUds = function() {
    var request = {
        query: {
          /*TODO */
        },
        from: 0,
        size: 10000,
        sort: "number"
        _source: ['number','dividend','medianTime']
      };

    var httpPost = csHttp.post('localhost', '9200', '/test_net/block/_search?pretty');
    return httpPost(request)
    .then(function (res) {
      console.log(res);
      // TODO transform data into array (X, Y, etc.)
      return res;
    });
  };

}
