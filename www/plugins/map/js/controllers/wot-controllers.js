
angular.module('cesium.map.wot.controllers', ['cesium.services', 'cesium.map.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.wot_lookup', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/wot/lookup_extend.html"
            }
          }
        });

      $stateProvider
        .state('app.view_wot_map', {
          url: "/wot/map?c&center",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/wot/view_map.html",
              controller: 'MapWotViewCtrl'
            }
          },
          cache: false,
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
      markersSearchLayer,
      icons= {
        member: {
          type: 'awesomeMarker',
            icon: 'person',
            markerColor: 'blue'
        },
        pending: {
          type: 'awesomeMarker',
          icon: 'clock',
          markerColor: 'lightgreen',
          iconColor: 'gray'
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
      cache: 'map-wot',
      layers: {
        overlays: {
          member: {
            type: 'featureGroup',
            name: 'MAP.WOT.VIEW.LAYER.MEMBER',
            visible: true
          },
          pending: {
            type: 'featureGroup',
            name: 'MAP.WOT.VIEW.LAYER.PENDING',
            visible: true
          },
          wallet: {
            type: 'featureGroup',
            name: 'MAP.WOT.VIEW.LAYER.WALLET',
            visible: true
          }
        }
      },
      bounds: {},
      markers: {},
      loading: true
    }, $scope.mapId);

    // [NEW] When opening the view
    $scope.enter = function(e, state) {
      if ($scope.loading) {

        // Load the map (and init if need)
        $scope.loadMap()
          .then($scope.load)
      }
      else {
        // Make sur to have previous center coordinate defined in the location URL
        $scope.updateLocationHref();
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

    // View leave: store map options (center) to cache
    $scope.leave = function() {
      if ($scope.map.cache) {
        MapUtils.cache.save($scope.map);
      }
    };
    $scope.$on('$ionicView.leave', $scope.leave);

    $scope.loadMap = function() {
      return leafletData.getMap($scope.mapId).then(function(map) {
        if (!$scope.map.loading) return map; // already loaded

        // Add a refresh button
        if (!UIUtils.screen.isSmall()) {
          L.easyButton('icon ion-refresh', function(btn, map){
              return $scope.load(map);
            },
            {position: 'topright'}
          ).addTo(map);
        }

        // Add loading control
        L.Control.loading({
          position: 'topright',
          separate: true
        }).addTo(map);

        // Add localize me control
        MapUtils.control.localizeMe()
          .addTo(map);

        // Add search control
        markersSearchLayer = L.layerGroup({visible: false});
        var searchTip = $interpolate($templateCache.get('plugins/map/templates/wot/item_search_tooltip.html'));
        MapUtils.control.search({
          layer: markersSearchLayer,
          propertyName: 'title',
          buildTip: function (text, val) {
            return searchTip(val.layer.options);
          },
          moveToLocation: function(lnglat, title, map) {
            if(this.options.zoom)
              this._map.setView(lnglat, this.options.zoom);
            else
              this._map.panTo(lnglat);
            var popupMarkerId = lnglat.layer && lnglat.layer.options && lnglat.layer.options.popupMarkerId;
            $timeout(function(){
              var popupMarker = popupMarkerId && _.find(map._layers, function(layer) {
                  return (layer.options && layer.options.id === popupMarkerId);
                });
              popupMarker && popupMarker.openPopup();
            }, 400);
          },
          firstTipSubmit: true,
          tooltipLimit: 50,
          hideMarkerOnCollapse: true
        }).addTo(map);

        // Add marker cluster layer
        var extractMarkerLayer = function(marker) {
          return marker.options && marker.options.layer;
        };
        var markerClusterLayer = L.markerClusterGroup({
          disableClusteringAtZoom: MapUtils.constants.LOCALIZE_ZOOM,
          maxClusterRadius: 65,
          showCoverageOnHover: false,
          iconCreateFunction: function (cluster) {
            var countByLayer = _.countBy(cluster.getAllChildMarkers(), extractMarkerLayer);
            var markerColor = countByLayer.member ? 'blue' : (countByLayer.pending ? 'lightgreen' : 'lightgray');
            var childCount = cluster.getChildCount();
            var className = 'marker-cluster ' + markerColor + ' marker-cluster-';
            if (childCount < 10) {
              className += 'small';
            } else if (childCount < 100) {
              className += 'medium';
            } else {
              className += 'large';
            }
            return L.divIcon({ html: '<div><span>' + childCount + '</span></div>', className: className, iconSize: new L.Point(40, 40) });
          }
        });
        map.eachLayer(function(layer) {
          // Add capabilities of 'featureGroup.subgroup', if layer is a group
          if (layer.addLayer){
            angular.extend(layer, L.featureGroup.subGroup(markerClusterLayer));
          }
        });
        markerClusterLayer.addTo(map);

        $scope.map.loading = false;
        return map;
      });
    };

    // Load markers data
    $scope.load = function(map) {
      if (!map) {
        return leafletData.getMap($scope.mapId).then(function(map) {
          return $scope.load(map); // loop with the map object
        });
      }

      $scope.loading = true;
      // Show loading indicator
      map.fire('dataloading');

      var options = {
        fields: {
          description: !UIUtils.screen.isSmall()
        }
      };

      // Load wot data
      return mapWot.load(options)

        .then(function(res) {
          var markers = {};

          // Clean search layer
          markersSearchLayer.clearLayers();

          if (res && res.length) {

            var formatPubkey = $filter('formatPubkey');
            var markerTemplate = $templateCache.get('plugins/map/templates/wot/popup_marker.html');

            _.forEach(res, function (hit) {
              var type = hit.pending ? 'pending' : (hit.uid ? 'member' : 'wallet');
              var shortPubkey = formatPubkey(hit.pubkey);
              var id = (hit.uid ? (hit.uid + ':' + hit.pubkey) : hit.pubkey).replace(/-/g, '_');
              var marker = {
                layer: type,
                icon: icons[type],
                opacity: hit.uid ? 1 : 0.7,
                title: hit.name + ' | ' + shortPubkey,
                lat: hit.geoPoint.lat,
                lng: hit.geoPoint.lon,
                getMessageScope: function () {
                  var scope = $scope.$new();
                  scope.hit = hit;
                  return scope;
                },
                focus: false,
                message: markerTemplate,
                id: id
              };
              markers[id] = marker;

              // Create a search marker (will be hide)
              var searchText = hit.name + ((hit.uid && hit.uid != hit.name) ? (' | ' + hit.uid) : '') + ' | ' + shortPubkey;
              var searchMarker = angular.merge({
                type: type,
                opacity: 0,
                icon: L.divIcon({
                  className: type + ' ng-hide',
                  iconSize: L.point(0, 0)
                })
              }, {title: searchText, pubkey: hit.pubkey, uid: hit.uid, name: hit.name, pending: hit.pending, popupMarkerId: id});
              markersSearchLayer.addLayer(new L.Marker({
                  lat: hit.geoPoint.lat,
                  lng: hit.geoPoint.lon
                },
                searchMarker));
            });
          }
          $scope.map.markers = markers;
          $scope.loading = false;

          // hide loading indicator
          map.fire('dataload');
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
