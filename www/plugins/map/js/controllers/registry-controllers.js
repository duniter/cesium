
angular.module('cesium.map.registry.controllers', ['cesium.services', 'cesium.map.services', 'cesium.map.help.controllers'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.registry_lookup_lg', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/registry/lookup_extend.html",
              controller: "ESExtensionCtrl"
            }
          }
        });

      $stateProvider
        .state('app.view_registry_map', {
          url: "/page/map?c&center",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/registry/view_map.html",
              controller: 'MapRegistryViewCtrl'
            }
          },
          // Seems to works without cache ??
          //cache: false,
          data: {
            silentLocationChange: true
          }
        });
    }
  })

  // Map view of the registry
  .controller('MapRegistryViewCtrl', MapRegistryViewController)

;


function MapRegistryViewController($scope, $filter, $templateCache, $interpolate, $timeout, $location, $translate, $q,
                              leafletData, UIUtils, csSettings, csWallet, MapUtils, mapRegistry) {
  'ngInject';

  var
    // Create a  hidden layer, to hold search markers
    markersSearchLayer,
    icons= {
      group: {
        type: 'awesomeMarker',
          icon: 'person-stalker',
          markerColor: 'green'
      },
      shop: {
        type: 'awesomeMarker',
        icon: 'page-shop',
        markerColor: 'green'
      },
      association: {
        type: 'awesomeMarker',
        icon: 'page-association',
        markerColor: 'green'
      },
      company: {
        type: 'awesomeMarker',
        icon: 'page-company',
        markerColor: 'green'
      },
      institution: {
        type: 'awesomeMarker',
        icon: 'page-institution',
        markerColor: 'green'
      }
    };

  $scope.loading = true;
  $scope.mapId = 'map-wot-' + $scope.$id;

  $scope.map = MapUtils.map({
    cache: 'map-registry',
    layers: {
      overlays: {
        // Pages
        shop: {
          type: 'featureGroup',
          name: 'MAP.WOT.VIEW.LAYER.SHOP',
          visible: true
        },
        association: {
          type: 'featureGroup',
          name: 'MAP.WOT.VIEW.LAYER.ASSOCIATION',
          visible: true
        },
        company: {
          type: 'featureGroup',
          name: 'MAP.WOT.VIEW.LAYER.COMPANY',
          visible: true
        },
        institution: {
          type: 'featureGroup',
          name: 'MAP.WOT.VIEW.LAYER.INSTITUTION',
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
      if (state.stateParams && state.stateParams.c) {
        var cPart = state.stateParams.c.split(':');
        $scope.map.center.lat = parseFloat(cPart[0]);
        $scope.map.center.lng = parseFloat(cPart[1]);
        $scope.map.center.zoom = parseInt(cPart[2]);
      }

      $scope.$watch("map.center", function() {
        if (!$scope.loading) {
          return $timeout(function() {
            $scope.updateLocationHref();
          }, 300);
        }
      }, true);

      // Load the map (and init if need)
      $scope.loadMap()
        .then(function() {
          if (csWallet.isLogin()) {
            $scope.showHelpTip();
          }
          return $scope.load();
        });
    }
    else {
      // Make sure to have previous center coordinate defined in the location URL
      $scope.updateLocationHref();
      if (csWallet.isLogin()) {
        $scope.showHelpTip();
      }
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.loadMap = function() {
    return $q.all([
      $translate(['COMMON.BTN_HELP_TOUR_SCREEN', 'COMMON.BTN_REFRESH', 'MAP.COMMON.BTN_LOCALIZE_ME']),
      leafletData.getMap($scope.mapId)
    ]).then(function(res) {
      var translations = res[0];
      var map = res[1];
      if (!$scope.map.loading) return map; // already loaded

      if (!UIUtils.screen.isSmall()) {
        // Add a start tour button
        /*L.easyButton({
            position: 'topright',      // inherited from L.Control -- the corner it goes in
            type: 'replace',          // set to animate when you're comfy with css
            leafletClasses: true,     // use leaflet classes to style the button?
            states:[{                 // specify different icons and responses for your button
              stateName: 'show-help-tour',
              onClick: $scope.startHelpTour,
              title: translations['COMMON.BTN_HELP_TOUR_SCREEN'],
              icon: 'icon ion-easel'
            }]
          }
        ).addTo(map);*/

        // Add a refresh button
        L.easyButton({
            position: 'topright',      // inherited from L.Control -- the corner it goes in
            type: 'replace',          // set to animate when you're comfy with css
            leafletClasses: true,     // use leaflet classes to style the button?
            states:[{                 // specify different icons and responses for your button
              stateName: 'refresh',
              onClick: function(btn, map){
                return $scope.load(map);
              },
              title: translations['COMMON.BTN_REFRESH'],
              icon: 'icon ion-refresh'
            }]
          }
        ).addTo(map);
      }

      // Add loading control
      L.Control.loading({
        position: 'topright',
        separate: true
      }).addTo(map);

      // Add localize me control
      MapUtils.control.localizeMe({
          title: translations['MAP.COMMON.BTN_LOCALIZE_ME']
        })
        .addTo(map);

      // Add search control
      markersSearchLayer = L.layerGroup({visible: false});
      var searchTip = $interpolate($templateCache.get('plugins/map/templates/registry/item_search_tooltip.html'));
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
        tooltipLimit: 50
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

      // Bind map with options (e.g. to received overlays visibility updates)
      // Cache no more need, as view is not cached
      //MapUtils.cache.bind($scope, $scope.mapId, $scope.map);

      $scope.map.loading = false;
      return map;
    });
  };

  // Load markers data
  $scope.load = function(map) {
    if (!map) {
      return leafletData.getMap($scope.mapId)
      // loop with the map object
        .then($scope.load);
    }

    $scope.loading = true;
    // Show loading indicator
    map.fire('dataloading');

    var options = {
      fields: {
        description: !UIUtils.screen.isSmall()
      }
    };

    // Load wot data, from service
    return mapRegistry.load(options)

      .then(function(res) {
        var markers = {};

        // Clean search layer
        markersSearchLayer.clearLayers();

        if (res && res.length) {

          var formatPubkey = $filter('formatPubkey');
          var userMarkerTemplate = $templateCache.get('plugins/map/templates/wot/popup_marker.html');
          var pageMarkerTemplate = $templateCache.get('plugins/map/templates/wot/popup_page_marker.html');

          _.forEach(res, function (hit) {
            var type = hit.type || (hit.pending ? 'pending' : (hit.uid ? 'member' : 'wallet'));
            var shortPubkey = formatPubkey(hit.pubkey);
            var id = hit.index + '_' + (hit.id || (hit.uid ? (hit.uid + ':' + hit.pubkey) : hit.pubkey)).replace(/-/g, '_');
            var marker = {
              layer: type,
              icon: icons[type],
              opacity: hit.uid || hit.type ? 1 : 0.7,
              title: hit.name + ' | ' + shortPubkey,
              lat: hit.geoPoint.lat,
              lng: hit.geoPoint.lon,
              getMessageScope: function () {
                var scope = $scope.$new();
                scope.hit = hit;
                return scope;
              },
              focus: false,
              message: hit.type ? pageMarkerTemplate : userMarkerTemplate,
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
      })
      .catch(function(err) {
        $scope.map.markers = {};
        $scope.loading = false;
        UIUtils.onError('MAP.WOT.ERROR.LOAD_POSITION_FAILED')(err);
      });
  };

  // Update the browser location, to be able to refresh the page
  $scope.updateLocationHref = function(centerHash) {
    // removeIf(device)
    var params = $location.search() || {};
    if (!params.c || !MapUtils.center.isDefault($scope.map.center)) {
      centerHash = centerHash || '{0}:{1}:{2}'.format($scope.map.center.lat.toFixed(4), $scope.map.center.lng.toFixed(4), $scope.map.center.zoom);
      $location.search({c: centerHash}).replace();
    }
    // endRemoveIf(device)
  };

  // removeIf(device)
  // Update the browser location, to be able to refresh the page
  // FIXME: not need, should be removed
  $scope.$on("centerUrlHash", function(event, centerHash) {
    if (!$scope.loading) {

      return $timeout(function() {
        $scope.updateLocationHref(centerHash);
      }, 300);
    }
  });
  // endRemoveIf(device)


  /* -- help tip -- */

  // Show help tour
  $scope.startHelpTour = function() {
    return $scope.showHelpTip(0, true);
  };

  // Show help tip
  $scope.showHelpTip = function(index, isTour) {
    index = angular.isDefined(index) ? index :
      (angular.isNumber(csSettings.data.helptip.mapwot) ? csSettings.data.helptip.mapwot : 0);
    isTour = angular.isDefined(isTour) ? isTour : false;

    if (index < 0 || index > 2/*max steps*/) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(isTour, 'MapHelpTipCtrl');
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    // Set isTour and mapId
    helptipScope.tour = isTour;
    helptipScope.mapId = $scope.mapId;

    return helptipScope.startMapWotTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.mapwot = angular.isNumber(csSettings.data.helptip.mapwot) ?
          Math.max(endIndex, csSettings.data.helptip.mapwot) :
          endIndex;
        csSettings.store();
      });
  };
}
