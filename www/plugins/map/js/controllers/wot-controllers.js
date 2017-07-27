
angular.module('cesium.map.wot.controllers', ['cesium.services', 'cesium.map.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

      // Extension de la vue d'une identité: ajout d'un bouton
        .extendState('app.wot_lookup', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/wot/lookup_extend.html"
            }
          }
        });

      // [NEW] Ajout d'une nouvelle page #/app/wot/map
      $stateProvider
        .state('app.view_wot_map', {
          url: "/wot/map?lat&lng&zoom",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/wot/view_map.html",
              controller: 'MapWotViewCtrl'
            }
          }
        });
    }

    L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion';
  })

  // [NEW] Manage events from the page #/app/wot/map
  .controller('MapWotViewCtrl', function($scope, $q, $translate, $state, $filter, $templateCache, $interpolate, $timeout, $ionicHistory,
                                         esGeo, UIUtils, MapUtils, MapData, leafletData) {
    'ngInject';

    var
      // Create a  hidden layer, to hold search markers
      markersSearchLayer = L.layerGroup({visible: false});

    $scope.init = false;
    $scope.loading = true;
    $scope.mapId = 'map-wot-' + $scope.$id;
    $scope.map = MapUtils.map({
      layers: {
        overlays: {
          member: {
            type: 'group',
            name: 'MAP.WOT.VIEW.LEGEND.MEMBER',
            visible: true
          },
          wallet: {
            type: 'group',
            name: 'MAP.WOT.VIEW.LEGEND.WALLET',
            visible: true
          }
        }
      }
    });

    // [NEW] When opening the view
    $scope.enter = function(e, state) {
      if ($scope.loading) {
        console.log("[map] Opening the view... (first time)");

        // remember state, to be able to refresh location
        $scope.stateName = state && state.stateName;
        $scope.stateParams = angular.copy(state && state.stateParams||{});

        // Read center from state params
        var center = MapUtils.center(state.stateParams);

        // Load data
        return $scope.load(center);
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

    // Load markers data
    $scope.load = function(center) {
      $scope.loading = true;

      // removeIf(no-device)
      UIUtils.loading.show();
      // endRemoveIf(no-device)

      return MapData.load()
        .then(function(res) {
          if (!res || !res.length) {
            $scope.loading = false;
            return;
          }

          var formatPubkey = $filter('formatPubkey');
          var markerTemplate = $templateCache.get('plugins/map/templates/wot/popup_marker.html');

          // Sort with member first
          res = _.sortBy(res, function(hit) {
            var score = 0;
            score += (!hit.uid) ? 100 : 0;
            return -score;
          });

          var markers = res.reduce(function(res, hit) {
            var type = hit.uid ? 'member' : 'wallet';
            var shortPubkey = formatPubkey(hit.issuer);
            var marker = {
              layer: type,
              icon: MapUtils.icon(type),
              title: hit.title + ' | ' + shortPubkey,
              lat: hit.geoPoint.lat,
              lng: hit.geoPoint.lon,
              getMessageScope: function() {
                var scope = $scope.$new();
                scope.hit = hit;
                return scope;
              },
              focus: false,
              message: markerTemplate
            };
            res[hit.issuer] = marker;

            // Create a search marker (will be hide)
            var searchText = hit.title + ((hit.uid && hit.uid != hit.title) ? (' | ' + hit.uid) : '') + ' | ' + shortPubkey;
            var searchMarker = angular.merge({
              type: type,
              opacity: 0,
              icon: L.divIcon({
                className: type + ' ng-hide',
                iconSize: L.point(0, 0)
              })
            }, {title: searchText, issuer: hit.issuer, uid: hit.uid, name: hit.title});
            markersSearchLayer.addLayer(new L.Marker({
                lat: hit.geoPoint.lat,
                lng: hit.geoPoint.lon
              },
              searchMarker));
            return res;
          }, {});

          $scope.map.markers = markers;
          $scope.loading = false;
          UIUtils.loading.hide();

          return leafletData.getMap($scope.mapId);
        })
        .then(function(map) {
          // Update map center (if need)
          var needCenterUpdate = center && !angular.equals($scope.map.center, center);
          if (needCenterUpdate) {
            MapUtils.updateCenter(map, center);
          }

          // Add localize me control
          MapUtils.control.localizeMe().addTo(map);

          // Add search control
          var searchTip = $interpolate($templateCache.get('plugins/map/templates/wot/item_search_tooltip.html'));
          MapUtils.control.search({
            layer: markersSearchLayer,
            propertyName: 'title',
            buildTip: function(text, val) {
              return searchTip(val.layer.options);
            }
          }).addTo(map);
        });
    };

    // Update the browser location, to be able to refresh the page
    $scope.updateLocation = function() {

      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: true,
        historyRoot: false
      });

      $scope.stateParams = $scope.stateParams || {};
      $scope.stateParams.lat = ($scope.map.center.lat != MapUtils.constants.DEFAULT_CENTER.lat) ? $scope.map.center.lat : undefined;
      $scope.stateParams.lng = ($scope.map.center.lng != MapUtils.constants.DEFAULT_CENTER.lng) ? $scope.map.center.lng : undefined;
      $scope.stateParams.zoom = ($scope.map.center.zoom != MapUtils.constants.DEFAULT_CENTER.zoom) ? $scope.map.center.zoom : undefined;

      $state.go($scope.stateName, $scope.stateParams, {
        reload: false,
        inherit: true,
        notify: false}
      );
    };

    $scope.localizeMe = function() {
      return esGeo.point.current()
        .then(function(res) {
          $scope.map.center = {
            lat: res.lat,
            lng: res.lon,
            zoom: 14
          };
        })
        .catch(UIUtils.onError('MAP.ERROR.LOCALIZE_ME_FAILED'));
    };

    // removeIf(device)
    $scope.onMapCenterChanged = function() {
      if (!$scope.loading) {
        $timeout($scope.updateLocation, 500);
      }
    };
    $scope.$watch('map.center', $scope.onMapCenterChanged, true);
    // endRemoveIf(device)

  });
