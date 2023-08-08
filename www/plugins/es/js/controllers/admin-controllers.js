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
      })

      .state('app.es_peer_moderators', {
        url: "/network/data/peer/:server/moderators?ssl&tor",
        cache: false,
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/admin/view_moderators.html",
            controller: 'ESAdminViewModeratorCtrl'
          }
        },
        data: {
          silentLocationChange: true
        }
      });
  })

  .controller('ESAdminViewAbstractCtrl', ESAdminViewAbstractController)
  .controller('ESAdminViewLogCtrl', ESAdminViewLogController)
  .controller('ESAdminViewModeratorCtrl', ESAdminViewModeratorController)

;

function ESAdminViewAbstractController($scope, $q, $window, $state, UIUtils,  esHttp, csHttp) {
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

  $scope.$on('$ionicView.enter', function (e, state) {
    var isDefaultNode = !state.stateParams || !state.stateParams.server;
    var server = state.stateParams && state.stateParams.server || esHttp.server;
    var useSsl = state.stateParams && state.stateParams.ssl == "true" || (isDefaultNode ? esHttp.useSsl : false);
    var useTor = state.stateParams.tor == "true" || (isDefaultNode ? esHttp.useTor : false);

    console.info('[ES] Starting moderators view...');
    $scope.init(server, useSsl, useTor);

    return $scope.load()
      .then(function () {
        return $scope.$broadcast('$csExtension.enter', e, state);
      })
      .then(function () {
        $scope.search.loading = false;
      })
      .catch(function (err) {
        $scope.search.loading = false;
        UIUtils.onError()(err);
      });
  });

  $scope.init = function (server, useSsl, useTor) {
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

  $scope.load = function(from, size, silent) {
    // Can be override
    return $q.resolve();
  };

  $scope.toggleSort = function(sort){
    if ($scope.search.sort === sort && !$scope.search.asc) {
      $scope.search.asc = undefined;
      $scope.search.sort = undefined;
    }
    else {
      $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
      $scope.search.sort = sort;
    }
    $scope.load();
  };

  $scope.showMore = function() {
    if ($scope.search.loading) return;
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.defaultSizeLimit,
      true/*silent*/)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };
}

function ESAdminViewLogController($controller, $scope, $q, $window, $state, UIUtils) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESAdminViewAbstractCtrl', {$scope: $scope}));

  $scope.load = function(from, size, silent) {

    if (!silent && !$scope.search.loading) $scope.search.loading = true;

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
        if (items.length) {
          $scope.motion.show({
            selector: '.item',
            ink: false
          });
        }
      })
      .catch(UIUtils.onError("ADMIN.ERROR.LOAD_LOG_FAILED"));
  };

}



function ESAdminViewModeratorController($controller, $scope, $q, $window, $state, UIUtils, csWot, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESAdminViewAbstractCtrl', {$scope: $scope}));

  $scope.load = function(from, size, silent) {

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

    return $scope.node.node.moderators()
      .then(function (res) {
        var items = _.map(res && res.moderators || [], function(pubkey) {
          return {pubkey: pubkey};
        });
        return csWot.extendAll(items);
      })
      .then(function(items) {
        items = items || {};
        if (options.from === 0) {
          $scope.search.results = items;
        }
        else {
          $scope.search.results = $scope.search.results.concat(items);
        }
        $scope.search.fetchMore = items && items.length === options.size;

        // Set Motion
        if (items.length) {
          $scope.motion.show({
            selector: '.item',
            ink: false
          });
        }
      })
      .catch(UIUtils.onError("ADMIN.ERROR.LOAD_MODERATORS_FAILED"));
  };

  $scope.select = function(item) {
    var state = csWallet.isUserPubkey(item.pubkey) ? 'app.view_wallet' : 'app.wot_identity';
    $state.go(state, {pubkey: item.pubkey});
  };
}
