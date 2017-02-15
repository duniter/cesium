angular.module('cesium.es.app.controllers', ['ngResource', 'cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Menu extension points
      PluginServiceProvider.extendState('app', {
         points: {
           'nav-buttons-right': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           },
           'menu-main': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           },
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
function ESJoinController($scope, $state, csSettings, PluginService) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
      csSettings.data.plugins.es.enable :
      !!csSettings.data.plugins.host;
  };

  csSettings.api.data.on.changed($scope, function() {
    $scope.updateView();
  });

  $scope.updateView();
}

/**
 * Control menu extension
 */
function ESMenuExtendController($scope, $state, PluginService, csSettings, UIUtils) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.showMarketLookupView = function() {
    $state.go(UIUtils.screen.isSmall() ? 'app.market_lookup': 'app.market_lookup_lg');
  };

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
    return UIUtils.popover.show(event, {
      templateUrl :'plugins/es/templates/message/popover_message.html',
      scope: $scope,
      autoremove: false // reuse popover
    });
  };

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
                    csSettings.data.plugins.es.enable :
                    !!csSettings.data.plugins.host;
  };

  csSettings.api.data.on.changed($scope, function() {
    $scope.updateView();
  });

  $scope.updateView();

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

  csSettings.api.data.on.changed($scope, function() {
    $scope.updateView();
  });

  csWallet.api.data.on.login($scope, function(walletData, resolve){
    $scope.updateView();
    if (resolve) resolve();
  });

  csWallet.api.data.on.logout($scope, function(){
    $scope.updateView();
  });

  $scope.showEditUserProfile = function() {
    $scope.closeProfilePopover();
    $state.go('app.user_edit_profile');
  };

  $scope.updateView();

}
