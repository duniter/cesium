
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

function SettingsController($scope, $q, $ionicPopup, $timeout, $translate, UIUtils, BMA, csSettings) {
  'ngInject';

  $scope.formData = angular.copy(csSettings.data);
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loading = true; // to avoid the call of Wallet.store()
    $scope.locales = UIUtils.locales;
    $scope.formData.locale = _.findWhere($scope.locales, {id: $translate.use()});
    angular.merge($scope.formData, csSettings.data);
    if (csSettings.data.locale && csSettings.data.locale.id) {
      $scope.formData.locale = _.findWhere($scope.locales, {id: csSettings.data.locale.id});
    }
    UIUtils.loading.hide();
    $scope.loading = false;

    // Set Ink
    $timeout(function() {
      // Set Ink
      UIUtils.ink({selector: '.item'});
    }, 100);
  });

  $scope.setSettingsForm = function(settingsForm) {
    $scope.settingsForm = settingsForm;
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
      $scope.formData.newNode = [node.host, node.port].join(':');
      if (!!$scope.settingsForm) {
        $scope.settingsForm.$setPristine();
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
            var parts = node.split(':');
            resolve({
              host: parts[0],
              port: parts[1] || 80
            });
          });
        });
      });
    };

  $scope.onSettingsChanged = function() {
    if (!$scope.loading) {
      $scope.loading = true;
      angular.merge(csSettings.data, $scope.formData);
      csSettings.store();
      $scope.loading = false;
    }
  };
  $scope.$watch('formData', $scope.onSettingsChanged, true);


}
