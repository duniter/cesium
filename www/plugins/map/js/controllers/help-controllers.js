
angular.module('cesium.map.help.controllers', ['cesium.services'])

  .controller('MapHelpTipCtrl', MapHelpTipController)
;


/* ----------------------------
*  Help Tip
* ---------------------------- */
function MapHelpTipController($scope, $controller) {

  // Initialize the super class and extend it.
  angular.extend(this, $controller('HelpTipCtrl', {$scope: $scope}));

  $scope.mapId = undefined; // should be set by caller controllers

  /**
   * Features tour on map WOT
   * @returns {*}
   */
  $scope.startMapWotTour = function(startIndex, hasNext) {

    var steps = [

      function(){
        return $scope.showHelpTip('helptip-map-wot', {
          bindings: {
            content: 'MAP.HELP.TIP.WOT',
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            }
          }
        });
      },

      function(){
        return $scope.showHelpTip(null, {
          selector: '#{0} .leaflet-control-search'.format($scope.mapId),
          bindings: {
            content: 'MAP.HELP.TIP.WOT_BTN_SEARCH',
            icon: {
              position: 'center'
            }
          }
        });
      },

      function () {
        return $scope.showHelpTip(null, {
          selector: '#{0} .leaflet-control-layers'.format($scope.mapId),
          bindings: {
            content: 'MAP.HELP.TIP.WOT_BTN_LAYERS',
            icon: {
              position: 'right'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    // Launch steps
    return $scope.executeStep('mapwot', steps, startIndex);
  };
}
