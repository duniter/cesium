angular.module('cesium.es.settings.controllers', ['cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, $stateProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Extend settings via extension points
      PluginServiceProvider.extendState('app.settings', {
        points: {
          'plugins': {
            templateUrl: "plugins/es/templates/settings/settings_extend.html",
            controller: "ESExtensionCtrl"
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
function ESExtendSettingsController ($scope, PluginService) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();

}

/*
 * Settings extend controller
 */
function ESPluginSettingsController ($scope, $window, $q,  $translate, $ionicPopup,
                                     UIUtils, Modals, csHttp, csConfig, csSettings, esHttp, esSettings) {
  'ngInject';

  $scope.hasWindowNotification = !!("Notification" in window);
  $scope.formData = {};
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;

  $scope.enter= function(e, state) {
    $scope.load();
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function(keepEnableState) {
    $scope.loading = true;

    var wasEnable = $scope.formData.enable;
    $scope.formData = csSettings.data.plugins && csSettings.data.plugins.es ?
      angular.copy(csSettings.data.plugins.es) : {
      enable: false,
      host: undefined,
      port: undefined
    };
    if (keepEnableState && wasEnable) {
      $scope.formData.enable = wasEnable;
    }

    $scope.isFallbackNode = $scope.formData.enable && esHttp.node.isFallback();
    $scope.server = $scope.getServer(esHttp);

    $scope.loading = false;
  };

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.load(true);
  });

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  // Change ESnode
  $scope.changeEsNode= function(node) {
    node = node || {
        host: $scope.formData.host,
        port: $scope.formData.port && $scope.formData.port != 80 && $scope.formData.port != 443 ? $scope.formData.port : undefined,
        useSsl: angular.isDefined($scope.formData.useSsl) ?
          $scope.formData.useSsl :
          ($scope.formData.port == 443)
      };

    $scope.showNodePopup(node)
    .then(function(newNode) {
      if (newNode.host == $scope.formData.host &&
        newNode.port == $scope.formData.port &&
        newNode.useSsl == $scope.formData.useSsl) {
        UIUtils.loading.hide();
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var newEsNode = esHttp.instance(newNode.host, newNode.port, newNode.useSsl);
      return newEsNode.isAlive() // ping the node
        .then(function(alive) {
          if (!alive) {
            UIUtils.loading.hide();
            return UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
              .then(function(){
                $scope.changeEsNode(newNode); // loop
              });
          }

          $scope.formData.host = newEsNode.host;
          $scope.formData.port = newEsNode.port;
          $scope.formData.useSsl = newEsNode.useSsl;

          return esHttp.copy(newEsNode);
        })
        .then(function() {
          $scope.server = $scope.getServer(esHttp);
          $scope.isFallbackNode = false;
          UIUtils.loading.hide();
        });
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {

    return $q(function(resolve, reject) {
      var parts = [node.host];
      if (node.port && node.port != 80) {
        parts.push(node.port);
      }
      $scope.popupData.newNode = parts.join(':');
      $scope.popupData.useSsl = angular.isDefined(node.useSsl) ? node.useSsl : (node.port == 443);
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['ES_SETTINGS.POPUP_PEER.TITLE', 'ES_SETTINGS.POPUP_PEER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/settings/popup_node.html',
            title: translations['ES_SETTINGS.POPUP_PEER.TITLE'],
            subTitle: translations['ES_SETTINGS.POPUP_PEER.HELP'],
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
            var useSsl = $scope.popupData.useSsl || (parts[1] == 443);
            resolve({
              host: parts[0],
              port: parts[1] || (useSsl ? 443 : 80),
              useSsl: useSsl
            });
          });
        });
    });
  };

  $scope.showNodeList = function() {
    // Check if need a filter on SSL node
    var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
    ($window.location && $window.location.protocol === 'https:') ? true : false;

    $ionicPopup._popupStack[0].responseDeferred.promise.close();
    return Modals.showNetworkLookup({
      enableFilter: true,
      endpoint: esHttp.constants.ES_USER_API_ENDPOINT,
      ssl: forceUseSsl ? true: undefined
    })
      .then(function (peer) {
        if (!peer) return;
          var esEps = peer.getEndpoints().reduce(function(res, ep){
            var esEp = esHttp.node.parseEndPoint(ep);
            return esEp ? res.concat(esEp) : res;
          }, []);
          if (!esEps.length) return;
          var ep = esEps[0];
          return {
            host: (ep.dns ? ep.dns :
                   (peer.hasValid4(ep) ? ep.ipv4 : ep.ipv6)),
            port: ep.port || 80,
            useSsl: ep.useSsl || ep.port == 443
          };
      })
      .then(function(newEsNode) {
        $scope.changeEsNode(newEsNode);
      });
  };

  $scope.onFormChanged = function() {
    if ($scope.loading) return;

    if ($scope.hasWindowNotification &&
      $scope.formData.notifications.emitHtml5 !== (window.Notification.permission === "granted")){
      window.Notification.requestPermission(function (permission) {
        // If the user accepts, let's create a notification
        $scope.formData.notifications.emitHtml5 = (permission === "granted"); // revert to false if permission not granted
        $scope.onFormChanged(); // Loop
      });
      return;
    }

    $scope.loading = true;
    csSettings.data.plugins = csSettings.data.plugins || {};
    csSettings.data.plugins.es = csSettings.data.plugins.es ?
      angular.merge(csSettings.data.plugins.es, $scope.formData) :
      $scope.formData;

    // Fix old settings (unused)
    delete csSettings.data.plugins.es.newNode;

    csSettings.store()
      .then(function() {
        $scope.loading = false;
      });
  };
  $scope.$watch('formData', $scope.onFormChanged, true);

  $scope.getServer = function(node) {
    node = node || $scope.formData;
    if (!node.host) return undefined;
    return csHttp.getServer(node.host, node.port);
  };
}
