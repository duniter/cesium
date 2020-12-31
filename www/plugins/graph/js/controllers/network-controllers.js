
angular.module('cesium.graph.network.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider
        .extendState('app.network', {
          points: {
            'blockchain-buttons': {
              templateUrl: "plugins/graph/templates/network/view_network_extend.html",
              controller: 'ESExtensionCtrl'
            }
          }
        })

        .extendState('app.view_peer', {
          points: {
            'general': {
              templateUrl: "plugins/graph/templates/network/view_peer_extend.html",
              controller: 'GpPeerViewExtendCtrl'
            }
          }
        })

        .extendState('app.es_network', {
          points: {
            'documents-buttons': {
              templateUrl: "plugins/graph/templates/network/view_es_network_extend.html",
              controller: 'ESExtensionCtrl'
            }
          }
        })

        .extendState('app.view_es_peer', {
          points: {
            'general': {
              templateUrl: "plugins/graph/templates/network/view_es_peer_extend.html",
              controller: 'ESExtensionCtrl'
            }
          }
        })
      ;

      $stateProvider
        .state('app.view_peer_stats', {
          url: "/network/peer/:pubkey/stats",
          views: {
            'menuContent': {
              templateUrl: "plugins/graph/templates/network/view_peer_stats.html",
              controller: 'GpBlockchainTxCountCtrl'
            }
          }
        })

      .state('app.network_stats', {
          url: "/network/stats?stepUnit&t&hide&scale",
          views: {
            'menuContent': {
              templateUrl: "plugins/graph/templates/network/view_stats.html",
              controller: 'GpNetworkStatsCtrl'
            }
          }
        });
    }
  })

  .controller('GpPeerViewExtendCtrl', GpPeerViewExtendController)

  .controller('GpNetworkStatsCtrl', GpNetworkStatsController)


;

function GpPeerViewExtendController($scope, $timeout, PluginService, esSettings, csCurrency, gpData) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();
  $scope.loading = true;
  $scope.node = $scope.node || {};

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });

  /**
   * Enter into the view
   * @param e
   * @param state
   */
  $scope.enter = function(e, state) {

    if (!$scope.node.currency && state && state.stateParams && state.stateParams.currency) { // Currency parameter
      $scope.node.currency = state.stateParams.currency;
    }

    // Make sure there is currency, or load if not
    if (!$scope.node.currency) {
      return csCurrency.get()
        .then(function(currency) {
          $scope.node.currency = currency ? currency.name : null;
          return $scope.enter(e, state);
        });
    }

    // Make sure there is pubkey, or wait for parent load to be finished
    if (!$scope.node.pubkey) {
      return $timeout(function () {
        return $scope.enter(e, state);
      }, 500);
    }

    // load
    return $scope.load();
  };
  $scope.$on('$csExtension.enter', $scope.enter);

  $scope.load = function() {
    if (!$scope.node.currency && !$scope.node.pubkey) return;
    console.info("[Graph] [peer] Loading blocks count for [{0}]".format($scope.node.pubkey.substr(0, 8)));

    return gpData.node.blockCount($scope.node.currency, $scope.node.pubkey)
      .then(function(count) {
        $scope.blockCount = count;
        $scope.loading = false;
      });
  };
}


function GpNetworkStatsController($scope, $controller, $q, $state, $translate, gpColor, esHttp) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('GpDocStatsCtrl', {$scope: $scope}));

  $scope.chartIdPrefix = 'network-chart-stats-';
  $scope.apis = [
    {
      name: 'BASIC_MERKLED_API',
      color: gpColor.rgba.calm()
    },
    {
      name: 'BMAS',
      color: gpColor.rgba.calm()
    },
    {
      name: 'BMATOR',
      color: gpColor.rgba.calm()
    },
    {
      name: 'WS2P',
      color: gpColor.rgba.balanced()
    },
    {
      name: 'GVA',
      color: gpColor.rgba.energized()
    },
    {
      name: 'GVASUB',
      color: gpColor.rgba.energized()
    }
  ];

  var inheritedInit = $scope.init;
  $scope.init = function(e, state) {
    var currency = $scope.formData.currency;
    if (!currency) throw Error('Missing formData.currency!');

    inheritedInit(e, state);

    if (state && state.stateParams) {

    }

    $scope.formData.index = currency;
    $scope.formData.types = ['peer'];

    $scope.charts = [

      // Count by api
      {
        id: currency + '_peer',
        title: 'GRAPH.NETWORK.ENDPOINT_COUNT_TITLE',
        series: _.map($scope.apis, function (api) {
          return {
            key: currency + '_peer_' + api.name.toLowerCase(),
            label: api.name,
            color: api.color,
            pointHoverBackgroundColor: api.color,
          };
        })
      },

      // Delta by api
      {
        id: currency + '_peer_delta',
        title: 'GRAPH.NETWORK.ENDPOINT_DELTA_TITLE',
        series: _.map($scope.apis, function (api) {
          return {
            key: currency + '_peer_' + api.name.toLowerCase() + '_delta',
            label: api.name,
            type: 'line',
            yAxisID: 'y-axis-delta',
            color: api.color,
            pointHoverBackgroundColor: api.color,
          };
        })
      }
    ];

    $scope.formData.queryNames = $scope.charts.reduce(function(res, chart){
      return chart.series.reduce(function(res, serie) {
        var queryName = serie.key.replace(/_delta$/, '');
        return res.concat(queryName);
      }, res);
    }, []);
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
          type: 'peer',
          q: 'blockNumber:>={0} AND blockNumber:<{1}'.format(minBlockNumber, maxBlockNumber)
        });
      });
  };
}
