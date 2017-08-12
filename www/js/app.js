// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate',
  'ngApi', 'angular-cache', 'angular.screenmatch', 'angular.bind.notifier', 'ImageCropper',
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  // removeIf(no-plugin)
  'cesium.plugins',
  // endRemoveIf(no-plugin)
  'cesium.filters', 'cesium.config', 'cesium.platform', 'cesium.controllers', 'cesium.templates', 'cesium.translations', 'cesium.components', 'cesium.directives'
  ])

  // Override the automatic sync between location URL and state
  // (see watch event $locationChangeSuccess in the run() function bellow)
  .config(function ($urlRouterProvider) {
    'ngInject';

    $urlRouterProvider.deferIntercept();
  })

  .run(function($rootScope, $translate, $state, $window, $urlRouter, ionicReady,
                Device, UIUtils, $ionicConfig, PluginService, csPlatform, csWallet) {
    'ngInject';

    // Allow access to service data, from HTML templates
    $rootScope.walletData = csWallet.data;

    // Must be done before any other $stateChangeStart listeners
    csPlatform.disableChangeState();

    var preventStateChange = false; // usefull to avoid duplicate login, when a first page with auth
    $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
      if (event.defaultPrevented) return;

      var skip = !next.data || $rootScope.tour || event.currentScope.tour; // disabled for help tour
      if (skip) return;

      if (preventStateChange) {
        event.preventDefault();
        return;
      }

      var options;

      // removeIf(android)
      // removeIf(ios)
      // removeIf(firefoxos)
      // -- Automatic redirection to large state (if define) (keep this code for platforms web and ubuntu build)
      if (next.data.large && !UIUtils.screen.isSmall()) {
        event.preventDefault();
        $state.go(next.data.large, nextParams);
        return;
      }
      // endRemoveIf(firefoxos)
      // endRemoveIf(ios)
      // endRemoveIf(android)

      // If state need auth
      if (next.data.auth && !csWallet.isAuth()) {
        event.preventDefault();
        options = next.data.minData ? {minData: true} : undefined;
        preventStateChange = true;
        return csWallet.auth(options)
          .then(function() {
            preventStateChange = false;
            return $state.go(next.name, nextParams);
          })
          .catch(function(err) {
            preventStateChange = false;
            // If cancel, redirect to home, if no current state
            if (err == 'CANCELLED' && !$state.current.name) {
              return $state.go('app.home');
            }
          });
      }

      // If state need login
      else if (next.data.login && !csWallet.isLogin()) {
        event.preventDefault();
        options = next.data.minData ? {minData: true} : undefined;
        preventStateChange = true;
        return csWallet.login(options)
          .then(function() {
            preventStateChange = false;
            return $state.go(next.name, nextParams);
          })
          .catch(function(err) {
            preventStateChange = false;
            // If cancel, redirect to home, if no current state
            if (err == 'CANCELLED' && !$state.current.name) {
              return $state.go('app.home');
            }
          });
      }

      // If state need login or auth, make sure to load wallet data
      else if (next.data.login || next.data.auth)  {
        options = next.data.minData ? {minData: true} : undefined;
        if (!csWallet.isDataLoaded(options)) {
          event.preventDefault();
          return csWallet.loadData(options)
            .then(function() {
              preventStateChange = false;
              return $state.go(next.name, nextParams);
            });
        }
      }
    });

    // Leave the current page, if auth was required to access it
    csWallet.api.data.on.unauth($rootScope, function() {
      if ($state.current && $state.current.data && $state.current.data.auth) {
        $state.go('app.home');
      }
    });

    // Prevent $urlRouter's default handler from firing (don't sync ui router)
    $rootScope.$on('$locationChangeSuccess', function(event, newUrl, oldUrl) {
      if ($state.current.data && $state.current.data.silentLocationChange === true) {
        // Skipping propagation, because same URL, and state configured with 'silentLocationChange' options
        var sameUrl = oldUrl && (oldUrl.split('?')[0] === newUrl.split('?')[0]);
        if (sameUrl) event.preventDefault();
      }
    });
    // Configures $urlRouter's listener *after* the previous listener
    $urlRouter.listen();

    // Start plugins eager services
    PluginService.start();
  })
;
