angular.module('cesium.es.invitation.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.view_invitations', {
        url: "/invitations",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/invitation/view_invitations.html",
            controller: 'InvitationsCtrl'
          }
        }
      })
    ;
  })

  .controller('InvitationsCtrl', InvitationsController)

  .controller('PopoverInvitationCtrl', PopoverInvitationController)

;

function InvitationsController($scope, $q, $ionicPopover, $state, $timeout, UIUtils, csSettings, csWallet, esHttp, esNotification, esInvitation) {
  'ngInject';

  var defaultSearchLimit = 5;

  $scope.search = {
    loading : true,
    results: null,
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit,
    options: {
      codes: {
        includes: esNotification.constants.INVITATION_CODES
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

      $scope.showFab('fab-new-invitation');
    }
  });

  $scope.load = function(from, size) {
    var options = angular.copy($scope.search.options);
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;

    return esInvitation.load(csWallet.data.pubkey, options)
      .then(function(invitations) {
        if (!from) {
          $scope.search.results = invitations;
        }
        else {
          $scope.search.results = $scope.search.results.concat(invitations);
        }
        $scope.search.loading = false;
        $scope.search.hasMore = ($scope.search.results && $scope.search.results.length >= $scope.search.limit);
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!from) {
          $scope.search.results = [];
        }
        $scope.search.hasMore = false;
        UIUtils.onError('INVITATION.ERROR.LOAD_INVITATIONS_FAILED')(err);
      });
  };

  $scope.updateView = function() {
    if ($scope.motion && $scope.search.results && $scope.search.results.length) {
      $scope.motion.show({selector: '.view-invitation .item'});
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
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.onNewInvitation = function(invitation) {
    if ($scope.search.loading || $scope.search.loadingMore) return;
    $scope.search.results.splice(0,0,invitation);
    $scope.updateView();
  };

  $scope.resetData = function() {
    if ($scope.search.loading) return;
    console.debug("[ES] [invitation] Resetting data (settings or account may have changed)");
    $scope.search.hasMore = false;
    $scope.search.results = [];
    $scope.search.loading = true;
    delete $scope.search.limit;
  };

  $scope.resetUnreadCount = function() {
    if (!csWallet.data.invitations.unreadCount) return;
    csWallet.data.invitations.unreadCount = 0;
    if (!$scope.search.results || !$scope.search.results.length) return;
    var lastNotification = $scope.search.results[0];
    var readTime = lastNotification.time ? lastNotification.time : 0;
    if (readTime && (!csSettings.data.plugins.es.invitations || csSettings.data.plugins.es.invitations.readTime != readTime)) {
      csSettings.data.plugins.es.invitations = csSettings.data.plugins.es.invitations || {};
      csSettings.data.plugins.es.invitations.readTime = readTime;
      csSettings.store();
    }
  };

  $scope.deleteAll = function(confirm) {
    $scope.hideActionsPopover();
    if (!$scope.search.results.length) return;

    if (!confirm) {
      return UIUtils.alert.confirm('INVITATION.CONFIRM.DELETE_ALL_CONFIRMATION')
        .then(function(confirm) {
          if (confirm) return $scope.deleteAll(confirm); // recursive call
        });
    }

    return $q.all([
        UIUtils.loading.show(),
        esInvitation.deleteAll(csWallet.data.pubkey)
      ])
      .then(function() {
        $scope.search.results.splice(0, $scope.search.results.length); // update list
        return UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('INVITATION.ERROR.REMOVE_ALL_INVITATIONS_FAILED'));
  };

  $scope.delete = function(index) {
    var invitation = $scope.search.results[index];
    if (!invitation) return;

    return esInvitation.delete(invitation)
      .then(function() {
        $scope.search.results.splice(index,1); // update list
      })
      .catch(UIUtils.onError('INVITATION.ERROR.REMOVE_INVITATION_FAILED'));
  };

  $scope.accept = function(invitation) {
    $scope.hideActionsPopover(); // useful in PopoverInvitationController

    if (invitation.type == 'certification') {
      $state.go('app.wot_identity', {
        uid: invitation.uid,
        pubkey: invitation.pubkey,
        action: 'certify'
      });
    }
  };

  /* -- Modal -- */

  $scope.showNewInvitationModal = function() {
    $scope.hideActionsPopover();

  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/invitation/popover_actions.html', {
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


  // Listeners
  csWallet.api.data.on.logout($scope, $scope.resetData);
  esHttp.api.node.on.stop($scope, $scope.resetData);
  esHttp.api.node.on.start($scope, $scope.load);
  esInvitation.api.data.on.new($scope, $scope.onNewInvitation);

}

function PopoverInvitationController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('InvitationsCtrl', {$scope: $scope}));

  // Disable list effects
  $scope.motion = null;

  $scope.$on('popover.shown', function() {
    if ($scope.search.loading) {
      $scope.load();
    }
  });

  $scope.updateView = function() {
    // no animation
  };

  $scope.$on('popover.hidden', $scope.resetUnreadCount);

  $scope.hideActionsPopover = function() {
    $scope.closePopover();
  };
}

