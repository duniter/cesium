
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
        }
      })
    ;
  })

  .controller('NotificationsCtrl', NotificationsController)

  .controller('PopoverNotificationsCtrl', PopoverNotificationsController)

;

function NotificationsController($scope, $rootScope, $ionicPopover, $state, $timeout, UIUtils, esHttp, csSettings, csWallet, esNotification) {
  'ngInject';

  var defaultSearchLimit = 40;

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

  $scope.$on('$ionicView.enter', function() {
    if ($scope.search.loading) {
      $scope.load();

      // Reset unread counter
      $timeout(function() {
        $scope.resetUnreadCount();
      }, 1000);
    }
  });

  $scope.load = function(from, size) {
    var options = angular.copy($scope.search.options);
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;
    $scope.search.loading = true;
    return esNotification.load(csWallet.data.pubkey, options)
      .then(function(res) {
        if (!from) {
          $scope.search.results = res || [];
        }
        else if (res){
          $scope.search.results = $scope.search.results.concat(res);
        }
        $scope.search.loading = false;
        $scope.search.hasMore = $scope.search.results.length >= $scope.search.limit;
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!from) {
          $scope.search.results = [];
        }
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
    $scope.hideActionsPopover();

    if (!$scope.search.results.length) return;

    UIUtils.loading.show()
      .then(function() {
        $rootScope.walletData.notifications.unreadCount = 0;
        var lastNotification = $scope.search.results[0];
        $rootScope.walletData.notifications.readTime = lastNotification ? lastNotification.time : 0;
        _.forEach($scope.search.results, function (item) {
          if (item.markAsRead && typeof item.markAsRead == 'function') item.markAsRead();
        });

        return UIUtils.loading.hide();
      });
  };

  $scope.resetUnreadCount = function() {
    if (!csWallet.data.notifications.unreadCount || !$scope.search.results || !$scope.search.results.length) return;
    csWallet.data.notifications.unreadCount = 0;
    var lastNotification = $scope.search.results[0];
    var readTime = lastNotification.time ? lastNotification.time : 0;
    if (readTime && (!csSettings.data.wallet || csSettings.data.wallet.notificationReadTime != readTime)) {
      csSettings.data.wallet = csSettings.data.wallet || {};
      csSettings.data.wallet.notificationReadTime = readTime;
      csSettings.store();
    }
  };

  $scope.select = function(item) {
    if (item.markAsRead && typeof item.markAsRead == 'function') item.markAsRead();
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

  csWallet.api.data.on.logout($scope, $scope.resetData);
  esHttp.api.node.on.stop($scope, $scope.resetData);
  esHttp.api.node.on.start($scope, $scope.load);
  esNotification.api.data.on.new($scope, $scope.onNewNotification);
}

function PopoverNotificationsController($scope, $timeout, $controller, UIUtils, $state) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('NotificationsCtrl', {$scope: $scope}));

  // Disable list motion
  $scope.motion = null;

  $scope.$on('popover.shown', function() {
    if ($scope.search.loading) {
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

  $scope.select = function(notification) {
    if (!notification) return; // no selection
    if (notification.markAsRead && typeof notification.markAsRead == 'function') notification.markAsRead();
    if (notification.state) {
      $state.go(notification.state, notification.stateParams);
    }
    $scope.closePopover(notification);
  };
}
