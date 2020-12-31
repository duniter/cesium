
angular.module('cesium.graph.currency.controllers', ['chart.js', 'cesium.graph.services', 'cesium.graph.common.controllers'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    $stateProvider
      .state('app.currency.tab_parameters_stats', {
        url: "/parameters/stats",
        views: {
          'tab-parameters': {
            templateUrl: "plugins/graph/templates/currency/tabs/tab_parameters_stats.html"
          }
        }
      })
      .state('app.currency.tab_wot_stats', {
        url: "/community/stats",
        views: {
          'tab-wot': {
            templateUrl: "plugins/graph/templates/currency/tabs/tab_wot_stats.html",
            controller: 'GpCurrencyMembersCountCtrl'
          }
        }
      })
      .state('app.currency.tab_network_stats', {
        url: "/network/stats",
        views: {
          'tab-network': {
            templateUrl: "plugins/graph/templates/currency/tabs/tab_network_stats.html"
          }
        }
      })
      .state('app.currency.tab_blocks_stats', {
        url: "/blocks/stats",
        views: {
          'tab-blocks': {
            templateUrl: "plugins/graph/templates/currency/tabs/tab_blocks_stats.html"
          }
        }
      })
      .state('app.currency_stats_lg', {
        url: "/currency/stats/lg?hide&scale&stepUnit&t",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/currency/view_stats_lg.html"
          }
        }
      });

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider
        .extendStates(['app.currency_name', 'app.currency', 'app.currency_name_lg', 'app.currency_lg'], {
          points: {
            'parameters-actual': {
              templateUrl: "plugins/graph/templates/currency/view_currency_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            },
            'wot-actual': {
              templateUrl: "plugins/graph/templates/currency/view_currency_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            },
            'network-actual': {
              templateUrl: "plugins/graph/templates/currency/view_currency_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            }
          }
        })
        .extendStates(['app.currency.tab_blocks'], {
          points: {
            'buttons': {
              templateUrl: "plugins/graph/templates/currency/tab_blocks_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            }
          }
        })
      ;
    }
  })


  .controller('GpCurrencyViewExtendCtrl', GpCurrencyViewExtendController)

  .controller('GpCurrencyMonetaryMassCtrl', GpCurrencyMonetaryMassController)

  .controller('GpCurrencyDUCtrl', GpCurrencyDUController)

  .controller('GpCurrencyMembersCountCtrl', GpCurrencyMembersCountController)

  .controller('GpCurrencyPendingCountCtrl', GpCurrencyPendingCountController)
;

function GpCurrencyViewExtendController($scope, PluginService, UIUtils, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();
  $scope.smallscreen = UIUtils.screen.isSmall();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}

function GpCurrencyMonetaryMassController($scope, $controller, $q, $state, $translate, UIUtils, gpColor, gpData, $filter, csSettings) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.formData.useRelative = angular.isDefined($scope.formData.useRelative) ?
    $scope.formData.useRelative :
    csSettings.data.useRelative;
  $scope.displayShareAxis = true;
  $scope.hiddenDatasets = [];

  $scope.init = function(e, state) {
    // nothing to do here
  };

  $scope.onUseRelativeChanged = function() {
    if (!$scope.loading) {
      $scope.load();
    }
  };
  $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged);

  var truncAmount = function(value) {
    return Math.trunc(value*100)/100;
  };

  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return $q.all([
      $translate(['GRAPH.CURRENCY.MONETARY_MASS_TITLE',
        'GRAPH.CURRENCY.MONETARY_MASS_LABEL',
        'GRAPH.CURRENCY.MONETARY_MASS_SHARE_LABEL',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),
      gpData.blockchain.withDividend($scope.formData.currency, {
        from: from,
        size: size
      })
    ])
      .then(function(result) {
        var translations = result[0];
        result = result[1];
        if (!result || !result.times) return;
        $scope.times = result.times;

        // Compute the date pattern, depending on the blocks period
        var blocksPeriod = result.times[result.times.length-1] - result.times[0];
        var datePattern = (blocksPeriod < 31557600/* less than 1 year */) ?
          translations['COMMON.DATE_SHORT_PATTERN'] : translations['COMMON.DATE_MONTH_YEAR_PATTERN'];

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data: relative
        var data = [];
        if ($scope.formData.useRelative) {

          // M/N
          data.push(
            _.map(result.blocks, function(block) {
              return truncAmount(block.monetaryMass / block.dividend / block.membersCount);
            }));

          // Mass
          data.push(
            _.map(result.blocks, function(block) {
              return truncAmount(block.monetaryMass / block.dividend);
            }));
        }

        // Data: quantitative
        else {
          // M/N
          data.push(
            _.map(result.blocks, function(block) {
              return truncAmount(block.monetaryMass / block.membersCount / 100);
            }));

          // Mass
          data.push(
            _.map(result.blocks, function(block) {
              return block.monetaryMass / 100;
            }));
        }
        $scope.data = data;

        // Labels
        $scope.labels = _.map(result.times, function(time) {
          return moment.unix(time).local().format(datePattern);
        });

        // Colors
        $scope.colors = gpColor.scale.fix(result.times.length);

        // Options
        $scope.options = {
          responsive: true,
          maintainAspectRatio: $scope.maintainAspectRatio,
          title: {
            display: true,
            text: translations['GRAPH.CURRENCY.MONETARY_MASS_TITLE']
          },
          legend: {
            display: $scope.displayShareAxis,
            onClick: $scope.onLegendClick
          },
          scales: {
            yAxes: [
              {
                id: 'y-axis-mn'
              },
              {
                id: 'y-axis-mass',
                display: $scope.displayShareAxis,
                position: 'right',
                gridLines: {
                  drawOnChartArea: false
                }
              },

            ]
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' + formatAmount(tooltipItems.yLabel) +
                  ' ' + $scope.currencySymbol;
              }
            }
          }
        };

        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-mn',
            type: 'line',
            label: translations['GRAPH.CURRENCY.MONETARY_MASS_SHARE_LABEL'],
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 4,
            pointHoverRadius: 3
          },
          {
            yAxisID: 'y-axis-mass',
            type: 'line',
            label: translations['GRAPH.CURRENCY.MONETARY_MASS_LABEL'],
            fill: false,
            showLine: true,
            borderColor: gpColor.rgba.energized(),
            borderWidth: 1,
            backgroundColor: gpColor.rgba.energized(),
            pointBackgroundColor: gpColor.rgba.energized(),
            pointBorderColor: gpColor.rgba.energized(),
            pointHoverBackgroundColor: gpColor.rgba.energized(),
            pointHoverBorderColor: gpColor.rgba.energized(),
            pointRadius: 0,
            pointHitRadius: 4,
            pointHoverRadius: 3
          }];

        $scope.setScale($scope.scale);

        // Keep only block number (need for click)
        $scope.blocks = result.blocks.reduce(function(res, block) {
          return res.concat(block.number);
        }, []);
      });

  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var number = $scope.blocks[item._index];
    $state.go('app.view_block', {number: number});
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/graph/templates/currency/popover_monetary_mass_actions.html',
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

}


