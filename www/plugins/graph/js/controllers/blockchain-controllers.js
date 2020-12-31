
angular.module('cesium.graph.blockchain.controllers', ['chart.js', 'cesium.services', 'cesium.graph.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.blockchain_stats', {
        url: "/blockchain/stats?currency&stepUnit&t&hide&scale",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/blockchain/view_stats.html"
          }
        }
      })

      .state('app.currency_blockchain_stats', {
        url: "/:currency/blockchain/stats",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/blockchain/view_stats.html"
          }
        }
      })
    ;
  })

  .controller('GpBlockchainTxCountCtrl', GpBlockchainTxCountController)
  .controller('GpBlockchainIssuersCtrl', GpBlockchainIssuersController)
;


function GpBlockchainTxCountController($scope, $controller, $q, $state, $filter, $translate, gpData, gpColor) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.displayRightAxis = true;

  $scope.init = function(e, state) {
    if (state && state.stateParams) {

      // get the pubkey
      if (!$scope.formData.issuer && state && state.stateParams && state.stateParams.pubkey) { // Currency parameter
        $scope.formData.issuer = state.stateParams.pubkey;
      }
    }
  };

  $scope.load = function(updateTimePct) {

    var formData = $scope.formData;

    return $q.all([

      $translate($scope.formData.issuer?
        'GRAPH.BLOCKCHAIN.TX_AMOUNT_PUBKEY_TITLE':
        'GRAPH.BLOCKCHAIN.TX_AMOUNT_TITLE', formData),

      // translate i18n keys
      $translate(['GRAPH.BLOCKCHAIN.TX_AMOUNT_LABEL',
        'GRAPH.BLOCKCHAIN.TX_COUNT_LABEL',
        'GRAPH.BLOCKCHAIN.TX_AVG_BY_BLOCK',
        'COMMON.DATE_PATTERN',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),

      // get data
      gpData.blockchain.txCount($scope.formData.currency, formData)
    ])
      .then(function(result) {

        var title = result[0];

        var translations = result[1];
        var datePatterns = {
          hour: translations['COMMON.DATE_PATTERN'],
          day: translations['COMMON.DATE_SHORT_PATTERN'],
          month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
        };

        result = result[2];

        if (!result || !result.times) return; // no data
        $scope.times = result.times;

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data
        if ($scope.formData.rangeDuration !== 'hour') {
          $scope.data = [
            result.amount,
            result.count
          ];
        }
        else {
          $scope.data = [
            result.amount,
            result.count
          ];
        }

        // Labels
        var labelPattern = datePatterns[$scope.formData.rangeDuration];
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(moment.unix(time).local().format(labelPattern));
        }, []);

        // Colors
        $scope.colors = gpColor.scale.fix(result.times.length);

        // Update range options with received values
        $scope.updateRange(result.times[0], result.times[result.times.length-1], updateTimePct);

        // Options
        $scope.options = {
          responsive: true,
          maintainAspectRatio: true,
          title: {
            display: true,
            text: title
          },
          scales: {
            yAxes: [
              {
                id: 'y-axis-amount',
                position: 'left'
              },
              {
                id: 'y-axis-count',
                display: $scope.displayRightAxis,
                position: 'right',
                gridLines: {
                  drawOnChartArea: false
                }
              }
            ]
          },
          legend: {
            display: $scope.displayRightAxis,
            onClick: $scope.onLegendClick
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                if (tooltipItems.datasetIndex === 0) {
                  return data.datasets[tooltipItems.datasetIndex].label +
                    ': ' + formatAmount(tooltipItems.yLabel) +
                    ' ' + $scope.currencySymbol;
                }
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' + tooltipItems.yLabel;
              }
            }
          }
        };

        // Override dataset config
        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-amount',
            type: 'bar',
            label: translations['GRAPH.BLOCKCHAIN.TX_AMOUNT_LABEL'],
            hoverBackgroundColor: gpColor.rgba.calm(0.6)
          },
          {
            yAxisID: 'y-axis-count',
            type: 'line',
            label: translations['GRAPH.BLOCKCHAIN.TX_COUNT_LABEL'],
            fill: false,
            borderColor: gpColor.rgba.gray(0.5),
            borderWidth: 2,
            backgroundColor: gpColor.rgba.gray(0.5),
            pointBackgroundColor: gpColor.rgba.gray(0.5),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.gray(1),
            pointHoverBorderColor: gpColor.rgba.translucent(),
            pointRadius: 3
          }
        ];
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();
    var query = '_exists_:transactions AND medianTime:>={0} AND medianTime:<{1}'.format(from, to);
    if ($scope.formData.issuer) {
      query += ' AND issuer:' + $scope.formData.issuer;
    }
    $state.go('app.blockchain_search', {q: query});
  };

}


function GpBlockchainIssuersController($scope, $controller, $q, $state, $translate, gpColor, gpData) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  // Change defaults
  $scope.formData.maxAge = 'day';
  $scope.computeStartTimeByAge();

  $scope.load = function() {

    return $q.all([
      $translate([
        'GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_TITLE',
        'GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_LABEL'
      ]),
      gpData.blockchain.countByIssuer($scope.formData.currency, {startTime: $scope.formData.startTime})
    ])
      .then(function(result) {
        var translations =  result[0];
        result = result[1];
        if (!result || !result.data) return;

        // Data
        $scope.data = result.data;

        // Labels
        $scope.labels = result.labels;

        // Data to keep (for click or label)
        $scope.blockCount = result.blockCount;
        $scope.issuers = result.issuers;

        // Options
        $scope.barOptions = {
          responsive: true,
          maintainAspectRatio: $scope.maintainAspectRatio,
          title: {
            display: true,
            text: translations['GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_TITLE']
          },
          scales: {
            yAxes: [{
              type: 'linear',
              ticks: {
                beginAtZero: true
              }
            }]
          }
        };

        // Colors
        $scope.colors = gpColor.scale.custom(result.data.length);

      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var issuer = $scope.issuers[item._index];
    $state.go('app.wot_identity', issuer);
  };
}
