
angular.module('cesium.map.common.controllers', ['cesium.services', 'cesium.map.services'])

  .controller('MapEditPositionAbstractCtrl', MapEditPositionAbstractController)

;

/**
 * An abstract controller, that allow to edit psotion, using a map view (e.g. used by profile and page edition)
 * @param $scope
 * @param $timeout
 * @param $q
 * @param MapUtils
 * @param $translate
 * @constructor
 */
function MapEditPositionAbstractController($scope, $timeout, $q, MapUtils, $translate) {
  'ngInject';

  var listeners = [];
  $scope.mapId = 'map-user-profile-' + $scope.$id;
  $scope.map = MapUtils.map({
    markers: {},
    center: {
      zoom: 13
    }
  });
  $scope.loading = true;
  $scope.mapId = $scope.mapId || 'map-abstract-' + $scope.$id; // Should have beed override by sub-controllers

  $scope.enter = function(e, state) {

    // Wait parent controller load the profile
    if (!$scope.formData || (!$scope.formData.title && !$scope.formData.geoPoint)) {
      return $timeout($scope.enter, 500);
    }

    $scope.loading = true;
    return $scope.load();
  };
  $scope.$on('$csExtension.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.load = function() {

    // no position define: remove existing listener
    if (!$scope.formData.geoPoint || !$scope.formData.geoPoint.lat || !$scope.formData.geoPoint.lon) {
      _.forEach(listeners, function(listener){
        listener(); // unlisten
      });
      listeners = [];
      delete $scope.map.markers.geoPoint;
      $scope.loading = false;
      return $q.when();
    }

    // If no marker exists on map: create it
    if (!$scope.map.markers.geoPoint) {

      return $translate('MAP.PROFILE.MARKER_HELP')
        .then(function(helpText) {

          $scope.map.markers.geoPoint = {
            message: helpText,
            lat: parseFloat($scope.formData.geoPoint.lat),
            lng: parseFloat($scope.formData.geoPoint.lon),
            draggable: true,
            focus: true
          };
          angular.extend($scope.map.center, {
            lat: $scope.map.markers.geoPoint.lat,
            lng: $scope.map.markers.geoPoint.lng
          });

          // Listening changes
          var listener = $scope.$watch('map.markers.geoPoint', function() {
            if ($scope.loading) return;
            if ($scope.map.markers.geoPoint && $scope.map.markers.geoPoint.lat && $scope.map.markers.geoPoint.lng) {
              $scope.formData.geoPoint = $scope.formData.geoPoint || {};
              $scope.formData.geoPoint.lat = $scope.map.markers.geoPoint.lat;
              $scope.formData.geoPoint.lon = $scope.map.markers.geoPoint.lng;
            }
          }, true);
          listeners.push(listener);


          // Make sure map appear, if shown later
          if (!$scope.ionItemClass) {
            $scope.ionItemClass = 'done in';
          }

          $scope.loading = false;
        });
    }

    // Marker exists: update lat/lon
    else {
      $scope.map.markers.geoPoint.lat = $scope.formData.geoPoint.lat;
      $scope.map.markers.geoPoint.lng = $scope.formData.geoPoint.lon;
    }
  };


  $scope.$watch('formData.geoPoint', function() {
    if ($scope.loading) return;
    $scope.load();
  }, true);

}
