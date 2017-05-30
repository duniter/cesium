
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extension de la vue d'une identité: ajout d'un bouton
      PluginServiceProvider
        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/button.html",
              controller: 'Rml9ButtonCtrl'
            }
          }
        });

      // Extension de 'Mes opérations' : insertion d'un bouton
      PluginServiceProvider.extendState('app.view_wallet_tx', {
           points: {
             'buttons': {
               templateUrl: "plugins/rml9/templates/button.html",
               controller: 'Rml9ButtonCtrl'
           }
         }
       });

      // [NEW] Ajout d'une nouvelle page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/view.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
    }

  })

  // Manage events from the plugin button
  .controller('Rml9ButtonCtrl', function($scope, $state) {
    'ngInject';

    // Manage click event, on the plugin button
    $scope.onButtonClick = function() {

      // [Get the public key, from the page context ($scope.formData)
      var pubkey = $scope.formData.pubkey;
      if (!pubkey) return;
      console.debug("[RML9] call method onButtonClick() on pubkey: " + pubkey);

      // [NEW] Open the RML9 view (#/app/rml9)
      $state.go('app.rml9', {pubkey: pubkey});
    };
  })

  // [NEW] Manage events from the page #/app/rml9
  .controller('Rml9ViewCtrl', function($scope) {
    'ngInject';

    // [NEW] When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");

      // [NEW] Get the pubkey (from URL params) and store it in the page context ($scope)
      $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);
      if (!$scope.pubkey) return;

      // [NEW] Create some data to display
      $scope.items = [
        {amount: 64,   time: 1493391431, pubkey:'2RFPQGxYraKTFKKBXgpNn1QDEPdFM7rHNu7HdbmmF43v'},
        {amount: -500, time: 1493373164, pubkey:'2RFPQGxYraKTFKKBXgpNn1QDEPdFM7rHNu7HdbmmF43v'},
        {amount: 100,  time: 1493363131, pubkey:'5U2xuAUEPFeUQ4zpns6Zn33Q1ZWaHxEd3sPx689ZpaZV'}
      ];
    });
  });


