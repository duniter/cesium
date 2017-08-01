
angular.module('cesium.map.user.controllers', ['cesium.services', 'cesium.map.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.user_edit_profile', {
          points: {
            'after-position': {
              templateUrl: 'plugins/map/templates/user/edit_profile_extend.html',
              controller: 'MapEditProfileViewCtrl'
            }
          }
        });
    }
  })

  // [NEW] Manage events from the page #/app/wot/map
  .controller('MapEditProfileViewCtrl', function($scope, $timeout, $q, MapUtils, $translate) {
    'ngInject';

    var listeners = [];
    $scope.mapId = 'map-user-profile-' + $scope.$id;
    $scope.map = MapUtils.map({
      markers: {},
      center: {
        zoom: 13
      },
      defaults: {
        tileLayerOptions: {
          attribution: '© <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      }
    });
    $scope.loading = true;

    $scope.enter = function(e, state) {

      // Wait parent controller load the profile
      if (!$scope.formData || !$scope.formData.title) {
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

  });
