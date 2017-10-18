angular.module('cesium.app.controllers', ['cesium.platform', 'cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/menu.html",
        controller: 'AppCtrl',
        data: {
          large: false
        }
      })

      .state('app.home', {
        url: "/home?error",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HomeCtrl'
          }
        }
      })

      .state('app.lock', {
        cache: false,
        url: "/lock",
        views: {
          'menuContent': {
            templateUrl: "templates/common/view_passcode.html",
            controller: 'PassCodeCtrl'
          }
        }
      })
    ;

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');

  })

  .controller('AppCtrl', AppController)

  .controller('HomeCtrl', HomeController)

  .controller('PluginExtensionPointCtrl', PluginExtensionPointController)



;

/**
 * Useful controller that could be reuse in plugin, using $scope.extensionPoint for condition rendered in templates
 */
function PluginExtensionPointController($scope, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
}

/**
 * Abstract controller (inherited by other controllers)
 */
function AppController($scope, $rootScope, $state, $ionicSideMenuDelegate, $q, $timeout,
                       $ionicHistory, $controller, $window, csPlatform,
                       UIUtils, BMA, csWallet, Device, Modals, csConfig, csHttp
) {
  'ngInject';

  $scope.search = {};
  $scope.login = csWallet.isLogin();
  $scope.auth = csWallet.isAuth();
  $scope.motion = UIUtils.motion.default;

  $scope.showHome = function() {
    $ionicHistory.nextViewOptions({
      historyRoot: true
    });
    return $state.go('app.home')
      .then(UIUtils.loading.hide);
  };

  ////////////////////////////////////////
  // Device Methods
  ////////////////////////////////////////

  $scope.scanQrCodeAndGo = function() {
    if (!Device.barcode.enable) {
      return;
    }
    Device.barcode.scan()
      .then(function(uri) {
        if (!uri) {
          return;
        }
        BMA.uri.parse(uri)
          .then(function(result){
            // If pubkey
            if (result && result.pubkey) {
              $state.go('app.wot_identity', {
                pubkey: result.pubkey,
                node: result.host ? result.host: null}
              );
            }
            else {
              UIUtils.alert.error(result, 'ERROR.SCAN_UNKNOWN_FORMAT');
            }
          })
          .catch(UIUtils.onError('ERROR.SCAN_UNKNOWN_FORMAT'));
      })
      .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };

  ////////////////////////////////////////
  // Show Help tour
  ////////////////////////////////////////

  $scope.createHelptipScope = function(isTour) {
    if (!isTour && ($rootScope.tour || !$rootScope.settings.helptip.enable || UIUtils.screen.isSmall())) {
      return; // avoid other helptip to be launched (e.g. csWallet)
    }
    // Create a new scope for the tour controller
    var helptipScope = $scope.$new();
    $controller('HelpTipCtrl', { '$scope': helptipScope});
    return helptipScope;
  };

  $scope.startHelpTour = function(skipClearCache) {
    $rootScope.tour = true; // to avoid other helptip to be launched (e.g. csWallet)

    //
    if (!skipClearCache) {
      $ionicHistory.clearHistory();
      return $ionicHistory.clearCache()
        .then(function() {
          $scope.startHelpTour(true/*continue*/);
        });
    }

    var helptipScope = $scope.createHelptipScope(true);
    return helptipScope.startHelpTour()
      .then(function() {
        helptipScope.$destroy();
        delete $rootScope.tour;
      })
      .catch(function(err){
        delete $rootScope.tour;
      });
  };

  ////////////////////////////////////////
  // Login & wallet
  ////////////////////////////////////////

  $scope.isLogin = function() {
    return $scope.login;
  };

  $scope.showProfilePopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl :'templates/common/popover_profile.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.profilePopover = popover;
        $timeout(function() {
          UIUtils.ink({selector: '#profile-popover .ink, #profile-popover .ink-dark'});
        }, 100);
      }
    });
  };

  $scope.closeProfilePopover = function() {
    if ($scope.profilePopover && $scope.profilePopover.isShown()) {
      $timeout(function(){$scope.profilePopover.hide();});
    }
  };

  // Load wallet data (after login)
  $scope.loadWalletData = function(options) {
    return csWallet.loadData(options)

      .then(function(walletData) {
        if (walletData) {
          $rootScope.walletData = walletData;
          return walletData;
        }
        else { // cancel login
          throw 'CANCELLED';
        }
      });
  };

  // Login and load wallet
  $scope.loadWallet = function(options) {

    // Make sure the platform is ready
    if (!csPlatform.isStarted()) {
      return csPlatform.ready().then(function(){
        return $scope.loadWallet(options);
      });
    }

    options = options || {};

    // If need auth
    if (options.auth && !csWallet.isAuth()) {
      return csWallet.auth(options)
        .then(function (walletData) {
          if (walletData) return walletData;
          // failed to auth
          throw 'CANCELLED';
        });
    }

    // If need login
    else if (!csWallet.isLogin()) {
      return csWallet.login(options)
        .then(function (walletData) {
          if (walletData) return walletData;
          // failed to login
          throw 'CANCELLED';
        });
    }

    // Already login or auth
    else if (!csWallet.isDataLoaded(options)) {
      return $scope.loadWalletData(options);
    }
    else {
      return $q.when(csWallet.data);
    }
  };

  // Login and go to a state (or wallet if not)
  $scope.loginAndGo = function(state, options) {
    $scope.closeProfilePopover();

    state = state || 'app.view_wallet';

    if (!csWallet.isLogin()) {

      // Make sure to protect login modal, if HTTPS enable - fix #340
      if (csConfig.httpsMode && $window.location && $window.location.protocol !== 'https:') {
        var href = $window.location.href;
        var hashIndex = href.indexOf('#');
        var rootPath = (hashIndex != -1) ? href.substr(0, hashIndex) : href;
        rootPath = 'https' + rootPath.substr(4);
        href = rootPath + $state.href(state);
        if (csConfig.httpsModeDebug) {
          console.debug('[httpsMode] --- Should redirect to: ' + href);
          // continue
        }
        else {
          $window.location.href = href;
          return;
        }

      }

      return csWallet.login(options)
        .then(function(){
          return $state.go(state, options);
        })
        .then(UIUtils.loading.hide);
    }
    else {
      return $state.go(state, options);
    }
  };

  // Logout
  $scope.logout = function(options) {
    options = options || {};
    if (!options.force && $scope.profilePopover) {
      // Make the popover if really closed, to avoid UI refresh on popover buttons
      return $scope.profilePopover.hide()
        .then(function(){
          options.force = true;
          return $scope.logout(options);
        });
    }
    if (options.askConfirm) {
      return UIUtils.alert.confirm('CONFIRM.LOGOUT')
        .then(function(confirm) {
          if (confirm) {
            options.askConfirm=false;
            return $scope.logout(options);
          }
        });
    }

    UIUtils.loading.show();
    return csWallet.logout()
      .then(function() {
        // Close left menu if open
        if ($ionicSideMenuDelegate.isOpenLeft()) {
          $ionicSideMenuDelegate.toggleLeft();
        }
        $ionicHistory.clearHistory();

        return $ionicHistory.clearCache()
          .then(function() {
            return $scope.showHome();
          });
      })
      .catch(UIUtils.onError());
  };

  // Login and go to a state (or wallet if not)
  $scope.doAuth = function() {
    return $scope.loadWallet({auth: true})
      .then(function() {
        UIUtils.loading.hide();
      });
  };

  // If connected and same pubkey
  $scope.isUserPubkey = function(pubkey) {
    return csWallet.isUserPubkey(pubkey);
  };

  // add listener on wallet event
  csWallet.api.data.on.login($scope, function(walletData, deferred) {
    $scope.login = true;
    $rootScope.walletData = walletData || {};
    return deferred ? deferred.resolve() : $q.when();
  });
  csWallet.api.data.on.logout($scope, function() {
    $scope.login = false;
    $rootScope.walletData = {};
  });
  csWallet.api.data.on.auth($scope, function(data, deferred) {
    deferred = deferred || $q.defer();
    $scope.auth = true;
    deferred.resolve();
    return deferred.promise;
  });
  csWallet.api.data.on.unauth($scope, function() {
    $scope.auth = false;
  });

  ////////////////////////////////////////
  // Useful modals
  ////////////////////////////////////////

  // Open transfer modal
  $scope.showTransferModal = function(parameters) {
    return Modals.showTransfer(parameters);
  };

  $scope.showAboutModal = function() {
    return Modals.showAbout();
  };

  $scope.showJoinModal = function() {
    $scope.closeProfilePopover();
    return Modals.showJoin()
      .then(function(res){
        if (!res) return;
        return (res.accountType == 'member') ?
          Modals.showJoinMember(res) :
          Modals.showJoinWallet(res);
      });
  };

  $scope.showSettings = function() {
    $scope.closeProfilePopover();
    return $state.go('app.settings');
  };

  $scope.showHelpModal = function(parameters) {
    return Modals.showHelp(parameters);
  };

  ////////////////////////////////////////
  // Change node (expert mode)
  ////////////////////////////////////////

  $scope.showNodeListPopover = function(event) {
    return UIUtils.popover.show(event, {
      templateUrl: 'templates/network/popover_peer_info.html',
      autoremove: true,
      scope: $scope.$new(true)
    });
  };

  ////////////////////////////////////////
  // Link managment (fix issue #)
  ////////////////////////////////////////

  $scope.openLink = function(event, uri, options) {
    options = options || {};

    // If unable to open, just copy value
    options.onError = function() {
      return UIUtils.popover.copy(event, uri);
    };

    return csHttp.uri.open(uri, options);
  };

  ////////////////////////////////////////
  // Layout Methods
  ////////////////////////////////////////
  $scope.showFab = function(id, timeout) {
    UIUtils.motion.toggleOn({selector: '#'+id + '.button-fab'}, timeout);
  };

  $scope.hideFab = function(id, timeout) {
    UIUtils.motion.toggleOff({selector: '#'+id + '.button-fab'}, timeout);
  };

  // Could be override by subclass
  $scope.doMotion = function(options) {
    return $scope.motion.show(options);
  };
}


function HomeController($scope, $state, $timeout, $ionicHistory, csPlatform, csCurrency) {
  'ngInject';

  $scope.loading = true;

  $scope.enter = function(e, state) {
    if (state && state.stateParams && state.stateParams.error) { // Query parameter
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
      // Start platform
      csPlatform.ready()
        .then(function() {
          $scope.loading = false;
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

  /**
   * Catch click for quick fix
   * @param event
   */
  $scope.doQuickFix = function(event) {
    if (event == 'settings') {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      $state.go('app.settings');
    }
  };

  // For DEV ONLY
  /*$timeout(function() {
   $scope.loginAndGo();
   }, 500);*/
}
