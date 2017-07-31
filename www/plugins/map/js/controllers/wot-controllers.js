
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

      // Wot map (default position)
      $stateProvider
        .state('app.view_wot_map', {
          url: "/wot/map?c&center",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/wot/view_map.html",
              controller: 'MapWotViewCtrl'
            }
          },
          data: {
            silentLocationChange: true
          }
        });
    }
  })

  // [NEW] Manage events from the page #/app/wot/map
  .controller('MapWotViewCtrl', function($scope, $rootScope, $q, $translate, $state, $stateParams, $filter, $templateCache, $interpolate, $timeout, $ionicHistory,
                                         esGeo, UIUtils, MapUtils, mapWot, leafletData, $location) {
    'ngInject';

    var
      // Create a  hidden layer, to hold search markers
      markersSearchLayer = L.layerGroup({visible: false}),
      loadingControl, searchControl, localizeMe,
      icons= {
        member: {
          type: 'awesomeMarker',
            icon: 'person',
            markerColor: 'blue'
        },
        wallet: {
          type: 'awesomeMarker',
            icon: 'key',
            markerColor: 'lightgray'
        },
        group: {
          type: 'awesomeMarker',
            icon: 'person-stalker',
            markerColor: 'green'
        },
        registry: {
          type: 'awesomeMarker',
            icon: 'person-stalker', // TODO
            markerColor: 'green' // TODO
        }
      };

    $scope.loading = true;
    $scope.mapId = 'map-wot-' + $scope.$id;
    $scope.map = MapUtils.map({
      layers: {
        overlays: {
          wallet: {
            type: 'group',
            name: 'MAP.WOT.VIEW.LAYER.WALLET',
            visible: true
          },
          member: {
            type: 'group',
            name: 'MAP.WOT.VIEW.LAYER.MEMBER',
            visible: true
          }
        }
      },
      loading: true,
      markers: {}
    });

    // [NEW] When opening the view
    $scope.enter = function(e, state) {
      if ($scope.loading) {

        // Load the map (and init if need)
        $scope.loadMap().then(function(map) {

          // Load indicator
          map.fire('dataloading');

          // Load data
          return $scope.load()

            // Hide loading indicator
            .then(function() {
              map.fire('dataload');
            });
        });
      }
      else {
        // Make sur to have previous center coordinate defined in the location URL
        $scope.updateLocationHref();
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

    $scope.loadMap = function() {
      return leafletData.getMap($scope.mapId).then(function(map) {
        if (!$scope.map.loading) return map; // already loaded

        // Add loading control
        loadingControl = L.Control.loading({
          position: 'topright',
          separate: true
        });
        loadingControl.addTo(map);

        // Add localize me control
        localizeMe = MapUtils.control.localizeMe();
        localizeMe.addTo(map);

        // Add search control
        var searchTip = $interpolate($templateCache.get('plugins/map/templates/wot/item_search_tooltip.html'));
        searchControl = MapUtils.control.search({
          layer: markersSearchLayer,
          propertyName: 'title',
          buildTip: function (text, val) {
            return searchTip(val.layer.options);
          }
        });
        searchControl.addTo(map);

        $scope.map.loading = false;
        return map;
      });
    };

    // Load markers data
    $scope.load = function() {
      $scope.loading = true;

      // Load wot data
      return mapWot.load()

        .then(function(res) {
          if (res && res.length) {

            var formatPubkey = $filter('formatPubkey');
            var markerTemplate = $templateCache.get('plugins/map/templates/wot/popup_marker.html');

            // Sort with member first
            /*res = _.sortBy(res, function(hit) {
             var score = 0;
             score += (!hit.uid) ? 100 : 0;
             return -score;
             });*/

            _.forEach(res, function (hit) {
              var type = hit.uid ? 'member' : 'wallet';
              var shortPubkey = formatPubkey(hit.issuer);
              var marker = {
                layer: type,
                icon: icons[type],
                opacity: 0.8,
                title: hit.title + ' | ' + shortPubkey,
                lat: hit.geoPoint.lat,
                lng: hit.geoPoint.lon,
                getMessageScope: function () {
                  var scope = $scope.$new();
                  scope.hit = hit;
                  return scope;
                },
                focus: false,
                message: markerTemplate
              };
              var id = hit.uid ? (hit.uid + ':' + hit.issuer) : hit.issuer;
              $scope.map.markers[id] = marker;

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
            });
          }

          $scope.loading = false;
        });
    };


    $scope.updateLocationHref = function(centerHash) {
      // removeIf(device)
      var params = $location.search() || {};
      if (!params.c || !MapUtils.center.isDefault($scope.map.center)) {
        centerHash = centerHash || '{0}:{1}:{2}'.format($scope.map.center.lat.toFixed(4), $scope.map.center.lng.toFixed(4), $scope.map.center.zoom);
        $location.search({ c:  centerHash}).replace();
      }
      // endRemoveIf(device)
    };

    // removeIf(device)
    // Update the browser location, to be able to refresh the page
    $scope.$on("centerUrlHash", function(event, centerHash) {
      if (!$scope.loading) {
        return $timeout(function() {
          $scope.updateLocationHref(centerHash);
        }, 300);
      }
    });
    // endRemoveIf(device)

  });
