
angular.module('cesium.graph.account.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      /*PluginServiceProvider
        .extendState('app.view_wallet', {
          points: {
            'general': {
              templateUrl: "plugins/graph/templates/network/view_wallet_extend.html",
              controller: 'GpWalletExtendCtrl'
            }
          }
        })

        // TODO add wot extend
      ;*/

      $stateProvider
        .state('app.view_wallet_stats', {
          url: "/wallet/stats?t&stepUnit",
          views: {
            'menuContent': {
              templateUrl: "plugins/graph/templates/account/view_stats.html"
            }
          },
          data: {
            auth: true
          }
        })

        .state('app.wot_identity_stats', {
          url: "/wot/:pubkey/stats?t&stepUnit",
          views: {
            'menuContent': {
              templateUrl: "plugins/graph/templates/account/view_stats.html"
            }
          }
        });
    }
  })

  .controller('GpWalletExtendCtrl', GpWalletExtendController)

  .controller('GpAccountBalanceCtrl', GpAccountBalanceController)

  .controller('GpAccountCertificationCtrl', GpAccountCertificationController)

;

function GpWalletExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}


function GpAccountBalanceController($scope, $controller, $q, $state, $filter, $translate, gpData, gpColor, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.init = function(e, state) {

      if (state && state.stateParams && state.stateParams.pubkey) { // Currency parameter
        $scope.formData.pubkey = state.stateParams.pubkey;
      }
      else if(csWallet.isLogin()) {
        $scope.formData.pubkey = csWallet.data.pubkey;
      }

      // for DEV only
      //$scope.formData.pubkey = '38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE';
  };

  $scope.load = function(updateTimePct) {

    updateTimePct = angular.isDefined(updateTimePct) ? updateTimePct : true;

    return $q.all([

      $translate('GRAPH.ACCOUNT.BALANCE_TITLE', $scope.formData),

      // translate i18n keys
      $translate(['GRAPH.ACCOUNT.UD_LABEL',
        'GRAPH.ACCOUNT.TX_RECEIVED_LABEL',
        'GRAPH.ACCOUNT.TX_SENT_LABEL',
        'GRAPH.ACCOUNT.UD_ACCUMULATION_LABEL',
        'GRAPH.ACCOUNT.TX_ACCUMULATION_LABEL',
        'GRAPH.ACCOUNT.BALANCE_LABEL',
        'COMMON.DATE_PATTERN',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),

      // get data
      gpData.blockchain.movement($scope.formData.currency, angular.copy($scope.formData))
    ])
      .then(function(result) {
        var title = result[0];
        var translations = result[1];
        result = result[2];

        if (!result || !result.times) {
          console.log('No DATA');
          return; // no data
        }
        $scope.times = result.times;

        var formatInteger = $filter('formatInteger');
        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data
        $scope.data = [
          //result.ud,
          result.received,
          result.sent,
          result.udSum,
          result.txSum,
          result.balance
        ];

        var displayFormats = {
          hour: translations['COMMON.DATE_PATTERN'],
          day: translations['COMMON.DATE_SHORT_PATTERN'],
          month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
        };
        var displayFormat = displayFormats[$scope.formData.rangeDuration];
        // Labels
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(moment.unix(time).local().format(displayFormat));
        }, []);

        // Colors
        $scope.colors = gpColor.scale.fix(result.times.length);

        // Update range with received values
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
                id: 'y-axis-left',
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
                id: 'y-axis-right',
                type: 'linear',
                position: 'right',
                stacked: true,
                display: false,
                gridLines: {
                  show: false
                },
                ticks: {
                  beginAtZero:true,
                  callback: function(value) {
                    return formatInteger(value);
                  }
                }
              }
            ]
          },
          legend: {
            display: true
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                // Should add a '+' before value ?
                var addPlus = (tooltipItems.datasetIndex < 2)
                  && tooltipItems.yLabel > 0;
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' +
                  (!tooltipItems.yLabel ? '0' :
                    ((addPlus ? '+' : '') + formatAmount(tooltipItems.yLabel) + ' ' + $scope.currencySymbol));
              }
            }
          }
        };

        $scope.datasetOverride = [
          /*{
            yAxisID: 'y-axis-right',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.UD_LABEL'],
            backgroundColor: gpColor.rgba.energized(0.3),
            hoverBackgroundColor: gpColor.rgba.energized(0.5),
            borderWidth: 1
          },*/
          {
            yAxisID: 'y-axis-right',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.TX_RECEIVED_LABEL'],
            backgroundColor: gpColor.rgba.positive(0.3),
            hoverBackgroundColor: gpColor.rgba.positive(0.5),
            borderWidth: 1
          },
          {
            yAxisID: 'y-axis-right',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.TX_SENT_LABEL'],
            backgroundColor: gpColor.rgba.gray(0.3),
            hoverBackgroundColor: gpColor.rgba.gray(0.5),
            borderWidth: 1
          },
          {
            yAxisID: 'y-axis-left',
            type: 'line',
            label: translations['GRAPH.ACCOUNT.UD_ACCUMULATION_LABEL'],
            fill: false,
            borderColor: gpColor.rgba.energized(0.5),
            borderWidth: 2,
            backgroundColor: gpColor.rgba.energized(0.7),
            pointBackgroundColor: gpColor.rgba.energized(0.5),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.energized(1),
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3,
            lineTension: 0.1
          },
          {
            yAxisID: 'y-axis-left',
            type: 'line',
            label: translations['GRAPH.ACCOUNT.TX_ACCUMULATION_LABEL'],
            fill: false,
            borderColor: gpColor.rgba.positive(0.5),
            borderWidth: 2,
            backgroundColor: gpColor.rgba.positive(0.7),
            pointBackgroundColor: gpColor.rgba.positive(0.5),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.positive(1),
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3,
            lineTension: 0.1
          },
          {
            yAxisID: 'y-axis-left',
            type: 'line',
            label: translations['GRAPH.ACCOUNT.BALANCE_LABEL'],
            fill: 'origin',
            borderColor: gpColor.rgba.calm(0.5),
            borderWidth: 2,
            pointBackgroundColor: gpColor.rgba.calm(0.5),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.calm(1),
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3,
            lineTension: 0.1
          }
        ];
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();
    var query = '_exists_:transactions AND medianTime:>={0} AND medianTime:<{1}'.format(from, to);
    if ($scope.formData.pubkey) {
      query += ' AND (transactions.issuers:' + $scope.formData.pubkey + ' OR transactions.outputs:*' + $scope.formData.pubkey + ')';
    }
    $state.go('app.blockchain_search', {q: query});
  };
}


