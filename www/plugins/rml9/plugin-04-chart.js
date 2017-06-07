
angular.module('cesium.rml9.plugin', ['chart.js', 'cesium.graph.services', 'cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extension de la vue d'une identité : ajout d'un bouton
      PluginServiceProvider
        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/03-button.html"
            }
          }
        })

        // Extension de 'Mes opérations' : insertion d'un bouton
        .extendState('app.view_wallet_tx', {
           points: {
             'buttons': {
               templateUrl: "plugins/rml9/templates/03-button.html"
           }
         }
       });

      // Ajout d'une nouvelle page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/04-view_chart.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
    }

  })

  // Manage events from the page #/app/rml9
  .controller('Rml9ViewCtrl', function($scope, csTx, gpColor) {
    'ngInject';

    // When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");

      // Get the pubkey (from URL params) and store it in the page context ($scope)
      $scope.pubkey = (state && state.stateParams && state.stateParams.pubkey);
      if (!$scope.pubkey) return;

      // Load account TX data
      csTx.load($scope.pubkey, -1)
        .then(function(result) {
          console.log(result); // Allow to discover data structure
          if (result && result.tx && result.tx.history) {
            $scope.items = result.tx.history;

            // [NEW] data for input chart
            $scope.inputChart = {
              data: [500, 100, 64],
              labels: ['2RFPQGxYraKTFKKBXgpNn1QDEPdFM7rHNu7HdbmmF43v','5U2xuAUEPFeUQ4zpns6Zn33Q1ZWaHxEd3sPx689ZpaZV','2ny7YAdmzReQxAayyJZsyVYwYhVyax2thKcGknmQy5nQ']
            };

            // [NEW] data for output chart
            $scope.outputChart = {
              data: [650, 240, 154],
              labels: ['2RFPQGxYraKTFKKBXgpNn1QDEPdFM7rHNu7HdbmmF43v','5U2xuAUEPFeUQ4zpns6Zn33Q1ZWaHxEd3sPx689ZpaZV','2ny7YAdmzReQxAayyJZsyVYwYhVyax2thKcGknmQy5nQ']
            };

          }

          // store the account balance
          $scope.balance = (result && result.balance) || 0;
        });
    });

    // [NEW] load chart data: received amount by pubkey
    $scope.computeChartData = function(txArray) {

      // Sum TX amount, with a group by pubkey
      var sumByPubkeys = {};
      _.forEach(txArray, function (tx) {
        sumByPubkeys[tx.pubkey] = sumByPubkeys[tx.pubkey] || {
              label: tx.uid || tx.pubkey,
              amount: 0
            };
        sumByPubkeys[tx.pubkey].amount += tx.amount;
      });

      // Get values (from the map), then sort (desc) on sum
      var sumItems = _.sortBy(_.values(sumByPubkeys), 'amount').reverse();

      // Return arrays expected by angular-chart
      return {
        data: _.pluck(sumItems, 'amount'),
        labels: _.pluck(sumItems, 'label'),
        colors: gpColor.scale.custom(sumItems.length)
      };
    };
  });


