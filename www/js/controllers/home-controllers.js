angular.module('cesium.home.controllers', ['cesium.platform', 'cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider


      .state('app.home', {
        url: "/home?error&uri",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HomeCtrl'
          }
        }
      })

    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('HomeCtrl', HomeController)
;

function HomeController($scope, $state, $timeout, $ionicHistory, $translate, $http, UIUtils, BMA,
                        csConfig, csCache, csPlatform, csCurrency, csSettings, csHttp) {
  'ngInject';

  $scope.loading = true;
  $scope.locales = angular.copy(csSettings.locales);
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.showInstallHelp = false;

  $scope.enter = function(e, state) {
    if (ionic.Platform.isIOS()) {
      if(window.StatusBar) {
        // needed to fix Xcode 9 / iOS 11 issue with blank space at bottom of webview
        // https://github.com/meteor/meteor/issues/9041
        StatusBar.overlaysWebView(false);
        StatusBar.overlaysWebView(true);
      }
    }

    if (state && state.stateParams && state.stateParams.uri) {
      return $scope.redirectFromUri(state.stateParams.uri);
    }
    else if (state && state.stateParams && state.stateParams.error) { // Error query parameter
      $scope.error = state.stateParams.error;
      $scope.node = csCurrency.data.node;
      $scope.loading = false;
      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: true,
        historyRoot: true
      });
      $state.go('app.home', {error: undefined}, {
        reload: false,
        inherit: true,
        notify: false});
    }
    else {
      // Wait platform to be ready
      csPlatform.ready()
        .then(function() {
          $scope.loading = false;
          $scope.loadFeeds();
        })
        .catch(function(err) {
          $scope.node =  csCurrency.data.node;
          $scope.loading = false;
          $scope.error = err;
        });
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.reload = function() {
    $scope.loading = true;
    delete $scope.error;

    $timeout($scope.enter, 200);
  };

  $scope.loadFeeds = function() {
    var feedUrl = csSettings.getFeedUrl();
    if (!feedUrl || typeof feedUrl !== 'string') return; // Skip

    var maxContentLength = (csConfig.feed && csConfig.feed.maxContentLength) || 650;

    var now = Date.now();
    console.debug("[home] Loading feeds from {0}...".format(feedUrl));

    $http.get(feedUrl, {responseType: 'json', cache: csCache.get(null, csCache.constants.LONG)})
      .success(function(feed) {
        console.debug('[home] Feeds loaded in {0}ms'.format(Date.now()-now));
        if (!feed || !feed.items || !feed.items.length) return; // skip if empty

        feed.items = feed.items.reduce(function(res, item) {
          if (!item || (!item.title && !item.content_text && !item.content_html)) return res; // Skip

          // Convert UTC time
          if (item.date_published) {
            item.time = moment.utc(item.date_published).unix();
          }
          // Convert content to HTML
          if (item.content_html) {
            item.content = item.content_html;
          }
          else {
            item.content = (item.content_text||'').replace(/\n/g, '<br/>');
          }

          // Trunc content, if need
          if (maxContentLength !== -1 && item.content && item.content.length > maxContentLength) {
            var endIndex = Math.max(item.content.lastIndexOf(" ", maxContentLength), item.content.lastIndexOf("<", maxContentLength));
            item.content = item.content.substr(0, endIndex) + ' (...)';
            item.truncated = true;
          }

          // If author is missing, copy the main author
          item.author = item.author || feed.author;

          return res.concat(item);
        }, []);

        $scope.feed = feed;
      })
      .error(function(data, status) {
        console.error('[home] Failed to load feeds.');
        $scope.feed = null;
      });
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
    $scope.loadFeeds();
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

  /**
   * Parse an URI (see g1lien)
   * @param uri
   * @returns {*}
   */
  $scope.redirectFromUri = function(uri) {
    console.debug("[home] Detecting external uri: ", uri);
    var parts = csHttp.uri.parse(uri);

    var state,stateParams;

    if (parts.protocol === 'g1:' || parts.protocol === 'june:') {
      console.debug("[home] Applying uri...", parts);

      // Pubkey
      if (parts.hostname && BMA.regexp.PUBKEY.test(parts.hostname)) {
        state = 'app.wot_identity';
        stateParams = {pubkey: parts.hostname};
      }
      else if ((parts.hostname === 'wallet' || parts.hostname === 'pubkey') && BMA.regexp.PUBKEY.test(parts.pathSegments[0])) {
        state = 'app.wot_identity';
        stateParams = {pubkey: parts.pathSegments[0]};
      }

      // Block
      else if (parts.hostname === 'block') {
        state = 'app.view_block';
        stateParams = {number: parts.pathSegments[0]};
      }

      // Otherwise, try to a wot lookup
      else if (parts.hostname && BMA.regexp.USER_ID.test(parts.hostname)) {
        state = 'app.wot_lookup.tab_search';
        stateParams = {q: parts.hostname};
      }
    }

    if (state === 'app.wot_identity' && parts.searchParams && (angular.isDefined(parts.searchParams.action) || angular.isDefined(parts.searchParams.amount))) {
      stateParams = angular.merge(stateParams,
        // Add default actions
        { action: 'transfer'},
        // Add path params
        parts.searchParams);
    }

    // Open the state
    if (state) {
      $ionicHistory.clearHistory();
      $ionicHistory.nextViewOptions({
        disableAnimate: false,
        disableBack: true,
        historyRoot: true
      });
      return $state.go(state, stateParams, {
        reload: true,
        inherit: false,
        notify: true
      });
    }
    else {
      console.error("[home] Unknown URI format: " + uri);
      this.loading = false;
      return UIUtils.alert.error("ERROR.UNKNOWN_URI_FORMAT", uri);
    }
  };

  // For DEV ONLY
  /*$timeout(function() {
   $scope.loginAndGo();
   }, 500);*/
}
