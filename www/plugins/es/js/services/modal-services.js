angular.module('cesium.es.modal.services', ['cesium.modal.services', 'cesium.es.message.services'])

  .factory('esModals', function($state, ModalUtils, UIUtils, csWallet) {
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
      return csWallet.auth({minData: true})
        .then(function(walletData) {
          UIUtils.loading.hide();

          // Not allow for non-member - issue #561
          if (!walletData.isMember) {
            return UIUtils.alert.error('ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION');
          }
          return ModalUtils.show('plugins/es/templates/invitation/modal_new_invitation.html', 'ESNewInvitationModalCtrl',
            parameters);
        });
    }

    function showNewPage(options) {
      var wallet = options && options.wallet || csWallet;
      return wallet.auth({minData: true})
        .then(function() {
          UIUtils.loading.hide();

          return ModalUtils.show('plugins/es/templates/registry/modal_record_type.html', undefined, {
            title: 'REGISTRY.EDIT.TITLE_NEW'
          })
            .then(function(type){
              if (type) {
                $state.go('app.registry_add_record', {type: type, wallet: wallet.id});
              }
            });
        });
    }

    function showNetworkLookup(parameters) {
      return ModalUtils.show('plugins/es/templates/network/modal_network.html', 'NetworkLookupModalCtrl',
        parameters, {focusFirstInput: true});
    }

    return {
      showMessageCompose: showMessageCompose,
      showNotifications: showNotificationsPopover,
      showNewInvitation: showNewInvitation,
      showNewPage: showNewPage,
      showNetworkLookup: showNetworkLookup
    };

  });
