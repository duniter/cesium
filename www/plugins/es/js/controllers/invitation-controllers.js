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

  .controller('ESNewInvitationModalCtrl', NewInvitationModalController)
;

function InvitationsController($scope, $q, $ionicPopover, $state, $timeout, UIUtils, csSettings, csWallet,
                               esHttp, esModals, esNotification, esInvitation) {
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

    esModals.showNewInvitation({});
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


function NewInvitationModalController($scope, $q, Modals, UIUtils, csWallet, esHttp, esWallet, esInvitation) {
  'ngInject';

  $scope.recipients = [];
  $scope.suggestions = [];
  $scope.formData = {
    useComment: false
  };

  // When changing use comment
  $scope.onUseCommentChanged = function() {
    if (!$scope.formData.useComment) {
      $scope.formData.comment = null; // reset comment only when disable
    }
  };
  $scope.$watch('formData.useComment', $scope.onUseCommentChanged, true);


  $scope.removeRecipient= function(index, e) {
    $scope.recipients.splice(index, 1);
    e.preventDefault();
  };

  $scope.removeSuggestion = function(index, e) {
    $scope.suggestions.splice(index, 1);
    e.preventDefault();
  };

  $scope.cancel = function() {
    $scope.closeModal();
  };

  $scope.doSend = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid || !$scope.recipients.length || !$scope.suggestions.length) {
      return;
    }

    if (!csWallet.isLogin()) return $scope.closeModal(); // should never happen

    return $q.all([
        // Get keypair only once (if not done here, certification.send() with compute it many times)
        esWallet.box.getKeypair(csWallet.data.keypair),
        // Ask confirmation
        UIUtils.alert.confirm('INVITATION.CONFIRM.SEND_INVITATIONS_TO_CERTIFY', undefined, {okText: 'COMMON.BTN_SEND'})
      ])
      .then(function(res) {
        if (!res) return;
        var keypair = res[0];
        var confirm = res[1];
        if (!confirm) return;
        UIUtils.loading.show();
        var time = esHttp.date.now(); // use same date for each invitation
        var comment = $scope.formData.useComment && $scope.formData.comment && $scope.formData.comment.trim();
        return $q.all(
          $scope.recipients.reduce(function (res, recipient) {
            return res.concat($scope.suggestions.reduce(function (res, identity) {
              if (!identity.uid || !identity.pubkey) {
                console.error('Unable to send suggestion for this identity (no uid or pubkey)', identity);
                return res;
              }
              var invitation = {
                issuer: csWallet.data.pubkey,
                recipient: recipient.pubkey,
                time: time,
                content: [identity.uid, identity.pubkey].join('-'),
                comment: comment
              };
              console.debug('Will send invitation:', invitation);
              return res.concat(
                esInvitation.send(invitation, keypair, 'certification'));
            }, []));
          }, []))
          .then(function() {
            $scope.closeModal();
            return UIUtils.loading.hide();
          })
          .then(function() {
            UIUtils.toast.show('INVITATION.INFO.INVITATION_SENT');
          })
          .catch(UIUtils.onError('INVITATION.ERROR.SUGGEST_CERTIFICATIONS_FAILED'));
      });
  };

  /* -- Modals -- */

  $scope.showSelectRecipientModal = function(e) {
    if (e.isDefaultPrevented()) return;

    return Modals.showWotLookup({
      allowMultiple: true,
      enableFilter: true,
      title: 'INVITATION.NEW.RECIPIENTS_MODAL_TITLE',
      help: 'INVITATION.NEW.RECIPIENTS_MODAL_HELP',
      okText: 'COMMON.BTN_OK',
      okType: 'button-positive',
      selection: angular.copy($scope.recipients)
    })
      .then(function(res) {
        if (!res) return; // user cancel
        $scope.recipients = res;
      });

  };

  $scope.showSelectSuggestionModal = function(e) {
    if (e.isDefaultPrevented()) return;

    return Modals.showWotLookup({
      allowMultiple: true,
      enableFilter: true,
      title: 'INVITATION.NEW.SUGGESTION_IDENTITIES_MODAL_TITLE',
      help: 'INVITATION.NEW.SUGGESTION_IDENTITIES_MODAL_HELP',
      okText: 'COMMON.BTN_OK',
      okType: 'button-positive',
      selection: angular.copy($scope.suggestions)
    })
      .then(function(res) {
        if (!res) return; // user cancel
        $scope.suggestions = res;
      });
  };
}

