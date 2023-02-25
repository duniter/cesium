angular.module('cesium.es.admin.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.es_peer_log', {
        url: "/network/data/peer/:server/log?ssl&tor",
        cache: false,
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/admin/view_log.html",
            controller: 'ESAdminViewLogCtrl'
          }
        },
        data: {
          silentLocationChange: true
        }
      });
  })

  .controller('ESAdminViewLogCtrl', ESAdminViewLogController)

;

function ESAdminViewLogController($scope, $q, $window, $state, UIUtils, csWot, esHttp, csHttp) {
  'ngInject';

  $scope.node = {};
  $scope.motion = UIUtils.motion.fadeSlideIn;
  $scope.ionItemClass = 'item-border-large';
  $scope.isHttps = ($window.location.protocol === 'https:');
  $scope.defaultSizeLimit = $scope.defaultSizeLimit || (UIUtils.screen.isSmall() ? 50 : 100);
  $scope.search = {
    loading: true,
    hasMore: false,
    type: undefined, // 'text', 'last'
    text: undefined,
    results: [],
    sort: 'time',
    asc: false,
    loadingMore: false
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    var isDefaultNode = !state.stateParams || !state.stateParams.server;
    var server = state.stateParams && state.stateParams.server || esHttp.server;
    var useSsl = state.stateParams && state.stateParams.ssl == "true" || (isDefaultNode ? esHttp.useSsl : false);
    var useTor = state.stateParams.tor == "true" || (isDefaultNode ? esHttp.useTor : false);

    console.info('[ES] Starting log view...');
    $scope.init(server, useSsl, useTor);

    return $scope.load()
      .then(function() {
        return $scope.$broadcast('$csExtension.enter', e, state);
      })
      .then(function(){
        $scope.search.loading = false;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        UIUtils.onError()(err);
      });
  });

  $scope.init = function(server, useSsl, useTor) {
    if ($scope.isHttps && !useSsl) return $q.reject({message: 'ADMIN.ERROR.NO_SSL_ACCESS'});

    var node = {
      server: server,
      host: server,
      useSsl: useSsl,
      useTor: useTor
    };
    var serverParts = server.split(':');
    if (serverParts.length === 2) {
      node.host = serverParts[0];
      node.port = serverParts[1];
    }
    if (angular.isUndefined(node.port)) {
      node.port = node.useSsl ? 443 : 80;
    }
    if (esHttp.node.same(node.host, node.port, node.useSsl)) {
      $scope.node = esHttp;
    } else {
      node.url = csHttp.getUrl(node.host, node.port, undefined/*path*/, node.useSsl);

      $scope.node = angular.merge(useTor ?
          // For TOR, use a web2tor to access the endpoint
          esHttp.instance(node.host + ".to", 443, 443, true/*ssl*/, 60000 /*long timeout*/, true) :
          esHttp.instance(node.host, node.port, node.useSsl, true),
        node);
    }
    return $scope.node;
  };

  $scope.load = function(from, size) {

    var options = {};
    options.from = from || 0;
    options.size = size || $scope.defaultSizeLimit;

    options.text = $scope.search.type === 'text' && $scope.search.text && $scope.search.text.trim();

    // add sort
    if ($scope.search.sort) {
      options.sort = {};
      options.sort[$scope.search.sort] = (!$scope.search.asc ? "desc" : "asc");
    }
    else { // default sort
      options.sort = {time:'desc'};
    }

    return $scope.node.log.request.search(options)
      .then(function(items) {
        items = items || [];
        if (options.from === 0) {
          $scope.search.results = items;
        }
        else {
          $scope.search.results = $scope.search.results.concat(items);
        }
        $scope.search.fetchMore = items && items.length === options.size;

        // Set Motion
        $scope.motion.show({
          selector: '.item',
          ink: false
        });
      })
      .catch(UIUtils.onError("ADMIN.ERROR.LOAD_LOG_FAILED"));
  };

  $scope.selectPeer = function(peer) {
    // Skip offline
    if (!peer.online ) return;

    var stateParams = {server: peer.getServer()};
    if (peer.isSsl()) {
      stateParams.ssl = true;
    }
    if (peer.isTor()) {
      stateParams.tor = true;
    }
    $state.go('app.view_es_peer', stateParams);
  };

  /* -- manage link to raw document -- */

  $scope.openRawPeering = function(event) {
    return $scope.openLink(event, $scope.node.url + '/network/peering?pretty');
  };

  $scope.openRawCurrentBlock = function(event) {
    return $scope.openLink(event, $scope.node.url + '/network/peering?pretty');
  };
}
