
angular.module('cesium.graph.currency.controllers', ['chart.js', 'cesium.graph.services', 'cesium.graph.blockchain.controllers'])

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
        url: "/currency/stats/lg",
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

function GpCurrencyMonetaryMassController($scope, $q, $state, $translate, $ionicPopover, csCurrency, gpData, $filter, csSettings) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = $scope.formData || {};
  $scope.formData.useRelative = angular.isDefined($scope.formData.useRelative) ?
    $scope.formData.useRelative :
    csSettings.data.useRelative;
  $scope.height = undefined;
  $scope.width = undefined;
  $scope.maintainAspectRatio = true;
  $scope.scale = 'linear';
  $scope.displayShareAxis = true;

  $scope.enter = function(e, state) {
    if ($scope.loading) {

      if (!$scope.formData.currency && state && state.stateParams && state.stateParams.currency) { // Currency parameter
        $scope.formData.currency = state.stateParams.currency;
      }

      // Make sure there is currency, or load it not
      if (!$scope.formData.currency) {
        return csCurrency.default()
          .then(function(currency) {
            $scope.formData.currency = currency ? currency.name : null;
            return $scope.enter(e, state);
          });
      }

      $scope.load()
        .then(function() {
          $scope.loading = false;
        });
    }
  };
  $scope.$on('$csExtension.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

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
        if (!result || !result.blocks) return;

        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.blocks[result.blocks.length-1].medianTime - result.blocks[0].medianTime;
        var formatDate;
        if (blocksPeriod < 15778800/* less than 6 months*/) {
          formatDate = $filter('formatDateShort');
        }
        else {
          formatDate = $filter('formatDateMonth');
        }

        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data: relative
        var data = [];
        if($scope.formData.useRelative) {

          // Mass
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.dividend));
            }, []));

          // M/N
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.dividend / block.membersCount));
            }, []));
        }

        // Data: quantitative
        else {
          // Mass
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(block.monetaryMass / 100);
            }, []));

          // M/N
          data.push(
            result.blocks.reduce(function(res, block) {
              return res.concat(truncAmount(block.monetaryMass / block.membersCount / 100));
            }, []));
        }
        $scope.data = data;

        // Labels
        $scope.labels = result.labels.reduce(function(res, time) {
          return res.concat(formatDate(time));
        }, []);

        // Colors
        $scope.colors = result.blocks.reduce(function(res) {
          return res.concat('rgba(17,193,243,0.5)');
        }, []);

        // Options
        $scope.options = {
          responsive: true,
          maintainAspectRatio: $scope.maintainAspectRatio,
          title: {
            display: true,
            text: translations['GRAPH.CURRENCY.MONETARY_MASS_TITLE']
          },
          scales: {
            yAxes: [
              {
                id: 'y-axis-mass'
              },
              {
                id: 'y-axis-mn',
                display: $scope.displayShareAxis,
                position: 'right'
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
            yAxisID: 'y-axis-mass',
            type: 'bar',
            label: translations['GRAPH.CURRENCY.MONETARY_MASS_LABEL'],
            hoverBackgroundColor: 'rgba(17,193,243,0.6)'
          },
          {
            yAxisID: 'y-axis-mn',
            type: 'line',
            label: translations['GRAPH.CURRENCY.MONETARY_MASS_SHARE_LABEL'],
            fill: false,
            showLine: true,
            borderColor: 'rgba(255,201,0,1)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(255,201,0,1)',
            pointBorderColor: 'rgba(255,255,255,1)',
            pointHoverBackgroundColor: 'rgba(255,201,0,1)',
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3
          }];

        // Keep only block number (need for click)
        $scope.blocks = result.blocks.reduce(function(res, block) {
          return res.concat(block.number);
        }, []);
      });

  };

  $scope.showBlock = function(data, e, item) {
    if (!item) return;
    var number = $scope.blocks[item._index];
    $state.go('app.view_block', {number: number});
  };

  $scope.setSize = function(height, width, maintainAspectRatio) {
    $scope.height = height;
    $scope.width = width;
    $scope.maintainAspectRatio = angular.isDefined(maintainAspectRatio) ? maintainAspectRatio : $scope.maintainAspectRatio;
  };

  $scope.setScale = function(scale) {
    $scope.hideActionsPopover();
    $scope.scale = scale;

    var format = $filter('formatInteger');

    _.forEach($scope.options.scales.yAxes, function(yAxe) {
      yAxe.type = scale;
      yAxe.ticks = yAxe.ticks || {};
      if (scale == 'linear') {
        yAxe.ticks.beginAtZero = true;
        delete yAxe.ticks.min;
        yAxe.ticks.callback = function(value) {
          return format(value);
        };
      }
      else {
        yAxe.ticks.min = 0;
        delete yAxe.ticks.beginAtZero;
        delete yAxe.ticks.callback;
        yAxe.ticks.callback = function(value, index) {
          if (!value) return;
          //console.log(value + '->' + Math.log10(value)%1);
          if (Math.log10(value)%1 === 0 || Math.log10(value/3)%1 === 0) {
            return format(value);
          }
          return '';
        };
      }
    });
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


function GpCurrencyDUController($scope, $q, $controller, $translate, gpData, $filter) {
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
        if (!result || !result.blocks) return;

        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.blocks[result.blocks.length-1].medianTime - result.blocks[0].medianTime;
        var dateFilter;
        if (blocksPeriod < 15778800/* less than 6 months*/) {
          dateFilter = $filter('formatDateShort');
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
        $scope.labels = result.labels.reduce(function(res, time) {
          return res.concat(dateFilter(time));
        }, []);

        // Colors
        $scope.colors = result.blocks.reduce(function(res) {
          return res.concat('rgba(17,193,243,0.5)');
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
                  beginAtZero: true
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
            type: 'bar',
            label: translations['COMMON.UNIVERSAL_DIVIDEND'],
            hoverBackgroundColor: 'rgba(17,193,243,0.6)'
          }];

        // Keep only block number (need for click)
        $scope.blocks = result.blocks.reduce(function(res, block) {
          return res.concat(block.number);
        }, []);
      });

  };
}


