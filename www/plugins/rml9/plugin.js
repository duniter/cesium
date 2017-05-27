
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = true; // csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      PluginServiceProvider
        .extendState('app.view_wallet_tx', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/button.html",
              controller: 'Rml9Ctrl'
            }
          }
        })
      ;
    }
  })

  /**
   * Les controlleurs sont chargés de gérer faire la liaison entre les services d'accès aux données, et l'interface graphique.
   *
   * Celui-ci sert à étendre la page 'Mes opérations'
   */
  .controller('Rml9Ctrl', function($scope, $state, PluginService, FileSaver, BMA, csWallet) {
    'ngInject';

    $scope.extensionPoint = PluginService.extensions.points.current.get();

    // Manage click on the export button
    $scope.onButtonClick = function() {

      var pubkey = csWallet.data.pubkey;

      BMA.tx.history.all({pubkey: pubkey})
        .then(function(res){
          if (!res || !res.history) return;
          console.log(res.history);

          /*var allTx = res.history.received.reduce(function(allTx, tx){
            return res.concat(tx.);
          }, []);*/

          //var saveIdFile = new Blob(["THis is a content"], {type: 'text/plain; charset=utf-8'});
          //FileSaver.saveAs(saveIdFile, 'transactions.txt');
        });
    };
  }
);


