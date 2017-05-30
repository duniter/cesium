
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

      // Récupération de la clé publique, stockée dans le contexte ($scope.formData) de la page
      var pubkey = $scope.formData.pubkey;
      if (!pubkey) return;

      console.debug("[RML9] calling onExportButtonClick()");
    };
  })
;


