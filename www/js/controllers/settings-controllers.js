
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

function SettingsController($scope, $state, UIUtils, Wallet, $translate, BMA, $q, $ionicPopup, $timeout, localStorage) {

  $scope.locales = [
      {id:'fr-FR', label:'Français'},
      {id:'en', label:'English'}
    ];
  $scope.formData = { // Init with default settings
    useRelative: Wallet.defaultSettings.useRelative,
    node: Wallet.defaultSettings.node,
    useLocalStorage: Wallet.defaultSettings.useLocalStorage
  }
  $scope.formData.locale = _.findWhere($scope.locales, {id: $translate.use()});
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loading = true; // to avoid the call of Wallet.store()
    $scope.loadWallet()
      .then(function(walletData) {
        $scope.formData.useRelative = walletData.settings.useRelative;
        $scope.formData.node = walletData.settings.node;
        $scope.formData.useLocalStorage = walletData.settings.useLocalStorage;
        $scope.formData.locale = _.findWhere($scope.locales, {id: walletData.settings.locale.id});
        UIUtils.loading.hide();
        $scope.loading = false;
      })
      .catch(UIUtils.onError());
  });

  $scope.setSettingsForm = function(settingsForm) {
    $scope.settingsForm = settingsForm;
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
  };

  // Change node
  $scope.changeNode= function(node) {
    if (!node) {
      node = $scope.formData.node;
    }
    $scope.showNodePopup(node)
    .then(function(node) {
      if (node == $scope.formData.node) {
        return; // same node = nothing to do
      }
      UIUtils.loading.show();
      var nodeBMA = BMA.instance(node);
      nodeBMA.node.summary() // ping the node
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

  $scope.onSettingsChanged = function() {
    if (!$scope.loading) {
      Wallet.data.settings.useRelative = $scope.formData.useRelative;
      Wallet.data.settings.node = $scope.formData.node;
      Wallet.data.settings.locale.id = $scope.formData.locale.id;
      Wallet.data.settings.useLocalStorage = $scope.formData.useLocalStorage;
      Wallet.store();
    }
  };
  $scope.$watch('formData.useRelative', $scope.onSettingsChanged, true);
  $scope.$watch('formData.node', $scope.onSettingsChanged, true);
  $scope.$watch('formData.locale', $scope.onSettingsChanged, true);
  $scope.$watch('formData.useLocalStorage', $scope.onSettingsChanged, true);

  // Set Ink
  $timeout(function() {
    // Set Ink
    UIUtils.ink({selector: '.item'});
  }, 10);
}
