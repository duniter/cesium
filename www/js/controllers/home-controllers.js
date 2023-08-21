angular.module('cesium.home.controllers', ['cesium.platform', 'cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider


      .state('app.home', {
        url: "/home?error&uri&login",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HomeCtrl'
          }
        }
      });

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('HomeCtrl', HomeController)
;

function HomeController($scope, $state, $timeout, $interval, $ionicHistory, $translate, $http, $q, $location,
                        UIUtils, BMA, Device, csConfig, csHttp, csCache, csPlatform, csNetwork, csCurrency, csSettings, csWallet) {
  'ngInject';

  $scope.loading = true;
  $scope.loadingPct = 0;
  $scope.loadingMessage = '';
  $scope.locales = angular.copy(csSettings.locales);
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.showInstallHelp = false;
  $scope.showFeed = false;

  $scope.enter = function(e, state) {
    if (ionic.Platform.isIOS() && window.StatusBar) {
      // needed to fix Xcode 9 / iOS 11 issue with blank space at bottom of webview
      // https://github.com/meteor/meteor/issues/9041
      StatusBar.overlaysWebView(false);
      StatusBar.overlaysWebView(true);
    }

    if (state && state.stateParams && state.stateParams.uri) {
      return $scope.handleUri(state.stateParams.uri)
        .then(function() {
          $scope.loading = false;
        });
    }
    else if (state && state.stateParams && state.stateParams.error) { // Error query parameter
      $scope.error = state.stateParams.error;
      $scope.node = csCurrency.data.node;
      $scope.loading = false;
      $scope.cleanLocationHref(state);
      return $q.when();
    }
    else {

      // Loading progress percent
      var startTime = Date.now();
      var interval = $interval(function(){
        var duration = Date.now() - startTime;
        var timeout = Math.max(csNetwork.data.timeout, duration);
        // Waiting to start
        if (!$scope.loadingMessage) {
          $scope.loadingPct = Math.min($scope.loadingPct + 0.5, 98);
        }
        else if (duration < timeout) {
          var loadingPct = Math.min(duration / timeout * 100, 98);
          if (loadingPct > $scope.loadingPct) {
            $scope.loadingPct = loadingPct;
          }
        }
        $scope.$broadcast('$$rebind::loading'); // force rebind loading
      }, 200);

      var hasLoginParam = state && state.stateParams && state.stateParams.login || false;

      // Wait platform to be ready
      return csPlatform.ready()
        .catch(function(err) {
          $scope.node =  csCurrency.data.node;
          $scope.error = err;
        })
        .then(function() {
          // Stop progression
          $interval.cancel(interval);
          // Mark as loaded
          $scope.loading = false;
          $scope.loadingMessage = '';
          $scope.loadingPct = 100;
          $scope.$broadcast('$$rebind::loading'); // force rebind loading
          $scope.$broadcast('$$rebind::feed'); // force rebind feed

          // Open the login modal
          if (hasLoginParam && !csWallet.isLogin() && !$scope.error) {
            $scope.cleanLocationHref(state);

            return csWallet.login();
          }
        });
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.reload = function() {
    $scope.loading = true;
    $scope.loadingPct = 0;
    $scope.loadingMessage = '';
    delete $scope.error;

    $timeout($scope.enter, 200);
  };

  /**
   * Catch click for quick fix
   * @param action
   */
  $scope.doQuickFix = function(action) {
    if (action === 'settings') {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      $state.go('app.settings');
    }
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
    $scope.hideLocalesPopover();
    csSettings.data.locale = _.findWhere($scope.locales, {id: langKey});
    csSettings.store();
  };

  $scope.toggleFeed = function(show) {

    $scope.showFeed = (show !== undefined) ? show : !$scope.showFeed;
    if (!this.loading) {
      $scope.$broadcast('$$rebind::feed'); // force rebind feed
    }
  };

  /* -- show/hide locales popup -- */

  $scope.showLocalesPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'templates/common/popover_locales.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.localesPopover = popover;
      }
    });
  };

  $scope.hideLocalesPopover = function() {
    if ($scope.localesPopover) {
      $scope.localesPopover.hide();
      $scope.localesPopover = null;
    }
  };

  // remove '?uri&error' from the location URI, and inside history
  $scope.cleanLocationHref = function(state) {
    state = state || {stateName: 'app.home'};
    state.stateParams = state.stateParams || {};
    if (state && state.stateParams) {
      var stateParams = angular.copy(state.stateParams);
      delete stateParams.uri;
      delete stateParams.error;
      delete stateParams.login;

      $location.search(stateParams).replace();

      // Update location href
      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: false,
        historyRoot: false
      });
      return $state.go(state.stateName, stateParams, {
          reload: false,
          inherit: false,
          notify: false
        });
    }
  };

  // Listen platform messages
  csPlatform.api.start.on.message($scope, function(message) {
    $scope.loadingMessage = message;
  });

  // Listen network offline/online
  Device.api.network.on.offline($scope, function() {
    csPlatform.stop();
    $scope.loadingMessage = '';
    $scope.loading = false;
    $scope.node =  csCurrency.data.node;
    $scope.error = true;
  });
  Device.api.network.on.online($scope, function() {
    if (!$scope.loading && $scope.error) {
      delete $scope.error;
      $scope.reload();
    }
  });

  // For DEV ONLY
  /*$timeout(function() {
   $scope.loginAndGo();
   }, 500);*/
}
