
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extension de la vue d'une identité
      PluginServiceProvider
        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/buttons.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });

      // Extension de 'Mes opérations'
      /*PluginServiceProvider
        .extendState('app.view_wallet_tx', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/buttons.html",
              controller: 'Rml9ButtonsCtrl'
            }
          }
        });*/

      // Ajout d'une nouvelle vue #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9?pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/view.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
    }


  })

  /**
   * Les controlleurs sont chargés de gérer faire la liaison entre les services d'accès aux données, et l'interface graphique.
   *
   * Celui-ci sert à étendre les vues 'Mes opérations' et celle d'une identité
   */
  .controller('Rml9ButtonsCtrl', function($scope, $state, PluginService, FileSaver, BMA, csWallet) {
    'ngInject';

    $scope.extensionPoint = PluginService.extensions.points.current.get();

    /**
     * Manage click event, on the export button
     */
    $scope.onExportButtonClick = function() {
      console.debug("[RML9] calling onExportButtonClick()");

      var pubkey = $scope.formData.pubkey || csWallet.isLogin() && csWallet.data.pubkey;
      if (!pubkey) return;

      BMA.tx.history.all({pubkey: pubkey})
        .then(function(res){
          if (!res || !res.history) return;

          console.debug("[RML9] TODO: process the TX history:", res.history);

          var fileContent = ["Hello Libre World !\n", "Second line example\n"];
          var file = new Blob(fileContent, {type: 'text/plain; charset=utf-8'});
          FileSaver.saveAs(file, 'transactions.txt');
        });
    };

    /**
     * Manage click event, on the export button
     */
    $scope.onOpenButtonClick = function() {
      console.debug("[RML9] calling onOpenButtonClick()");

      // Get the pubkey from the extended view
      var pubkey = $scope.formData.pubkey || csWallet.isLogin() && csWallet.data.pubkey;

      // Open the RML9 view (#/app/rml9)
      $state.go('app.rml9', {pubkey: pubkey});
    };
  })


  /**
   * Ce controlleur gère la page #/app/rml9
   */
  .controller('Rml9ViewCtrl', function($scope, csWallet) {

    // Call when enter into the view
    $scope.$on('$ionicView.enter', function(e, state) {

      console.log("[RML9] entering RML9 view...");

      // If need, a pubkey could be pass by URL params : #/app/rml9?pubkey=...
      /*
      var pubkey = (state && state.stateParams && state.stateParams.pubkey) || (csWallet.isLogin() && csWallet.data.pubkey);
      if (!pubkey) return;
      */

      $scope.items = [
        {amount: 100, time: 125454702, issuer:'5U2xuAUEPFeUQ4zpns6Zn33Q1ZWaHxEd3sPx689ZpaZV'},
        {amount: -500, time: 125404702, issuer:'2RFPQGxYraKTFKKBXgpNn1QDEPdFM7rHNu7HdbmmF43v'}
      ];


    });


  });


