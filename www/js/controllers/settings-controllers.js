
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

function SettingsController($scope, $q, $ionicPopup, $timeout, $translate, csHttp,
  UIUtils, BMA, csSettings, $ionicPopover, ModalUtils) {
  'ngInject';

  $scope.formData = angular.copy(csSettings.data);
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;
  $scope.nodePopup = {};

  $scope.$on('$ionicView.enter', function() {
    $scope.load();
  });

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  $scope.load = function() {
    $scope.loading = true; // to avoid the call of csWallet.store()

    // Fill locales
    $scope.locales = angular.copy(csSettings.locales);
    var locale = _.findWhere($scope.locales, {id: csSettings.defaultSettings.locale.id});
    angular.merge($scope.formData, csSettings.data);
    $scope.formData.locale = locale;
    if (csSettings.data.locale && csSettings.data.locale.id) {
      $scope.formData.locale = _.findWhere($scope.locales, {id: csSettings.data.locale.id});
    }
    $scope.loading = false;

    $timeout(function() {
      // Set Ink
      UIUtils.ink({selector: '.item'});
      $scope.showHelpTip();
    }, 10);
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

  $scope.showNodeList = function() {
    $ionicPopup._popupStack[0].responseDeferred.promise.close();
    return ModalUtils.show('/templates/network/modal_network.html', 'NetworkModalCtrl')
      .then(function (result) {
        if (result) {
          var parts = result.server.split(':');
          var newNode;
          if (result.dns) {
            return newNode = {
              host: result.dns,
              port: parts[1]
            };
          }
          else {
            return newNode = {
              host: parts[0],
              port: parts[1]
            };
          }
        }
      })
      .then(function(newNode) {
      $scope.changeNode(newNode);
      });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.popupData.newNode = node.port ? [node.host, node.port].join(':') : node.host;
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['SETTINGS.POPUP_NODE.TITLE', 'SETTINGS.POPUP_NODE.HELP',
        'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
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
            parts[1] = parts[1] ? parts[1] : 80;
            resolve({
              host: parts[0],
              port: parts[1]
            });
          });
        });
      });
    };

  $scope.save = function() {
    if ($scope.loading) return $q.when();
    if ($scope.saving) {
      // Retry later
      return $timeout(function() {
        return $scope.save();
      }, 500);
    }
    $scope.saving = true;

    // Async - to avoid UI lock
    $timeout(function() {
      // Make sure to format helptip
      $scope.cleanupHelpTip();
      angular.merge(csSettings.data, $scope.formData);
      csSettings.store();
      $scope.saving = false;
    }, 100);
  };
  $scope.$watch('formData', $scope.save, true);


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

  /* -- modals & popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/settings/popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.startSettingsTour = function() {
    $scope.hideActionsPopover();

    return $scope.showHelpTip(0, true);
  };

  // Show help tip (show only not already shown)
  $scope.showHelpTip = function(index, tour) {
    if (!$scope.isLogin() && !tour) return;
    index = angular.isDefined(index) ? index : csSettings.data.helptip.settings;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(tour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startSettingsTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.settings = endIndex;
        csSettings.store();
      });
  };
}
