
angular.module('cesium.graph.account.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider
        .extendState('app.view_wallet_tx', {
          points: {
            'buttons': {
              templateUrl: "plugins/graph/templates/account/view_wallet_tx_extend.html",
              controller: 'GpExtendCtrl'
            }
          }
        })

        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/graph/templates/account/view_identity_extend.html",
              controller: 'GpExtendCtrl'
            }
          }
        })

        .extendStates(['app.wot_identity_tx_uid', 'app.wot_identity_tx_uid_lg'], {
          points: {
            'buttons': {
              templateUrl: "plugins/graph/templates/account/view_identity_tx_extend.html",
              controller: 'GpExtendCtrl'
            }
          }
        })
      ;

      $stateProvider
        .state('app.view_wallet_stats', {
          url: "/wallet/stats?t&stepUnit&hide&scale",
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
          url: "/wot/:pubkey/stats?t&stepUnit&hide&scale",
          views: {
            'menuContent': {
              templateUrl: "plugins/graph/templates/account/view_stats.html"
            }
          }
        });
    }
  })

  .controller('GpExtendCtrl', GpExtendController)

  .controller('GpAccountBalanceCtrl', GpAccountBalanceController)

  .controller('GpAccountSumTxCtrl', GpAccountSumTxController)

  .controller('GpAccountCertificationCtrl', GpAccountCertificationController)

;

function GpExtendController($scope, PluginService, esSettings, $state, csWallet) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });

  $scope.showIdentityStats = function() {
    if ($scope.formData && $scope.formData.pubkey) {
      $state.go('app.wot_identity_stats', {pubkey: $scope.formData.pubkey});
    }
  };

  $scope.showWalletStats = function() {
    if (csWallet.isLogin()) {
      $state.go('app.wot_identity_stats', {pubkey: csWallet.data.pubkey});
    }
  };
}


function GpAccountBalanceController($scope, $controller, $q, $state, $filter, $translate, csWot, gpData, gpColor, csWallet) {
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

  };

  var defaultSetScale = $scope.setScale;
  $scope.setScale = function(scale) {
    // linear scale: sent values as negative
    if (scale === 'linear') {
      $scope.data[$scope.data.length-2] = _.map($scope.data[$scope.data.length-2], function(value) {
        return -1 * Math.abs(value);
      });
    }
    // log scale: sent values as positive
    else {
      $scope.data[$scope.data.length-2] = _.map($scope.data[$scope.data.length-2], function(value) {
        return Math.abs(value);
      });
    }

    // call default implementation
    defaultSetScale(scale);
  };

  $scope.load = function(updateTimePct) {

    updateTimePct = angular.isDefined(updateTimePct) ? updateTimePct : true;

    var withUD = true;

    return csWot.load($scope.formData.pubkey)
      .then(function(identity) {
        $scope.identity = identity;
        withUD = $scope.identity.isMember || $scope.identity.wasMember;

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
        ]);
      })
      .then(function(result) {
        var title = result[0];
        var translations = result[1];
        result = result[2];

        if (!result || !result.times) return; // no data
        $scope.times = result.times;

        var formatInteger = $filter('formatInteger');
        var formatAmount =  $filter('formatDecimal');
        $scope.currencySymbol = $filter('currencySymbolNoHtml')($scope.formData.currency, $scope.formData.useRelative);

        // Data
        $scope.data = [
          result.ud,
          result.received,
          result.sent,
          result.balance
        ];

        var datePatterns = {
          hour: translations['COMMON.DATE_PATTERN'],
          day: translations['COMMON.DATE_SHORT_PATTERN'],
          month: translations['COMMON.DATE_MONTH_YEAR_PATTERN']
        };
        // Labels
        var labelPattern = datePatterns[$scope.formData.rangeDuration];
        $scope.labels = result.times.reduce(function(res, time) {
          return res.concat(moment.unix(time).local().format(labelPattern));
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
            xAxes: [{
              stacked: true
            }],
            yAxes: [
              {
                id: 'y-axis-left',
                type: 'linear',
                position: 'left',
                stacked: true
              }
            ]
          },
          legend: {
            display: true,
            onClick: $scope.onLegendClick
          },
          tooltips: {
            enabled: true,
            mode: 'index',
            callbacks: {
              label: function(tooltipItems, data) {
                return data.datasets[tooltipItems.datasetIndex].label +
                  ': ' +
                  (!tooltipItems.yLabel ? '0' :
                    (formatAmount(tooltipItems.yLabel) + ' ' + $scope.currencySymbol));
              }
            }
          }
        };

        $scope.datasetOverride = [
          {
            yAxisID: 'y-axis-left',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.UD_LABEL'],
            backgroundColor: gpColor.rgba.energized(0.3),
            hoverBackgroundColor: gpColor.rgba.energized(0.5),
            borderWidth: 1
          },
          {
            yAxisID: 'y-axis-left',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.TX_RECEIVED_LABEL'],
            backgroundColor: gpColor.rgba.positive(0.4),
            hoverBackgroundColor: gpColor.rgba.positive(0.6),
            borderWidth: 1
          },
          {
            yAxisID: 'y-axis-left',
            type: 'bar',
            label: translations['GRAPH.ACCOUNT.TX_SENT_LABEL'],
            backgroundColor: gpColor.rgba.assertive(0.4),
            hoverBackgroundColor: gpColor.rgba.assertive(0.6),
            borderWidth: 1
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


        if (!withUD) {
          // remove UD
          $scope.data.splice(0,1);
          $scope.datasetOverride.splice(0,1);
        }
        else {
          // FIXME: fund why UD data not working well
          // remove UD
          /*$scope.data.splice(0,1);
          $scope.datasetOverride.splice(0,1);*/
        }
      });
  };

  $scope.onChartClick = function(data, e, item) {
    if (!item) return;
    var from = $scope.times[item._index];
    var to = moment.unix(from).utc().add(1, $scope.formData.rangeDuration).unix();
    var query = 'medianTime:>={0} AND medianTime:<{1}'.format(from, to);
    if ($scope.formData.pubkey) {
      query += ' AND (transactions.issuers:' + $scope.formData.pubkey + ' OR transactions.outputs:*' + $scope.formData.pubkey + ')';
    }
    $state.go('app.blockchain_search', {q: query});
  };
}

