
angular.module('cesium.map.wot.controllers', ['cesium.services', 'cesium.map.services', 'cesium.map.help.controllers'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.wot_lookup.tab_search', {
          points: {
            'nav-buttons': {
              template: '<button class="button button-icon button-clear" ui-sref="app.view_wot_map"><i class="icon ion-ios-location"></i></button>'
            }
          }
        })

        .extendState('app.wot_lookup_lg', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/wot/lookup_lg_extend.html",
              controller: "ESExtensionCtrl"
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
          // Seems to works without cache ??
          //cache: false,
          data: {
            silentLocationChange: true
          }
        });
    }
  })

  // Map view of the WOT
  .controller('MapWotViewCtrl', MapWotViewController)

;


function MapWotViewController($scope, $filter, $templateCache, $interpolate, $timeout, $location, $translate, $q, $controller,
                              ionicReady,
                              leafletData, UIUtils, csSettings, csWallet, MapUtils, mapWot) {
  'ngInject';

  // Initialize the super classes and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', { $scope: $scope}));
  angular.extend(this, $controller('ESWotIdentityViewCtrl', {$scope: $scope}));

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
      }
    };

  $scope.loading = true;
  $scope.loadingMarker = true;
  $scope.mapId = 'map-wot-' + $scope.$id;

  $scope.map = MapUtils.map({
    cache: 'map-wot',
    layers: {
      overlays: {

        // User profile
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

  // Variables for marker
  $scope.showDescription = false;
  ionicReady().then(function() {
    $scope.enableDescription = !UIUtils.screen.isSmall() && ionic.Platform.grade.toLowerCase() === 'a';
    if (!$scope.enableDescription) {
     console.debug("[map] [wot] Disable profile description.", ionic.Platform.grade);
    }
  });

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

  $scope.enter = function(e, state) {

    if ($scope.loading) {

      UIUtils.loading.show({
        noBackdrop: true // avoid a too long release
      });
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
      var now = new Date().getTime();
      $scope.loadMap()
        .then($scope.load)
        .then(function() {
          console.debug("[map] [wot] Loaded in "+ (Date.now() - now) +"ms");

          $scope.showHelpTip();
        });
    }
    else {
      // Make sure to have previous center coordinate defined in the location URL
      $scope.updateLocationHref();
      $scope.showHelpTip();
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
        L.easyButton({
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
        ).addTo(map);

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
        description: $scope.enableDescription
      }
    };

    // add bounding box
    if ($scope.map.bounds) {
      // FIXME - this is not working well
      //options.bounds = angular.copy($scope.map.bounds);
      //delete options.bounds.options;
    }

    // Load wot data, from service
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
            var id = hit.index + '_' + (hit.id || (hit.uid ? (hit.uid + ':' + hit.pubkey) : hit.pubkey)).replace(/-/g, '_');
            var marker = {
              layer: type,
              icon: icons[type],
              opacity: hit.uid ? 1 : 0.7,
              title: hit.name + ' | ' + shortPubkey,
              lat: hit.geoPoint.lat,
              lng: hit.geoPoint.lon,
              getMessageScope: function () {
                var scope = $scope.$new();
                scope.loadingMarker = true;
                scope.formData = {};
                scope.$applyAsync(function() {
                  scope.formData = {
                    pubkey: hit.pubkey,
                    uid: hit.uid,
                    name: hit.name,
                    profile: hit
                  };
                  scope.loadingMarker = false;
                });
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

        return $timeout(function(){
          $scope.loading = false;

          // hide loading indicator
          map.fire('dataload');

          UIUtils.loading.hide();
        });
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

  /* -- help tip -- */

  // Show help tour
  $scope.startHelpTour = function() {
    return $scope.showHelpTip(0, true);
  };

  // Show help tip
  $scope.showHelpTip = function(index, isTour) {
    if (!isTour && !csWallet.isLogin()) return;

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