function GpCurrencyDUController($scope, $q, $controller, $translate, gpColor, gpData, $filter, UIUtils) {
  'ngInject';

  $scope.formData = {
    scale: 'linear',
    beginAtZero: false
  };

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyMonetaryMassCtrl', {$scope: $scope}));


  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return $q.all([
      $translate([
        'GRAPH.CURRENCY.UD_TITLE',
        'COMMON.UNIVERSAL_DIVIDEND',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),
      gpData.blockchain.withDividend($scope.formData.currency, {
        from: from,
        size: size
      })
    ])
      .then(function(result) {
        var translations = result[0];
        result = result[1];
        if (!result || !result.times) return;
        $scope.times = result.times;

        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.times[result.times.length-1] - result.times[0];
        var datePattern = (blocksPeriod < 31557600/* less than 1 year */) ?
          translations['COMMON.DATE_SHORT_PATTERN'] : translations['COMMON.DATE_MONTH_YEAR_PATTERN'];

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, false);

        // Data
        $scope.data = [
          _.map(result.blocks, function(block) {
            return block.dividend / 100;
          })
        ];

        // Labels
        $scope.labels = _.map(result.times, function(time) {
          return moment.unix(time).local().format(datePattern);
        });

        // Colors
        $scope.colors = result.blocks.reduce(function(res) {
          return res.concat(gpColor.rgba.calm(0.5));
        }, []);

        // Options
        $scope.options = {
          responsive: true,
          maintainAspectRatio: $scope.maintainAspectRatio,
          title: {
            display: true,
            text: translations['GRAPH.CURRENCY.UD_TITLE']
          },
          scales: {
            yAxes: [
              {
                id: 'y-axis-ud',
                ticks: {
                  beginAtZero: $scope.formData.beginAtZero
                }
              }
            ]
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' + formatAmount(tooltipItems.yLabel) +
                  ' ' + $scope.currencySymbol;
              }
            }
          }
        };
        $scope.setScale($scope.scale);

        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-ud',
            type: 'line',
            label: translations['COMMON.UNIVERSAL_DIVIDEND'],
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 4,
            pointHoverRadius: 3
          }];

        // Keep only block number (need for click)
        $scope.blocks = result.blocks.reduce(function(res, block) {
          return res.concat(block.number);
        }, []);
      });

  };

  /* -- Popover -- */
  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/graph/templates/currency/popover_monetary_mass_actions.html',
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

}


