angular.module('cesium.es.settings.controllers', ['cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, $stateProvider, APP_CONFIG) {
    'ngInject';

    var enable = !!APP_CONFIG.DUNITER_NODE_ES;
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
function ESExtendSettingsController ($scope, $rootScope, Wallet, PluginService, APP_CONFIG) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = false;

  // Update settings if need
  $scope.onSettingsLoaded = function() {
    if ($scope.loading) {
      var enable = !!APP_CONFIG.DUNITER_NODE_ES;
      if (enable && Wallet.data.settings && Wallet.data.settings.plugins && Wallet.data.settings.plugins.es) {
        enable = Wallet.data.settings.plugins.es.enable;
      }
      $scope.enable = enable;
    }
  };
  $scope.$watch('formData', $scope.onSettingsLoaded, true);
}

/*
 * Settings extend controller
 */
function ESPluginSettingsController ($scope, $rootScope, $q,  $translate, $ionicPopup, $ionicHistory, UIUtils, APP_CONFIG, esHttp, esMarket,
  esRegistry, esUser, Wallet) {
  'ngInject';

  $scope.formData = {};
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.formData.node) {
      if (Wallet.data.settings && Wallet.data.settings.plugins && Wallet.data.settings.plugins.es) {
        angular.merge($scope.formData, Wallet.data.settings.plugins.es);
      }
      else {
        $scope.formData.enable = !!APP_CONFIG.DUNITER_NODE_ES;

      }
      if (!$scope.formData.node) {
        $scope.formData.node = APP_CONFIG.DUNITER_NODE_ES;
      }
    }
    $scope.loading = false;
  });

  $scope.setSettingsForm = function(settingsForm) {
    $scope.settingsForm = settingsForm;
  };

  // Change ESnode
  $scope.changeEsNode= function(node) {
    if (!node) {
      node = $scope.formData.node;
    }
    $scope.showNodePopup(node)
    .then(function(node) {
      if (node == $scope.formData.node) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var newInstance = esHttp.instance(node);
      esHttp.copy(newInstance);

      newInstance = esMarket.instance(node);
      esMarket.copy(newInstance);

      newInstance = esRegistry.instance(node);
      esRegistry.copy(newInstance);

      newInstance = esUser.instance(node);
      esUser.copy(newInstance);

      $scope.formData.node = node;
      delete $scope.formData.newNode;

      UIUtils.loading.hide(10);
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.formData.newNode = node;
      if (!!$scope.settingsForm) {
        $scope.settingsForm.$setPristine();
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
                  $scope.settingsForm.$submitted=true;
                  if(!$scope.settingsForm.$valid || !$scope.settingsForm.newNode) {
                    //don't allow the user to close unless he enters a node
                    e.preventDefault();
                  } else {
                    return $scope.formData.newNode;
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
            resolve(node);
          });
        });
      });
    };

  $scope.onSettingsChanged = function() {
    if ($scope.loading) {
      return;
    }

    $scope.loading = true;

    if (!Wallet.data.settings.plugins) {
      Wallet.data.settings.plugins={};
    }
    if (!Wallet.data.settings.plugins.es) {
      Wallet.data.settings.plugins.es=$scope.formData;
    }
    else {
      angular.merge(Wallet.data.settings.plugins.es, $scope.formData);
    }

    // Update services
    esHttp.setEnable($scope.formData.enable);
    esUser.refreshListeners();

    Wallet.store({settings: true, data: false});

    // Clean cache
    $ionicHistory.clearCache();

    $scope.loading = false;

  };
  $scope.$watch('formData', $scope.onSettingsChanged, true);
}
