
angular.module('cesium.settings.controllers', ['cesium.services', 'cesium.currency.controllers'])
  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.settings', {
        url: "/settings",
        views: {
          'menuContent': {
            templateUrl: "templates/settings/settings.html",
            controller: 'SettingsCtrl'
          }
        }
      })
    ;
  })

  .controller('SettingsCtrl', SettingsController)
;

function SettingsController($scope, $q, $ionicPopup, $timeout, $translate, csHttp, UIUtils, BMA, csSettings, $ionicPopover) {
  'ngInject';

  $scope.formData = angular.copy(csSettings.data);
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e) {
    $scope.loading = true; // to avoid the call of Wallet.store()
    $scope.locales = angular.copy(UIUtils.locales);
    var locale = _.findWhere($scope.locales, {id: csSettings.defaultSettings.locale.id});
    angular.merge($scope.formData, csSettings.data);
    $scope.formData.locale = locale;
    if (csSettings.data.locale && csSettings.data.locale.id) {
      $scope.formData.locale = _.findWhere($scope.locales, {id: csSettings.data.locale.id});
    }
    UIUtils.loading.hide();
    $scope.loading = false;
    $scope.showHelpTip();
    $timeout(function() {
      // Set Ink
      UIUtils.ink({selector: '.item'});
    }, 10);
  });

  $ionicPopover.fromTemplateUrl('templates/settings/popover_actions.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.actionsPopover = popover;
  });

  //Cleanup the popover when we're done with it!
  $scope.$on('$destroy', function() {
    $scope.actionsPopover.remove();
  });

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  $scope.reset = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
    csSettings.reset();
    angular.merge($scope.formData, csSettings.data);
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
  };

  // Change node
  $scope.changeNode= function(node) {
    $scope.showNodePopup(node || $scope.formData.node)
    .then(function(newNode) {
      if (newNode.host === $scope.formData.node.host &&
        newNode.port === $scope.formData.node.port) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();
      var nodeBMA = BMA.instance(newNode.host, newNode.port);
      nodeBMA.node.summary() // ping the node
      .then(function() {
        UIUtils.loading.hide();
        $scope.formData.node = newNode;
        BMA.copy(nodeBMA);
      })
      .catch(function(err){
         UIUtils.loading.hide();
         UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
         .then(function(){
           $scope.changeNode(newNode); // loop
         });
      });
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.popupData.newNode = node.port ? [node.host, node.port].join(':') : node.host;
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['SETTINGS.POPUP_NODE.TITLE', 'SETTINGS.POPUP_NODE.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/settings/popup_node.html',
            title: translations['SETTINGS.POPUP_NODE.TITLE'],
            subTitle: translations['SETTINGS.POPUP_NODE.HELP'],
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

  $scope.onSettingsChanged = function() {
    if (!$scope.loading) {
      $scope.loading = true;

      // Make sure to format helptip
      $scope.cleanupHelpTip();

      angular.merge(csSettings.data, $scope.formData);
      csSettings.store();
      $scope.loading = false;
    }
  };
  $scope.$watch('formData', $scope.onSettingsChanged, true);
  //$scope.$watch('formData.helptip', $scope.onSettingsChanged, true);


  $scope.getServer = function() {
    return csHttp.getServer($scope.formData.node.host, $scope.formData.node.port);
  };

  $scope.cleanupHelpTip = function() {
    var helptipChanged = $scope.formData.helptip.enable !== csSettings.data.helptip.enable;
    if (helptipChanged) {
      var enable = $scope.formData.helptip.enable;
      // Apply default values
      $scope.formData.helptip = angular.merge({}, csSettings.defaultSettings.helptip);
      // Then restore the enable flag
      $scope.formData.helptip.enable = enable;
    }
  };

  // Show help tip (show only not already shown tip
  $scope.showHelpTip = function() {
    var index = angular.isDefined(index) ? index : csSettings.data.helptip.settings;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startSettingsTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.settings = endIndex;
        csSettings.store();
      });
  };
}
