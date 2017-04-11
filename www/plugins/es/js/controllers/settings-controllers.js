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

}

/*
 * Settings extend controller
 */
function ESPluginSettingsController ($scope, $q,  $translate, $ionicPopup, UIUtils, Modals, csHttp, csSettings, esUser, esHttp) {
  'ngInject';

  $scope.formData = {};
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;

  $scope.onEnter = function() {
    $scope.loading = true;
    $scope.formData = csSettings.data.plugins && csSettings.data.plugins.es ?
      angular.copy(csSettings.data.plugins.es) : {
      enable: false,
      host: null,
      port: null,
      wsPort: null
    };
    $scope.loading = false;
  };
  $scope.$on('$ionicView.enter', $scope.onEnter);

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  // Change ESnode
  $scope.changeEsNode= function(node) {
    $scope.showNodePopup(node || $scope.formData)
    .then(function(newNode) {
      if (newNode.host == $scope.formData.host &&
        newNode.port == $scope.formData.port &&
        newNode.wsPort == $scope.formData.wsPort) {
        UIUtils.loading.hide();
        return; // same node = nothing to do
      }
      UIUtils.loading.show();

      var newEsNode = esHttp.instance(newNode.host, newNode.port);
      return newEsNode.isAlive() // ping the node
        .then(function(alive) {
          if (!alive) {
            UIUtils.loading.hide();
            return UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
              .then(function(){
                $scope.changeEsNode(newNode); // loop
              });
          }

          UIUtils.loading.hide();
          $scope.formData.host = newNode.host;
          $scope.formData.port = newNode.port;
          $scope.formData.wsPort = newNode.wsPort;

          esHttp.copy(newEsNode);
        });
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      var parts = [node.host];
      if (node.wsPort && node.wsPort != (node.port||80)) {
        parts.push(node.port||80);
        parts.push(node.wsPort);
      }
      else if (node.port && node.port != 80) {
        parts.push(node.port);
      }
      $scope.popupData.newNode = parts.join(':');
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
            resolve({
              host: parts[0],
              port: parts[1] || 80,
              wsPort: parts[2] || parts[1] || 80
            });
          });
        });
    });
  };

  $scope.showNodeList = function() {
    $ionicPopup._popupStack[0].responseDeferred.promise.close();
    return Modals.showNetworkLookup({
      enableFilter: true,
      endpointFilter: esUser.constants.ES_USER_API_ENDPOINT
    })
      .then(function (peer) {
        if (!peer) return;
          var esEps = peer.getEndpoints().reduce(function(res, ep){
            var esEp = esUser.node.parseEndPoint(ep);
            return esEp ? res.concat(esEp) : res;
          }, []);
          if (!esEps.length) return;
          var ep = esEps[0];
          return {
            host: (ep.dns ? ep.dns :
                   (peer.hasValid4(ep) ? ep.ipv4 : ep.ipv6)),
            port: ep.port || 80
          };
      })
      .then(function(newEsNode) {
        if (!newEsNode) {
          UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY');
          return;
        }
        $scope.changeEsNode(newEsNode);
      });
  };

  $scope.onFormChanged = function() {
    if ($scope.loading) return;

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

  $scope.getServer = function() {
    var server = csHttp.getServer($scope.formData.host, $scope.formData.port != 80 ? $scope.formData.port : undefined);
    return server + ($scope.formData.wsPort && $scope.formData.wsPort != $scope.formData.port ? ':' + $scope.formData.wsPort : '');
  };
}