//TODO : Avoid csTx loading, switch to Elasticsearch
function GpAccountSumTxController($scope, $controller, $filter, $state, csTx, gpColor) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpCurrencyAbstractCtrl', {$scope: $scope}));

  // When opening the view
  $scope.init= function(e, state) {

    // Get the pubkey (from URL params) and store it in the page context ($scope)
    $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);

  };

  // When opening the view
  $scope.load = function(e, state) {
    if (!$scope.pubkey) return;

    var formatDecimal = $filter('formatDecimal');

    // Load account TX data
    return csTx.load($scope.pubkey, -1)
      .then(function(result) {

        if (result && result.tx && result.tx.history) {
          //Charts data
          $scope.inputChart = $scope.computeChartData(_.filter(result.tx.history, function(tx) {
            return tx.amount > 0;
          }));
          $scope.outputChart = $scope.computeChartData(_.filter(result.tx.history, function(tx) {
            return tx.amount < 0;
          }));
        }
      });
  };

  // Load chart data: received amount by pubkey
  $scope.computeChartData = function(txArray) {

    var formatPubkey = $filter('formatPubkey');

    // Sum TX amount, with a group by pubkey
    var sumByPubkeys = {};
    _.forEach(txArray, function (tx) {
      sumByPubkeys[tx.pubkey] = sumByPubkeys[tx.pubkey] || {
          label: tx.name || tx.uid || formatPubkey(tx.pubkey),
          pubkey: tx.pubkey,
          sum: 0
        };
      sumByPubkeys[tx.pubkey].sum += Math.abs(tx.amount/100);
    });

    // Get values (from the map), then sort (desc) on sum
    var sumItems = _.sortBy(_.values(sumByPubkeys), 'sum').reverse();

    // Return arrays expected by angular-chart
    return {
      data: _.pluck(sumItems, 'sum'),
      labels: _.pluck(sumItems, 'label'),
      pubkeys: _.pluck(sumItems, 'pubkey'),
      colors: gpColor.scale.custom(
        Math.max(10, sumItems.length) // avoid strange colors
      )
    };
  };

  $scope.onInputChartClick = function(data, e, item) {
    if (!item) return;
    var pubkey = $scope.inputChart.pubkeys[item._index];
    $state.go('app.wot_identity', {pubkey: pubkey});
  };

  $scope.onOutputChartClick = function(data, e, item) {
    if (!item) return;
    var pubkey = $scope.outputChart.pubkeys[item._index];
    $state.go('app.wot_identity', {pubkey: pubkey});
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

        if (!result || !result.times) return; // no data
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
