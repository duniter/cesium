
angular.module('cesium.graph.network.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider
        .extendState('app.network', {
          points: {
            'buttons': {
              templateUrl: "plugins/graph/templates/network/view_network_extend.html",
              controller: 'GpNetworkViewExtendCtrl'
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
        });
    }
  })

  .controller('GpNetworkViewExtendCtrl', GpNetworkViewExtendController)

  .controller('GpPeerViewExtendCtrl', GpPeerViewExtendController)

;


function GpNetworkViewExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}

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
