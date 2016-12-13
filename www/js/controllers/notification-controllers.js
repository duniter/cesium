
angular.module('cesium.notification.controllers', ['cesium.services'])


  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

      .state('app.view_notifications', {
        url: "/notifications",
        views: {
          'menuContent': {
            templateUrl: "templates/common/view_notifications.html",
            controller: 'NotificationsCtrl'
          }
        }
      })
    ;


  })

  .controller('NotificationsCtrl', NotificationsController)

  .controller('PopoverNotificationsCtrl', PopoverNotificationsController)

;

function NotificationsController($scope, $rootScope, $timeout, UIUtils, $state, csWallet, csSettings) {

  var defaultSearchLimit = 40;

  $scope.search = {
    loading : true,
    results: [],
    hasMore : true,
    loadingMore : false,
    limit: defaultSearchLimit
  };

  $scope.$on('$ionicView.enter', function() {
    if ($scope.search.loading) {
      $scope.load();
    }
  });

  $scope.load = function(from, size) {
    from = from || 0;
    size = size || defaultSearchLimit;
    return csWallet.refreshData({
      notifications: {
        enable: true,
        from: from,
        size: size
      }
    })
    .then(function(data) {
      if (from === 0) {
        $scope.search.results = data.notifications.history;
      }
      $scope.search.loading = false;
      $scope.search.hasMore = ($scope.search.results && $scope.search.results.length >= $scope.search.limit);
      $scope.updateView();
    })
    .catch(function(err) {
      $scope.search.loading = false;
      $scope.search.results = [];
      $scope.search.hasMore = false;
      UIUtils.onError('ERROR.LOAD_NOTIFICATIONS_FAILED')(err);
    });
  };

  $scope.updateView = function() {

    // Set Motion and Ink
    $timeout(function() {
      UIUtils.motion.fadeSlideInRight();
      UIUtils.ink({selector: '#notification .item.ink'});
    }, 100);
  };

  $scope.markAllAsRead = function() {
    $rootScope.walletData.notifications.unreadCount = 0;
    var lastNotification = $rootScope.walletData.notifications.history[0];
    $rootScope.walletData.notifications.readTime = lastNotification ? lastNotification.time : 0;
    _.forEach($rootScope.walletData.notifications.history, function (item) {
      if (item.onRead && typeof item.onRead == 'function') item.onRead();
    });
  };

  $scope.onSelect = function(item) {
    if (item.onRead && typeof item.onRead == 'function') item.onRead();
    if (item.state) {
      $state.go(item.state, item.stateParams);
    }
  };

  $scope.showMore = function() {
    $scope.search.limit = $scope.search.limit || defaultSearchLimit;
    $scope.search.limit = $scope.search.limit * 2;
    if ($scope.search.limit < defaultSearchLimit) {
      $scope.search.limit = defaultSearchLimit;
    }
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.search.limit)
    .then(function() {
      $scope.search.loadingMore = false;
    });
  };

}


function PopoverNotificationsController($scope, $rootScope, $timeout, UIUtils, $state, csWallet, csSettings) {

  NotificationsController.call(this, $scope, $rootScope, $timeout, UIUtils, $state, csWallet, csSettings);

  $scope.updateView = function() {
    // Set Ink
    $timeout(function() {
      UIUtils.ink({selector: '.popover-notification .item.ink'});
    }, 100);
  };

  if ($scope.search.loading || !csWallet.data.notifications.history || !csWallet.data.notifications.history.length) {
    $scope.load();
  }

}
