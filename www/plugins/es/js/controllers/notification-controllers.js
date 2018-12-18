
angular.module('cesium.es.notification.controllers', ['cesium.es.services'])


  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.view_notifications', {
        url: "/notifications",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/notification/view_notifications.html",
            controller: 'NotificationsCtrl'
          }
        },
        data: {
          login: true
        }
      })
      .state('app.view_notifications_by_id', {
        url: "/wallets/:id/notifications",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/notification/view_notifications.html",
            controller: 'NotificationsCtrl'
          }
        },
        data: {
          login: true
        }
      })
    ;
  })

  .controller('NotificationsCtrl', NotificationsController)

  .controller('PopoverNotificationsCtrl', PopoverNotificationsController)

;

function NotificationsController($scope, $ionicPopover, $state, $timeout, UIUtils, esHttp, csWallet, esNotification) {
  'ngInject';

  var defaultSearchLimit = 40;

  $scope.preventSelect = false;
  $scope.search = {
    loading : true,
    results: null,
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit,
    options: {
      codes: {
        excludes: esNotification.constants.EXCLUDED_CODES
      }
    }
  };
  $scope.listeners = [];

  var wallet;

  $scope.setWallet = function(aWallet) {
    wallet = aWallet;
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    if ($scope.search.loading) {

      wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
      if (!wallet) {
        UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
        return $scope.showHome();
      }

      wallet.login({
        minData: true
      })
        .then(function() {
          $scope.load();
          UIUtils.loading.hide();

          $scope.addListeners();

          // Reset unread counter
          return $timeout(function() {
            $scope.resetUnreadCount();
          }, 1000);
        });
    }
  });

  $scope.refresh = function(silent) {
    return $scope.load(undefined, undefined, silent);
  };

  $scope.load = function(from, size, silent) {
    // Make sure wallet is init (need by PopoverInvitationCtrl)
    wallet = wallet || csWallet;

    if (!wallet.data.pubkey) {
      $scope.search.loading = true;
      return;
    }

    $scope.search.preventSelect = true;

    var options = angular.copy($scope.search.options);
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;
    options.pubkey = wallet.data.pubkey;
    $scope.search.loading = !silent;
    return esNotification.load(options)
      .then(function(res) {
        if (!options.from) {
          $scope.search.results = res || [];
        }
        else if (res){
          $scope.search.results = $scope.search.results.concat(res);
        }
        $scope.search.loading = false;
        $scope.search.preventSelect = false;
        $scope.search.hasMore = $scope.search.results.length >= $scope.search.limit;
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!options.from) {
          $scope.search.results = [];
        }
        $scope.search.preventSelect = false;
        $scope.search.hasMore = false;
        UIUtils.onError('COMMON.NOTIFICATIONS.LOAD_NOTIFICATIONS_FAILED')(err);
      });
  };

  $scope.updateView = function() {
    if ($scope.motion && $scope.motion.ionListClass && $scope.search.results.length) {
      $scope.motion.show({selector: '.view-notification .item'});
    }
  };

  $scope.markAllAsRead = function() {
    // Make sure to be auth before doing this
    if (!wallet.isAuth()) {
      return wallet.auth().then(function(){
        UIUtils.loading.hide();
        return $scope.markAllAsRead(); // loop
      });
    }

    $scope.hideActionsPopover();

    if (!$scope.search.results.length) return;

    UIUtils.loading.show()
      .then(function() {
        wallet.data.notifications.unreadCount = 0;
        var lastNotification = $scope.search.results[0];
        wallet.data.notifications.readTime = lastNotification ? lastNotification.time : 0;
        _.forEach($scope.search.results, function (item) {
          if (item.markAsRead && typeof item.markAsRead == 'function') item.markAsRead();
        });

        return UIUtils.loading.hide();
      });
  };

  $scope.resetUnreadCount = function() {
    if ($scope.search.loading || !wallet.data.notifications) {
      return $timeout($scope.resetUnreadCount, 2000);
    }
    if (!wallet.data.notifications.unreadCount || !$scope.search.results || !$scope.search.results.length) return;
    wallet.data.notifications.unreadCount = 0;
    var lastNotification = $scope.search.results[0];
    var readTime = lastNotification.time ? lastNotification.time : 0;
    if (readTime && (!wallet.data.notifications.readTime || wallet.data.notifications.readTime != readTime)) {
      wallet.data.notifications.readTime = readTime;
      wallet.storeData();
    }
  };

  $scope.select = function(event, item) {

    if ($scope.search.loading || event.preventDefault() || $scope.search.preventSelect) return;

    if (item.markAsRead && typeof item.markAsRead == 'function') {
      $timeout(item.markAsRead);
    }
    if (item.state) {
      $state.go(item.state, item.stateParams);
    }
  };

  $scope.showMore = function() {
    $scope.search.limit = $scope.search.limit || defaultSearchLimit;
    $scope.search.limit += defaultSearchLimit;
    if ($scope.search.limit < defaultSearchLimit) {
      $scope.search.limit = defaultSearchLimit;
    }
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.search.limit)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  // Listen notifications changes
  $scope.onNewNotification = function(notification) {
    if ($scope.search.loading || $scope.search.loadingMore) return;

    // Retrieve insertion index
    var nextIndex = _.findIndex($scope.search.results, function(n) {
      return notification.time > n.time;
    });
    if (nextIndex < 0) nextIndex = 0;

    // Update the array
    $scope.search.results.splice(nextIndex,0,notification);
    $scope.updateView();
  };

  $scope.resetData = function() {
    if ($scope.search.loading) return;
    console.debug("[ES] [notifications] Resetting data (settings or account may have changed)");
    $scope.search.hasMore = false;
    $scope.search.results = [];
    $scope.search.loading = true;
    delete $scope.search.limit;
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/notification/popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  /* -- listeners -- */

  $scope.addListeners = function() {
    if (!wallet) throw "Controller wallet not set !";

    $scope.listeners = [
      esHttp.api.node.on.stop($scope, $scope.resetData),
      esHttp.api.node.on.start($scope, $scope.load),
      wallet.api.data.on.logout($scope, $scope.resetData)
    ];

    if (wallet.isDefault()) {
      // Subscribe to new notification
      $scope.listeners.push(
        esNotification.api.data.on.new($scope, $scope.onNewNotification)
      );
    }
  };

  $scope.removeListeners = function() {
    _.forEach($scope.listeners, function(remove){
      remove();
    });
    $scope.listeners = [];
  };
}

function PopoverNotificationsController($scope, $timeout, $controller, $state,
                                        UIUtils, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('NotificationsCtrl', {$scope: $scope}));

  // Disable list motion
  $scope.motion = null;

  // Set the wallet to use
  $scope.setWallet(csWallet);

  $scope.$on('popover.shown', function() {
    if ($scope.search.loading) {
      $scope.addListeners();
      $scope.load();
    }
  });

  $scope.updateView = function() {
    if (!$scope.search.results.length) return;

    // Set Ink
    $timeout(function() {
      UIUtils.ink({selector: '.popover-notification .item.ink'});
    }, 100);
  };

  $scope.$on('popover.hidden', $scope.resetUnreadCount);

  $scope.select = function($event, notification) {
    if ($event.preventDefault() || !notification) return; // no selection
    if (notification.markAsRead && typeof notification.markAsRead == 'function') notification.markAsRead();
    if (notification.state) {
      $state.go(notification.state, notification.stateParams);
    }
    $scope.closePopover(notification);
  };
}
