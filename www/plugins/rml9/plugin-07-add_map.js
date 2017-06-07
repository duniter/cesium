
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
              templateUrl: "plugins/rml9/templates/01-button.html",
              controller: 'Rml9ButtonCtrl'
            }
          }
        });

      // Extension de 'Mes opérations' : insertion d'un bouton
      PluginServiceProvider.extendState('app.view_wallet_tx', {
           points: {
             'buttons': {
               templateUrl: "plugins/rml9/templates/01-button.html",
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
              templateUrl: "plugins/rml9/templates/02-view.html",
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
  .controller('Rml9ViewCtrl', function($scope, csTx) {
    'ngInject';

    // [NEW] When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");

      // [NEW] Get the pubkey (from URL params) and store it in the page context ($scope)
      $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);
      if (!$scope.pubkey) return;

      // [NEW] Create some data to display
      // Load account TX data
      csTx.load($scope.pubkey) //  <- appel au service csTx
        .then(function(result) {
          console.log(result);  // Allow to discover data structure
          if (result && result.tx && result.tx.history) {
            $scope.items = result.tx.history;
          }
        });
    });
  });


