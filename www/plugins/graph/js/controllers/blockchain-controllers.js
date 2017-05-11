
angular.module('cesium.graph.blockchain.controllers', ['chart.js', 'cesium.services', 'cesium.graph.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.blockchain_stats', {
        url: "/blockchain/stats?currency",
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


function GpBlockchainTxCountController($scope, $q, $state, $filter, $translate, $ionicPopover, csCurrency, BMA, esHttp, gpData) {
  'ngInject';

  $scope.loading = true;
  $scope.height=undefined;
  $scope.width=undefined;
  $scope.formData = {
    timePct: 100,
    useRelative: false /*csSettings.data.useRelative*/
  };

  // Default TX range duration
  $scope.txOptions = {
    rangeDuration: 'day'
  };

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

      $scope.load()
        .then(function() {
          $scope.loading = false;
        });
    }
  };
  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.load = function(updateTimePct) {

    updateTimePct = angular.isDefined(updateTimePct) ? updateTimePct : true;

    var truncDate = function(time) {
      return moment.unix(time).utc().startOf($scope.txOptions.rangeDuration).unix();
    };

    var txOptions = $scope.txOptions;

    return $q.all([

      // translate i18n keys
      $translate(['GRAPH.BLOCKCHAIN.TX_AMOUNT_TITLE',
        'GRAPH.BLOCKCHAIN.TX_AMOUNT_LABEL',
        'GRAPH.BLOCKCHAIN.TX_COUNT_LABEL',
        'GRAPH.BLOCKCHAIN.TX_AVG_BY_BLOCK',
        'COMMON.DATE_PATTERN',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),

      // get block #0
      $scope.firstBlockTime ?
        $q.when({medianTime: $scope.firstBlockTime}) :
        BMA.blockchain.block({block: 0})
          .catch(function(err) {
            if (err && err.ucode == BMA.errorCodes.BLOCK_NOT_FOUND) {
              return {medianTime: esHttp.date.now()};
            }
          }),

      // get data
      gpData.blockchain.txCount($scope.currency, txOptions)
    ])
      .then(function(result) {
        var translations = result[0];
        $scope.firstBlockTime = $scope.firstBlockTime || result[1].medianTime;
        $scope.formData.firstBlockTime = $scope.formData.firstBlockTime || truncDate($scope.firstBlockTime);
        $scope.formData.currencyAge = truncDate(esHttp.date.now()) - $scope.formData.firstBlockTime;
        result = result[2];

        if (!result || !result.times) return; // no data
        $scope.times = result.times;

        var formatInteger = $filter('formatInteger');
        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.currency, false/*$scope.formData.useRelative*/);

        // Data
        if ($scope.txOptions.rangeDuration != 'hour') {
          $scope.data = [
            result.amount,
            result.count,
            result.avgByBlock
          ];
        }
        else {
          $scope.data = [
            result.amount,
            result.count
          ];
        }

        // Labels
        $scope.labels = result.labels;

        var displayFormats = {
          hour: translations['COMMON.DATE_PATTERN'],
          day: translations['COMMON.DATE_SHORT_PATTERN'],
          month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
        };
        var displayFormat = displayFormats[$scope.txOptions.rangeDuration];
        // Labels
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(moment.unix(time).local().format(displayFormat));
        }, []);

        // Colors
        $scope.colors = result.times.reduce(function(res) {
          return res.concat('rgba(17,193,243,0.5)');
        }, []);

        // Update options with received values
        $scope.txOptions.startTime = result.times[0];
        $scope.txOptions.endTime = result.times[result.times.length-1];
        $scope.formData.timeWindow = $scope.formData.timeWindow || $scope.txOptions.endTime - $scope.txOptions.startTime;
        $scope.formData.rangeDuration = $scope.formData.rangeDuration || $scope.formData.timeWindow / result.times.length;

        if (updateTimePct) {
          $scope.formData.timePct = Math.ceil(($scope.txOptions.startTime - $scope.formData.firstBlockTime) * 100 /
            ($scope.formData.currencyAge - $scope.formData.timeWindow));
        }

        // Options
        $scope.options = {
          responsive: true,
          maintainAspectRatio: true,
          title: {
            display: true,
            text: translations['GRAPH.BLOCKCHAIN.TX_AMOUNT_TITLE']
          },
          scales: {
            yAxes: [
              {
                id: 'y-axis-amount',
                type: 'linear',
                position: 'left',
                ticks: {
                  beginAtZero:true,
                  callback: function(value) {
                    return formatInteger(value);
                  }
                }
              },
              {
                id: 'y-axis-count',
                display: false,
                type: 'linear',
                position: 'right',
                ticks: {
                  beginAtZero:true
                }
              },
              {
                id: 'y-axis-avg',
                display: false,
                type: 'linear',
                position: 'right',
                ticks: {
                  beginAtZero:true
                }
              }
            ]
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

        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-amount',
            type: 'bar',
            label: translations['GRAPH.BLOCKCHAIN.TX_AMOUNT_LABEL'],
            hoverBackgroundColor: 'rgba(17,193,243,0.6)'
          },
          {
            yAxisID: 'y-axis-count',
            type: 'line',
            label: translations['GRAPH.BLOCKCHAIN.TX_COUNT_LABEL'],
            fill: false,
            borderColor: 'rgba(150,150,150,0.5)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(150,150,150,0.5)',
            pointBorderColor: 'rgba(255,255,255,1)',
            pointHoverBackgroundColor: 'rgba(150,150,150,1)',
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3
          },
          {
            yAxisID: 'y-axis-avg',
            type: 'line',
            label: translations['GRAPH.BLOCKCHAIN.TX_AVG_BY_BLOCK'],
            fill: false,
            showLine: false,
            borderColor: 'rgba(0,0,0,0)',
            pointBackgroundColor: 'rgba(0,0,0,0)',
            pointBorderColor: 'rgba(0,0,0,0)',
            pointHoverBackgroundColor: 'rgba(0,0,0,0)',
            pointHoverBorderColor: 'rgba(0,0,0,0)'
          }
        ];
      });
  };

  $scope.setSize = function(height, width, maintainAspectRatio) {
    $scope.height = height;
    $scope.width = width;
    $scope.maintainAspectRatio = angular.isDefined(maintainAspectRatio) ? maintainAspectRatio : $scope.maintainAspectRatio;
  };

  $scope.showTxRange = function(data, e, item) {
    if (!item) return
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.txOptions.rangeDuration).unix();
    $state.go('app.blockchain_search', {
      q: '_exists_:transactions AND medianTime:>={0} AND medianTime:<{1}'.format(from, to)
    });
  };

  $scope.setTxRangeDuration = function(txRangeDuration) {
    $scope.hideActionsPopover();
    if ($scope.txOptions && txRangeDuration == $scope.txOptions.rangeDuration) return;

    $scope.txOptions.rangeDuration = txRangeDuration;

    // Restore default values
    delete $scope.txOptions.startTime;
    delete $scope.txOptions.endTime;
    $scope.formData = {
      timePct: 100
    };

    // Reload TX data
    $scope.load();
  };

  $scope.loadPreviousTx = function() {
    $scope.txOptions.startTime -= $scope.times.length * $scope.formData.rangeDuration;
    if ($scope.txOptions.startTime < $scope.firstBlockTime) {
      $scope.txOptions.startTime = $scope.firstBlockTime;
    }
    $scope.txOptions.endTime = $scope.txOptions.startTime + $scope.times.length * $scope.formData.rangeDuration;
    // Reload TX data
    $scope.load();
  };

  $scope.loadNextTx = function() {
    $scope.txOptions.startTime += $scope.times.length * $scope.formData.rangeDuration;
    if ($scope.txOptions.startTime > $scope.firstBlockTime + $scope.formData.currencyAge - $scope.formData.timeWindow) {
      $scope.txOptions.startTime = $scope.firstBlockTime + $scope.formData.currencyAge - $scope.formData.timeWindow;
    }
    $scope.txOptions.endTime = $scope.txOptions.startTime + $scope.times.length * $scope.formData.rangeDuration;
    // Reload TX data
    $scope.load();
  };

  $scope.onTxTimeChanged = function() {
    $scope.txOptions.startTime = $scope.firstBlockTime + (parseFloat($scope.formData.timePct) / 100) * ($scope.formData.currencyAge - $scope.formData.timeWindow) ;
    $scope.txOptions.endTime = $scope.txOptions.startTime + $scope.times.length * $scope.formData.rangeDuration;

    // Reload TX data
    $scope.load(false);
  };

  /* -- Popover -- */

  $scope.showTxActionsPopover = function(event) {
    $scope.hideActionsPopover();
    $ionicPopover.fromTemplateUrl('plugins/graph/templates/blockchain/popover_tx_actions.html', {
      scope: $scope
    }).then(function(popover) {
      $scope.actionsPopover = popover;
      //Cleanup the popover when we're done with it!
      $scope.$on('$destroy', function() {
        $scope.actionsPopover.remove();
      });
      $scope.actionsPopover.show(event);
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

}


function GpBlockchainIssuersController($scope, $q, $state, $translate, csCurrency, gpData) {
  'ngInject';
  $scope.loading = true;
  $scope.height = undefined;
  $scope.width = undefined;

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

      $scope.load()
        .then(function() {
          $scope.loading = false;
        });
    }
  };
  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.load = function() {
    return $q.all([
      $translate([
        'GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_TITLE',
        'GRAPH.BLOCKCHAIN.BLOCKS_ISSUERS_LABEL'
      ]),
      gpData.blockchain.countByIssuer($scope.currency)
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
        $scope.colors = gpData.util.colors.custom(result.data.length);

      });
  };

  $scope.setSize = function(height, width, maintainAspectRatio) {
    $scope.height = height;
    $scope.width = width;
    $scope.maintainAspectRatio = angular.isDefined(maintainAspectRatio) ? maintainAspectRatio : $scope.maintainAspectRatio;
  };

  $scope.showBlockIssuer = function(data, e, item) {
    if (!item) return;
    var issuer = $scope.issuers[item._index];
    $state.go('app.wot_identity', issuer);
  };
}
