
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

      // Ajout de la page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/view-03.html",
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
  .controller('Rml9ViewCtrl', function($scope, csTx,
                                       // [NEW] declare an AngularJS plugin, useful to create file
                                       FileSaver) {
    'ngInject';

    // When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");

      // Get the pubkey (from URL params) and store it in the page context ($scope)
      $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);
      if (!$scope.pubkey) return;

      // Load account TX data
      csTx.load($scope.pubkey)
        .then(function(result) {
          console.log(result); // Allow to discover data structure
          if (result && result.tx && result.tx.history) {
            $scope.items = result.tx.history;
            $scope.items = result && result.tx && result.tx.history || [];

          }
          // [NEW] store the account balance
          $scope.balance = (result && result.balance) || 0;
        });
    });

    // [NEW] Manage click on the export button
    $scope.onExportButtonClick = function() {
      console.debug("[RML9] call method onExportButtonClick() on pubkey: " + $scope.pubkey);

      // Load account TX data
      var fromTime = -1; // all TX (full history)
      csTx.load($scope.pubkey, fromTime)
        .then(function(result) {
          if (!result || !result.tx || !result.tx.history) return; // no TX


          // TODO: replace this !
          // You can choose any format (CSV, TXT, JSON, ...) and test it !
          var content = [
            "Hello Libre World !\n",
            "Cesium rock's !\n"
          ];

          var file = new Blob(content, {type: 'text/plain; charset=utf-8'});
          var filename = $scope.pubkey+'-history.txt';
          FileSaver.saveAs(file, filename);
        });

    };
  });


