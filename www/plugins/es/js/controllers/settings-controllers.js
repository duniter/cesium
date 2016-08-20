angular.module('cesium.es.settings.controllers', ['cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, $stateProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.enable;
    if (enable) {
      // Extend settings via extension points
      PluginServiceProvider.extendState('app.settings', {
        points: {
          'plugins': {
            templateUrl: "plugins/es/templates/settings/settings_extend.html",
            controller: "ESExtendSettingsCtrl"
          }
        }
      });

      $stateProvider
      .state('app.es_settings', {
        url: "/settings/es",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/settings/plugin_settings.html",
            controller: 'ESPluginSettingsCtrl'
          }
        }
      });
    }
  })

 .controller('ESExtendSettingsCtrl', ESExtendSettingsController)

 .controller('ESPluginSettingsCtrl', ESPluginSettingsController)

;

/*
 * Settings extend controller
 */
function ESExtendSettingsController ($scope, PluginService, csSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = false;

  // Update settings if need
  $scope.onSettingsLoaded = function() {
    if ($scope.loading) {
      $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es && csSettings.data.plugins.es.enable;
    }
  };
  $scope.$watch('formData', $scope.onSettingsLoaded, true);
}

/*
 * Settings extend controller
 */
function ESPluginSettingsController ($scope, $q,  $translate, $ionicPopup, UIUtils, csSettings, csHttp, esMarket,
  esRegistry, esUser) {
  'ngInject';

  $scope.formData = {};
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function() {
    $scope.loading = true;
    $scope.formData = csSettings.data.plugins && csSettings.data.plugins.es ?
      angular.copy(csSettings.data.plugins.es) : {
      enable: false,
      host: null,
      port: null
    };
    $scope.loading = false;
  });

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  // Change ESnode
  $scope.changeEsNode= function(node) {
    $scope.showNodePopup(node || $scope.formData)
    .then(function(node) {
      if (node.host === $scope.formData.host &&
        node.port === $scope.formData.port) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var newInstance = esMarket.instance(node.host, node.port);
      esMarket.copy(newInstance);

      newInstance = esRegistry.instance(node.host, node.port);
      esRegistry.copy(newInstance);

      newInstance = esUser.instance(node.host, node.port);
      esUser.copy(newInstance);

      $scope.formData.host = node.host;
      $scope.formData.port = node.port;

      UIUtils.loading.hide(10);
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.popupData.newNode = node.port ? [node.host, node.port].join(':') : node.host;
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['ES_SETTINGS.POPUP_NODE.TITLE', 'ES_SETTINGS.POPUP_NODE.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/settings/popup_node.html',
            title: translations['ES_SETTINGS.POPUP_NODE.TITLE'],
            subTitle: translations['ES_SETTINGS.POPUP_NODE.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.popupForm.$submitted=true;
                  if(!$scope.popupForm.$valid || !$scope.popupForm.newNode) {
                    //don't allow the user to close unless he enters a node
                    e.preventDefault();
                  } else {
                    return $scope.popupData.newNode;
                  }
                }
              }
            ]
          })
          .then(function(node) {
            if (!node) { // user cancel
              UIUtils.loading.hide();
              return;
            }
            var parts = node.split(':');
            resolve({
              host: parts[0],
              port: parts[1]
            });
          });
        });
      });
    };

  $scope.onFormChanged = function() {
    if ($scope.loading) {
      return;
    }

    $scope.loading = true;

    if (!csSettings.data.plugins) {
      csSettings.data.plugins={};
    }
    if (!csSettings.data.plugins.es) {
      csSettings.data.plugins.es=$scope.formData;
    }
    else {
      angular.merge(csSettings.data.plugins.es, $scope.formData);
    }

    // Fix old settings
    delete csSettings.data.plugins.es.newNode;

    csSettings.store();

    $scope.loading = false;

  };
  $scope.$watch('formData', $scope.onFormChanged, true);

  $scope.getServer = function() {
    return csHttp.getServer($scope.formData.host, $scope.formData.port);
  };
}