function GpCurrencyMembersCountController($scope, $q, $state, $translate, BMA, csCurrency, gpData, $filter) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = $scope.formData || {};
  $scope.height = undefined;
  $scope.width = undefined;
  $scope.maintainAspectRatio = true;

  $scope.enter = function(e, state) {
    if ($scope.loading) {

      if (!$scope.formData.currency && state && state.stateParams && state.stateParams.currency) { // Currency parameter
        $scope.formData.currency = state.stateParams.currency;
      }

      // Make sure there is currency, or load it not
      if (!$scope.formData.currency) {
        return csCurrency.default()
          .then(function(currency) {
            $scope.formData.currency = currency ? currency.name : null;
            return $scope.enter(e, state);
          });
      }

      $scope.load()
        .then(function() {
          $scope.loading = false;
        });
    }
  };
  $scope.$on('$csExtension.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

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
        if (!result || !result.blocks) return;

        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.blocks[result.blocks.length-1].medianTime - result.blocks[0].medianTime;
        var dateFormat;
        if (blocksPeriod < 15778800/* less than 6 months*/) {
          dateFormat = $filter('formatDateShort');
        }
        else {
          dateFormat = $filter('formatDateMonth');
        }

        // Format time
        $scope.labels = result.labels.reduce(function(res, time) {
          return res.concat(dateFormat(time));
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
            hoverBackgroundColor: 'rgba(17,193,243,0.7)'
          }];

        // Data
        $scope.data = [
          result.blocks.reduce(function(res, block) {
            return res.concat(block.membersCount);
          }, [])
        ];

        // Colors
        $scope.colors = result.blocks.reduce(function(res) {
          return res.concat('rgba(17,193,243,0.5)');
        }, []);

        // Keep times (need for click)
        $scope.blockTimes = result.blocks.reduce(function(res, block) {
          return res.concat(block.medianTime);
        }, []);
      });
  };

  $scope.showBlock = function(data, e, item) {
    if (!item) return;
    if (!item._index) {
      $state.go('app.view_block', {number: 0});
      return;
    }
    var from = $scope.blockTimes[item._index-1];
    var to = moment.unix(from).utc().add(1, 'day').unix();
    $state.go('app.blockchain_search', {
      q: '(_exists_:joiners OR _exists_:leavers OR _exists_:revoked OR _exists_:excluded) AND medianTime:>{0} AND medianTime:<={1}'.format(from, to)
    });
  };

  $scope.setSize = function(height, width, maintainAspectRatio) {
    $scope.height = height;
    $scope.width = width;
    $scope.maintainAspectRatio = angular.isDefined(maintainAspectRatio) ? maintainAspectRatio : $scope.maintainAspectRatio;
  };

}
