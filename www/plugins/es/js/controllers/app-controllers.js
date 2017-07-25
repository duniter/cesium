angular.module('cesium.es.app.controllers', ['ngResource', 'cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Menu extension points
      PluginServiceProvider.extendState('app', {
         points: {
           // removeIf(device)
           'nav-buttons-right': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           },
           // endRemoveIf(device)
           'menu-user': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           }
         }
        });

      // Profile popover extension points
      PluginServiceProvider.extendState('app', {
        points: {
          'profile-popover-user': {
            templateUrl: "plugins/es/templates/common/popover_profile_extend.html",
            controller: "ESProfilePopoverExtendCtrl"
          }
        }
      });

      // New account extension points
      /*PluginServiceProvider.extendState('app', {
        points: {
          'select-account-type': {
            templateUrl: "plugins/es/templates/join/modal_join_extend.html",
            controller: "ESJoinCtrl"
          },
          'last-slide': {
            templateUrl: "plugins/es/templates/join/modal_join_extend.html",
            controller: "ESJoinCtrl"
          },
        }
      });*/
    }
  })

 .controller('ESJoinCtrl', ESJoinController)

 .controller('ESMenuExtendCtrl', ESMenuExtendController)

 .controller('ESProfilePopoverExtendCtrl', ESProfilePopoverExtendController)


;


/**
 * Control new account wizard extend view
 */
function ESJoinController($scope, esSettings, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();
  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}

/**
 * Control menu extension
 */
function ESMenuExtendController($scope, $state, PluginService, esSettings, UIUtils, csWallet) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  $scope.showRegistryLookupView = function() {
    $state.go(UIUtils.screen.isSmall() ? 'app.registry_lookup': 'app.registry_lookup_lg');
  };

  $scope.showNotificationsPopover = function(event) {
    return UIUtils.popover.show(event, {
        templateUrl :'plugins/es/templates/notification/popover_notification.html',
        scope: $scope,
        autoremove: false // reuse popover
      });
  };

  $scope.showMessagesPopover = function(event) {
    // Make sure tobe auth before opening this popover
    if (!csWallet.isAuth()) {
      return csWallet.auth().then(function(){
        UIUtils.loading.hide();
        return $scope.showMessagesPopover(event); // loop
      });
    }

    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/message/popover_message.html',
      scope: $scope,
      autoremove: false // reuse popover
    });
  };

  $scope.showInvitationsPopover = function(event) {
    // Make sure tobe auth before opening this popover
    if (!csWallet.isAuth()) {
      return csWallet.auth().then(function(){
        UIUtils.loading.hide();
        return $scope.showInvitationsPopover(event); // loop
      });
    }

    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/invitation/popover_invitation.html',
      scope: $scope,
      autoremove: false, // reuse popover
      // Auto-close if open when un-authenticate
      afterShow: function(popover) {
        csWallet.api.data.on.unauth(popover.scope, function() {
          popover.scope.closePopover();
        });
      }
    })
      .then(function() {
    });
  };

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });


}

/**
 * Control profile popover extension
 */
function ESProfilePopoverExtendController($scope, $state, csSettings, csWallet) {
  'ngInject';

  $scope.updateView = function() {
    $scope.enable = csWallet.isLogin() && (
        (csSettings.data.plugins && csSettings.data.plugins.es) ?
          csSettings.data.plugins.es.enable :
          !!csSettings.data.plugins.host);
  };

  $scope.showEditUserProfile = function() {
    $scope.closeProfilePopover();
    $state.go('app.user_edit_profile');
  };

  csSettings.api.data.on.changed($scope, $scope.updateView);
  csSettings.api.data.on.ready($scope, $scope.updateView);
  csWallet.api.data.on.login($scope, function(data, deferred){
    $scope.updateView();
    return deferred && deferred.resolve() || $q.when();
  });
  csWallet.api.data.on.logout($scope, $scope.updateView);

  // Default action
  $scope.updateView();

}
