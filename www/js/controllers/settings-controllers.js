
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

function SettingsController($scope, $state, UIUtils, $translate) {

  $scope.walletData = {};
  $scope.languages = [
    {id:'fr-FR', label:'Français'},
    {id:'en', label:'English'}
  ];

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        $scope.walletData = wallet;
        $scope.walletData.settings.language = $scope.languages.reduce(function(array, l, index) {
            return l.id == $translate.use() ? array.concat(l) : array;
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

}