function GpCurrencyMembersCountController($scope, $controller, $q, $state, $translate, gpColor, gpData, $filter) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return $q.all([
      $translate(['GRAPH.CURRENCY.MEMBERS_COUNT_TITLE',
        'GRAPH.CURRENCY.MEMBERS_COUNT_LABEL',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN'
      ]),
      gpData.blockchain.withDividend($scope.formData.currency, {
        from: from,
        size: size,
        withCurrent: true
      })
    ])
      .then(function(result) {
        var translations = result[0];
        result = result[1];

        if (!result || !result.times) return;
        $scope.times = result.times;

        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.times[result.blocks.length-1] - result.times[0];
        var datePattern = (blocksPeriod < 31557600/* less than 1 year */) ?
          translations['COMMON.DATE_SHORT_PATTERN'] : translations['COMMON.DATE_MONTH_YEAR_PATTERN'];

        // Data
        $scope.data = [
          _.pluck(result.blocks, 'membersCount')
        ];

        // Labels
        $scope.labels = _.map(result.times, function(time) {
          return moment.unix(time).local().format(datePattern);
        });

        // Members count graph: -------------------------
        $scope.options = {
            responsive: true,
            maintainAspectRatio: $scope.maintainAspectRatio,
            title: {
              display: true,
              text: translations['GRAPH.CURRENCY.MEMBERS_COUNT_TITLE']
            },
            scales: {
              xAxes: [{
                position: 'bottom'
              }],
              yAxes: [{
                id: 'y-axis-1',
                ticks: {
                  beginAtZero: false
                }
              }]
            }
          };
        $scope.datasetOverride = [{
            yAxisID: 'y-axis-1',
            type: 'line',
            label: translations['GRAPH.CURRENCY.MEMBERS_COUNT_LABEL'],
            borderWidth: 2,
            pointRadius: 0,
            pointHitRadius: 4,
            pointHoverRadius: 3
          }];


        // Colors
        $scope.colors = gpColor.scale.fix(result.blocks.length);
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    if (!item._index) {
      $state.go('app.view_block', {number: 0});
      return;
    }
    var from = $scope.times[item._index-1];
    var to = moment.unix(from).utc().add(1, 'day').unix();
    $state.go('app.blockchain_search', {
      q: '(_exists_:joiners OR _exists_:leavers OR _exists_:revoked OR _exists_:excluded) AND medianTime:>{0} AND medianTime:<={1}'.format(from, to)
    });
  };


}