/**
 * Graph that display received/sent certification
 */
function GpAccountCertificationController($scope, $controller, $q, $state, $filter, $translate, gpData, gpColor, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  $scope.init = function(e, state) {
      if (state && state.stateParams && state.stateParams.pubkey) { // Currency parameter
        $scope.formData.pubkey = state.stateParams.pubkey;
      }
      else if(csWallet.isLogin()) {
        $scope.formData.pubkey = csWallet.data.pubkey;
      }

      // for DEV only
      //$scope.formData.pubkey = '38MEAZN68Pz1DTvT3tqgxx4yQP6snJCQhPqEFxbDk4aE';
  };

  $scope.load = function(updateTimePct) {

    var formData = $scope.formData;

    return $q.all([

      $translate('GRAPH.ACCOUNT.CERTIFICATION_TITLE', formData),

      // translate i18n keys
      $translate(['GRAPH.ACCOUNT.GIVEN_CERT_LABEL',
        'GRAPH.ACCOUNT.RECEIVED_CERT_LABEL',
        'GRAPH.ACCOUNT.GIVEN_CERT_DELTA_LABEL',
        'GRAPH.ACCOUNT.RECEIVED_CERT_DELTA_LABEL',
        'COMMON.DATE_PATTERN',
        'COMMON.DATE_SHORT_PATTERN',
        'COMMON.DATE_MONTH_YEAR_PATTERN']),

      // get data
      gpData.wot.certifications(formData)
    ])
      .then(function(result) {

        var title = result[0];
        var translations = result[1];
        result = result[2];

        if (!result || !result.times) {
          console.log('No DATA');
          return; // no data
        }
        $scope.times = result.times;

        var formatInteger = $filter('formatInteger');

        // Data
        $scope.data = [
          result.deltaReceived,
          result.received,
          result.deltaGiven,
          result.given
        ];

        // Labels
        $scope.labels = result.labels;

        var displayFormats = {
          hour: translations['COMMON.DATE_PATTERN'],
          day: translations['COMMON.DATE_SHORT_PATTERN'],
          month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
        };
        var displayFormat = displayFormats[$scope.formData.rangeDuration];
        // Labels
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(moment.unix(time).local().format(displayFormat));
        }, []);

        // Colors
        $scope.colors = gpColor.scale.fix(result.times.length);

        // Update options with received values
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
                id: 'y-axis-left',
                type: 'linear',
                position: 'left'
              },
              {
                id: 'y-axis-hide',
                type: 'linear',
                display: false,
                position: 'right'
              }
            ]
          },
          legend: {
            display: true
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                // Should add a '+' before value ?
                var addPlus = (tooltipItems.datasetIndex === 0 || tooltipItems.datasetIndex === 2) && tooltipItems.yLabel > 0;
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' +
                  (addPlus ? '+' : '') +
                  !tooltipItems.yLabel ? '0' : formatInteger(tooltipItems.yLabel);
              }
            }
          }
        };

        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-left',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.RECEIVED_CERT_DELTA_LABEL'],
            borderColor: gpColor.rgba.positive(0.6),
            borderWidth: 1,
            backgroundColor: gpColor.rgba.positive(0.4),
            hoverBackgroundColor: gpColor.rgba.positive(0.6)
          },
          {
            yAxisID: 'y-axis-left',
            type: 'line',
            label: translations['GRAPH.ACCOUNT.RECEIVED_CERT_LABEL'],
            fill: false,
            borderColor: gpColor.rgba.positive(0.5),
            borderWidth: 2,
            backgroundColor: gpColor.rgba.positive(1),
            pointBackgroundColor: gpColor.rgba.positive(0.5),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.positive(1),
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3
          },
          {
            yAxisID: 'y-axis-left',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.GIVEN_CERT_DELTA_LABEL'],
            borderColor: gpColor.rgba.assertive(0.6),
            borderWidth: 1,
            backgroundColor: gpColor.rgba.assertive(0.4),
            hoverBackgroundColor: gpColor.rgba.assertive(0.6)
          },
          {
            yAxisID: 'y-axis-left',
            type: 'line',
            label: translations['GRAPH.ACCOUNT.GIVEN_CERT_LABEL'],
            fill: false,
            borderColor: gpColor.rgba.assertive(0.4),
            borderWidth: 2,
            backgroundColor: gpColor.rgba.assertive(1),
            pointBackgroundColor: gpColor.rgba.assertive(0.4),
            pointBorderColor: gpColor.rgba.white(),
            pointHoverBackgroundColor: gpColor.rgba.assertive(1),
            pointHoverBorderColor: 'rgba(0,0,0,0)',
            pointRadius: 3,
            lineTension: 0.1
          }
        ];
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();
    var query = '_exists_:transactions AND medianTime:>={0} AND medianTime:<{1}'.format(from, to);
    if ($scope.formData.pubkey) {
      query += ' AND (transactions.issuers:' + $scope.formData.pubkey + ' OR transactions.outputs:*' + $scope.formData.pubkey + ')';
    }
    $state.go('app.blockchain_search', {q: query});
  };
}
