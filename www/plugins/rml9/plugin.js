
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      // Extend existing view
      PluginServiceProvider
        .extendState('app.view_wallet_tx', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/button.html",
              controller: 'Rml9ButtonCtrl'
            }
          }
        })

        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/button.html",
              controller: 'Rml9ButtonCtrl'
            }
          }
        })
      ;

      // Add new view
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
   * Celui-ci sert à étendre la page 'Mes opérations'
   */
  .controller('Rml9ButtonCtrl', function($scope, $state, PluginService, FileSaver, BMA, csWallet) {
    'ngInject';

    $scope.extensionPoint = PluginService.extensions.points.current.get();

    // Manage click on the export button
    $scope.onButtonClick = function() {
      console.debug("[RML9] calling onButtonClick()");

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


