
angular.module('cesium.rml9.plugin', ['ngFileSaver', 'cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      PluginServiceProvider

      // Extension de la vue d'une identité: ajout d'un bouton
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
        })

        // Ajout d'une entrée dans les paramètres générale
        .extendState('app.settings', {
          points: {
            'plugins': {
              templateUrl: "plugins/rml9/templates/06-settings_item.html"
            }
          }
        });

      // Ajout de la page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/final-view.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
    }

  })

  // [NEW] Manage events from the page #/app/rml9
  .controller('Rml9ViewCtrl', function(BMA, $scope, csTx, FileSaver, gpColor, $filter, $translate, $q) {
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

            // Charts data
            $scope.inputChart = $scope.computeChartData(_.filter(result.tx.history, function(tx) {
              return tx.amount > 0;
            }));
            $scope.outputChart = $scope.computeChartData(_.filter(result.tx.history, function(tx) {
              return tx.amount < 0;
            }));

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

      return $q.all([
        $translate(['RML9.HEADERS.TIME',
          'COMMON.UID',
          'COMMON.PUBKEY',
          'RML9.HEADERS.AMOUNT',
          'RML9.HEADERS.COMMENT']),
        BMA.blockchain.current(),
        csTx.load($scope.pubkey, fromTime)
      ])
        .then(function(result){

          var translations = result[0];
          //TODO : Utiliser plutôt csCurency
          var currentTime = (result[1] && result[1].medianTime) || moment().utc().unix();
          result = result[2];


          if (!result || !result.tx || !result.tx.history) return; // no TX

          var formatDecimal = $filter('formatDecimal');
          var formatDate = $filter('formatDate');

          var headers = [translations['RML9.HEADERS.TIME'],
            translations['COMMON.UID'],
            translations['COMMON.PUBKEY'],
            translations['RML9.HEADERS.AMOUNT'],
            translations['RML9.HEADERS.COMMENT']];
          var content = result.tx.history.reduce(function(res, tx){
            return res.concat([
                formatDate(tx.time),
                tx.uid,
                tx.pubkey,
                formatDecimal(tx.amount/100),
                '"' + tx.comment + '"'
              ].join(';') + '\n');
          }, [headers.join(';') + '\n']);

          var file = new Blob(content, {type: 'text/plain; charset=utf-8'});
          $translate('RML9.FILE_NAME', {pubkey: $scope.pubkey, currentTime : currentTime})
            .then(function(result){
              FileSaver.saveAs(file, result);
            })
        });
    };

    // Load chart data: received amount by pubkey
    $scope.computeChartData = function(txArray) {

      // Sum TX amount, with a group by pubkey
      var sumByPubkeys = {};
      _.forEach(txArray, function (tx) {
        sumByPubkeys[tx.pubkey] = sumByPubkeys[tx.pubkey] || {
            label: tx.uid || tx.pubkey,
            sum: 0
          };
        sumByPubkeys[tx.pubkey].sum += tx.amount;
      });

      // Get values (from the map), then sort (desc) on sum
      var sumItems = _.sortBy(_.values(sumByPubkeys), 'sum').reverse();

      // Return arrays expected by angular-chart
      return {
        data: _.pluck(sumItems, 'sum'),
        labels: _.pluck(sumItems, 'label'),
        colors: gpColor.scale.custom(sumItems.length)
      };
    };
  });


