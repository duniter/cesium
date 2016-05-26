
angular.module('cesium.settings.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
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

function SettingsController($scope, $state, UIUtils, $translate, BMA, $q, $ionicPopup) {

  $scope.walletData = {};
  $scope.formData = {
    locales: [
      {id:'fr-FR', label:'Français'},
      {id:'en', label:'English'}
    ],
    node: BMA.node.server,
    newNode: null
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        $scope.walletData = wallet;
        var currentLocale = $translate.use();
        $scope.walletData.settings.locale = $scope.formData.locales.reduce(function(array, l, index) {
            return l.id == currentLocale ? array.concat(l) : array;
          }, [])[0];
        UIUtils.loading.hide();
      });
  });

  $scope.setSettingsForm = function(settingsForm) {
    $scope.settingsForm = settingsForm;
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
  };

  $scope.toogleUnit = function() {
    $scope.walletData.settings.useRelative = !$scope.walletData.settings.useRelative;
  };

  $scope.onNodeChanged = function() {
     BMA.instance($scope.formData.node);
  };

  $scope.onNodeChanged = function() {
       BMA.instance($scope.formData.node);
    };

  // Change node
  $scope.changeNode= function(node) {
    if (!node) {
      node = $scope.formData.node;
    }
    $scope.showNodePopup(node)
    .then(function(node) {
      UIUtils.loading.show();

      var nodeBMA = BMA.instance(node);

      nodeBMA.node.summary()
      .then(function() {
        UIUtils.loading.hide();
        $scope.formData.node = node;
        BMA.copy(nodeBMA);
      })
      .catch(function(err){
         UIUtils.loading.hide();
         UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
         .then(function(){
           $scope.changeNode(node); // loop
         });
      });
    });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      $scope.formData.newNode = node;
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
            resolve(node);
          });
        });
      });
    };
}
