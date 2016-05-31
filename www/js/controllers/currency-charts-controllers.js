
angular.module('cesium.currency-charts.controllers', ['cesium.services'])

.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider

    .state('app.currency_ud', {
      url: "/currency/ud",
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

  $scope.$on('$ionicView.enter', function(e, $state) {
      $scope.loadUds()
      .then(function (uds) {
        if (uds.length) {
          // alert
          var x = uds.reduce(function(values, block) {
            return values.concat(block.medianTime);
          }, []);
          var y = uds.reduce(function(values, block) {
            return values.concat(block.dividend);
          }, []);

          $scope.acData.data.x = x;
          $scope.acData.data.y = y;
        }
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
            _.sortBy(uds, function(b){return b.number});
            resolve(uds);
          })
        }
        else {
          resolve([]);
        }
      });
    });
  }

    $scope.acData = {
             series: ["UD"],
             data: [{
               x: "Computers",
               y: [54, 0, 879],
               tooltip: "This is a tooltip"
             }]
           };
    $scope.chartType ='line';
    $scope.config = {
            title: '', // chart title. If this is false, no title element will be created.
            tooltips: true,
            labels: false, // labels on data points
            // exposed events
            mouseover: function() {},
            mouseout: function() {},
            click: function() {},
            // legend config
            legend: {
              display: true, // can be either 'left' or 'right'.
              position: 'left',
              // you can have html in series name
              htmlEnabled: false
            },
            // override this array if you're not happy with default colors
            colors: [],
            innerRadius: 0, // Only on pie Charts
            lineLegend: 'lineEnd', // Only on line Charts
            lineCurveType: 'cardinal', // change this as per d3 guidelines to avoid smoothline
            isAnimate: true, // run animations while rendering chart
            yAxisTickFormat: 's', //refer tickFormats in d3 to edit this value
            xAxisMaxTicks: 7, // Optional: maximum number of X axis ticks to show if data points exceed this number
            yAxisTickFormat: 's', // refer tickFormats in d3 to edit this value
            waitForHeightAndWidth: false // if true, it will not throw an error when the height or width are not defined (e.g. while creating a modal form), and it will be keep watching for valid height and width values
          };
}
