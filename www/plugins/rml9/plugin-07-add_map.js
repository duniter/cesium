
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
              templateUrl: "plugins/rml9/templates/07-button.html"
            }
          }
        })

        // Extension de 'Mes opérations' : insertion d'un bouton
        .extendState('app.view_wallet_tx', {
             points: {
               'buttons': {
                 templateUrl: "plugins/rml9/templates/07-button.html"
             }
           }
        });

      // [NEW] Ajout d'une nouvelle page #/app/rml9
      $stateProvider
        .state('app.rml9', {
          url: "/rml9/:pubkey",
          views: {
            'menuContent': {
              templateUrl: "plugins/rml9/templates/07-view.html",
              controller: 'Rml9ViewCtrl'
            }
          }
        });
    }

  })

  // [NEW] Manage events from the page #/app/rml9
  .controller('Rml9ViewCtrl', function($scope) {
    'ngInject';

    $scope.map = {
      center: {
        lat: 48.19,
        lng: -0.66,
        zoom: 4
      },
      defaults: {
        scrollWheelZoom: false
      }
    };

    var data = {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [-0.66, 48.19]
      },
      "properties": {
        "name": "Dinagat Islands"
      }
    };


    $scope.map.geojson ={
      data: data,
      style: {
        fillColor: "green",
        weight: 2,
        opacity: 1,
        color: 'white',
        dashArray: '3',
        fillOpacity: 0.7
      }
    };

    // [NEW] When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {
      console.log("[RML9] Opening the view...");


    });
  });


