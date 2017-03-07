angular.module('cesium.es.modal.services', ['cesium.modal.services', 'cesium.es.message.services'])

.factory('esModals', function(ModalUtils, UIUtils) {
  'ngInject';

  function showMessageCompose(parameters) {
    return ModalUtils.show('plugins/es/templates/message/modal_compose.html','ESMessageComposeModalCtrl',
      parameters, {focusFirstInput: true});
  }

  function updateNotificationCountAndReadTime() {
    csWallet.data.notifications.unreadCount = 0;
    if (csWallet.data.notifications && csWallet.data.notifications.history.length) {
      var lastNotification = csWallet.data.notifications.history[0];
      var readTime = lastNotification ? lastNotification.time : 0;
      csSettings.data.wallet = csSettings.data.wallet || {};
      if (readTime && csSettings.data.wallet.notificationReadTime != readTime) {
        csSettings.data.wallet.notificationReadTime = readTime;
        csSettings.store();
      }
    }
  }

  function showNotificationsPopover(scope, event) {
    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/common/popover_notification.html',
      scope: scope,
      autoremove: false, // reuse popover
      afterHidden: updateNotificationCountAndReadTime
    })
      .then(function(notification) {
        if (!notification) return; // no selection
        if (notification.onRead && typeof notification.onRead == 'function') notification.onRead();
        if (notification.state) {
          $state.go(notification.state, notification.stateParams);
        }
      });
  }

  function showNewInvitation(parameters) {
    return ModalUtils.show('plugins/es/templates/invitation/modal_new_invitation.html', 'ESNewInvitationModalCtrl',
      parameters);
  }

  return {
    showMessageCompose: showMessageCompose,
    showNotifications: showNotificationsPopover,
    showNewInvitation: showNewInvitation
  };

});