function GpCurrencyPendingCountController($scope, $controller, $q, $state, $translate, gpColor, esHttp) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpDocStatsCtrl', {$scope: $scope}));

  $scope.chartIdPrefix = 'currency-chart-pending-';

  $scope.init = function(e, state) {
    var currency = $scope.formData.currency;
    if (!currency) throw Error('Missing formData.currency!');

    $scope.formData.index = currency;
    $scope.formData.types = ['member', 'pending'];

    $scope.charts = [

      // Pending delta
      {
        id: currency + '_member_delta',
        title: 'GRAPH.CURRENCY.MEMBERS_DELTA_TITLE',
        series: [
          {
            key: currency + '_is_member_delta',
            label: 'GRAPH.CURRENCY.IS_MEMBER_DELTA_LABEL',
            type: 'bar',
            yAxisID: 'y-axis-delta',
            color: gpColor.rgba.calm(),
            pointHoverBackgroundColor: gpColor.rgba.calm(),
          },
          {
            key: currency + '_was_member_delta',
            label: 'GRAPH.CURRENCY.WAS_MEMBER_DELTA_LABEL',
            type: 'bar',
            yAxisID: 'y-axis-delta',
            color: gpColor.rgba.assertive(0.7),
            pointHoverBackgroundColor: gpColor.rgba.assertive(),
          },
          {
            key: currency + '_pending_delta',
            label: 'GRAPH.CURRENCY.PENDING_DELTA_LABEL',
            type: 'line',
            yAxisID: 'y-axis-delta',
            color: gpColor.rgba.gray(0.5),
            pointHoverBackgroundColor: gpColor.rgba.gray()
          }
        ]
      }];

    $scope.formData.queryNames = $scope.charts.reduce(function(res, chart){
      return chart.series.reduce(function(res, serie) {
        var queryName = serie.key.replace(/_delta$/, '');
        return res.concat(queryName);
      }, res);
    }, []);
  };

  var inheritedLoad = $scope.load;
  $scope.load = function() {

    // Call inherited load
    return inheritedLoad()
      .then(function() {
        var chart = $scope.charts[0];

        // Compute wasMember serie, using the is_member
        if (chart.data[1]) {
          chart.data[1] = _.map(chart.data[0], function(value) {
            return value < 0 ? value : undefined;
          });
        }
        chart.data[0] = _.map(chart.data[0], function(value) {
          return value >= 0 ? value : undefined;
        });

        $scope.chart = chart;
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;

    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();

    var blockRequest = esHttp.get('/{0}/block/_search?pretty'.format($scope.formData.currency));
    // Get block min/max
    return $q.all([
      // Get first (min) block
      blockRequest({
        q: 'time:>={0} AND time:<={1}'.format(from, to),
        sort: 'number:asc',
        size: 1,
        _source: ['number']
      }),

      // Get last (max) block
      blockRequest({
        q: 'time:>={0} AND time:<={1}'.format(from, to),
        sort: 'number:desc',
        size: 1,
        _source: ['number']
      })
    ])
      .then(function(res) {
        var minBlockHit = res[0] && res[0].hits && res[0].hits.hits && res[0].hits.hits[0];
        var maxBlockHit = res[1] && res[1].hits && res[1].hits.hits && res[1].hits.hits[0];
        var minBlockNumber = minBlockHit ? minBlockHit._source.number : undefined;
        var maxBlockNumber = maxBlockHit ? maxBlockHit._source.number : undefined;
        return $state.go('app.document_search', {
          index: $scope.formData.currency,
          type: 'pending',
          q: 'blockNumber:>={0} AND blockNumber:<{1}'.format(minBlockNumber, maxBlockNumber)
        });
      });

  };
}
