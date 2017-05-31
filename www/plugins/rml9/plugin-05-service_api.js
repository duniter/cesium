
angular.module('cesium.rml9.plugin', ['cesium.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.rml9;
    if (enable) {

      PluginServiceProvider

        // Extension de la vue d'une identité: ajout d'un bouton
        .extendState('app.wot_identity', {
          points: {
            'buttons': {
              templateUrl: "plugins/rml9/templates/04-button.html",
              controller: 'Rml9ButtonCtrl'
            }
          }
        })

        // Extension de 'Mes opérations' : insertion d'un bouton
        .extendState('app.view_wallet_tx', {
           points: {
             'buttons': {
               templateUrl: "plugins/rml9/templates/04-button.html",
               controller: 'Rml9ButtonCtrl'
           }
         }
       });

      // [NEW] Ajout d'une entrée dans les paramètres générale
      PluginServiceProvider.extendState('app.settings', {
        points: {
          'plugins': {
            templateUrl: "plugins/rml9/templates/04-settings_item.html"
          }
        }
      });
    }

  })

  // Manage events from the plugin button
  .controller('Rml9ButtonCtrl', function($scope, UIUtils,
                                         // [NEW] Service d'accès aux paramètres
                                         csSettings) {
    'ngInject';


    // [NEW] A simple helper method
    function isEnable(settings) {
      return settings.plugins && settings.plugins.rml9 && settings.plugins.rml9.enable;
    }

    // [NEW] Nouvelle variable stockée dans le contexte de la page
    $scope.enable = isEnable(csSettings.data);

    // [NEW] Rafraichir cette variable à chaque changement dans les paramètres
    csSettings.api.data.on.changed($scope, function(settings) {
      console.debug("[RML9] Detect changes in settings!");

      $scope.enable = isEnable(settings);
      console.debug("[RML9] RML9 plugin enable: " + $scope.enable);
    });


    // Click event on button
    $scope.onButtonClick = function() {
      console.debug("[RML9] call function onButtonClick()");
      UIUtils.toast.show("Fine, this plugin works !");
    };
  });


