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
function ESMenuExtendController($scope, $state, screenmatch, PluginService, csSettings) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.showMarketLookupView = function() {
    $state.go(screenmatch.is('sm, xs') ? 'app.market_lookup': 'app.market_lookup_lg');
  };

  $scope.showRegistryLookupView = function() {
    $state.go(screenmatch.is('sm, xs') ? 'app.registry_lookup': 'app.registry_lookup_lg');
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
