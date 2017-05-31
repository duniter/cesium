
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
    }

  })

  // Manage events from the plugin button
  .controller('Rml9ButtonCtrl', function($scope) {
    'ngInject';

    // Manage click event, on the plugin button
    $scope.onButtonClick = function() {

      // Get the public key, from the page context ($scope.formData)
      var pubkey = $scope.formData.pubkey;
      if (!pubkey) return;
      console.debug("[RML9] call method onButtonClick() on pubkey: " + pubkey);

    };
  })
;


