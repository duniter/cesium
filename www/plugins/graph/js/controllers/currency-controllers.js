
angular.module('cesium.graph.currency.controllers', ['chart.js', 'cesium.graph.services', 'cesium.graph.common.controllers'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    $stateProvider
      .state('app.currency.tab_parameters_stats', {
        url: "/parameters/stats",
        views: {
          'tab-parameters': {
            templateUrl: "plugins/graph/templates/currency/tabs/tab_parameters_stats.html",
            controller: 'GpCurrencyMonetaryMassCtrl'
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
        url: "/currency/stats/lg?hide&scale",
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

function GpCurrencyMonetaryMassController($scope, $controller, $q, $state, $translate, $ionicPopover, gpColor, gpData, $filter, csSettings) {
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
        'GRAPH.CURRENCY.MONETARY_MASS_SHARE_LABEL']),
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
        var formatDate;
        if (blocksPeriod < 31557600/* less than 1 year */) {
          formatDate = $filter('medianDateShort');
        }
        else {
          formatDate = $filter('formatDateMonth'); //see #683
        }

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data: relative
        var data = [];
        if($scope.formData.useRelative) {

          // M/N
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.dividend / block.membersCount));
            }, []));

          // Mass
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.dividend));
            }, []));
        }

        // Data: quantitative
        else {
          // M/N
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.membersCount / 100));
            }, []));

          // Mass
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(block.monetaryMass / 100);
            }, []));
        }
        $scope.data = data;

        // Labels
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(formatDate(time));
        }, []);

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
    $scope.hideActionsPopover();
    $ionicPopover.fromTemplateUrl('plugins/graph/templates/currency/popover_monetary_mass_actions.html', {
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


function GpCurrencyDUController($scope, $q, $controller, $translate, gpColor, gpData, $filter) {
  'ngInject';
  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyMonetaryMassCtrl', {$scope: $scope}));

  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return $q.all([
      $translate([
        'GRAPH.CURRENCY.UD_TITLE',
        'COMMON.UNIVERSAL_DIVIDEND']),
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
        var dateFilter;
        if (blocksPeriod < 31557600/* less than 1 year */) {
          dateFilter = $filter('medianDateShort');
        }
        else {
          dateFilter = $filter('formatDateMonth');
        }

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, false);

        // Data
        $scope.data = [
          result.blocks.reduce(function(res, block) {
            return res.concat(block.dividend / 100);
          }, [])
        ];

        // Labels
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(dateFilter(time));
        }, []);

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
                  beginAtZero: false
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
}


function GpCurrencyMembersCountController($scope, $controller, $q, $state, $translate, gpColor, gpData, $filter) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return $q.all([
      $translate(['GRAPH.CURRENCY.MEMBERS_COUNT_TITLE', 'GRAPH.CURRENCY.MEMBERS_COUNT_LABEL']),
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
        var dateFilter;
        if (blocksPeriod < 31557600/* less than 1 year*/) {
          dateFilter = $filter('medianDateShort');
        }
        else {
          dateFilter = $filter('formatDateMonth');
        }

        // Format time
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(dateFilter(time));
        }, []);

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

        // Data
        $scope.data = [
          result.blocks.reduce(function(res, block) {
            return res.concat(block.membersCount);
          }, [])
        ];

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
