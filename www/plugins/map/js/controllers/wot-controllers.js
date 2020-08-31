
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
                              ionicReady, $rootScope,
                              leafletData, UIUtils, csSettings, csWallet, MapUtils, mapWot) {
  'ngInject';

  // Initialize the super classes and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', { $scope: $scope}));
  angular.extend(this, $controller('ESWotIdentityViewCtrl', {$scope: $scope}));

  var
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

  var layers = {
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
  };

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
      var now = Date.now();
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
      //_.forEach(layers, function(layer) {
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


        if (res && res.length) {

          var formatPubkey = $filter('formatPubkey');
          var markerTemplate = $templateCache.get('plugins/map/templates/wot/popup_marker.html');


          _.forEach(res, function (hit) {
            var type = hit.pending ? 'pending' : (hit.uid ? 'member' : 'wallet');
            var id = hit.index + '_' + (hit.id || (hit.uid ? (hit.uid + ':' + hit.pubkey) : hit.pubkey)).replace(/-/g, '_');
            var title = hit.name + ' | ' + formatPubkey(hit.pubkey);
            var marker = {
              layer: type,
              icon: icons[type],
              opacity: hit.uid ? 1 : 0.7,
              title: title,
              lat: hit.geoPoint.lat,
              lng: hit.geoPoint.lon,
              getMessageScope: function () {
                //console.debug('[map] Loading marker ' + title + "...");
                var markerScope = $scope.$new();
                markerScope.loadingMarker = true;
                markerScope.formData = {};
                markerScope.$applyAsync(function() {
                  markerScope.formData = {
                    pubkey: hit.pubke,
                    uid: hit.uid,
                    name: title,
                    profile: hit
                  };
                  markerScope.loadingMarker = false;
                });
                return markerScope;
              },
              focus: false,
              message: markerTemplate,
              id: id
            };
            markers[id] = marker;
          });
        }

        $scope.map.markers = markers;

        return $timeout(function(){

          // hide loading indicator
          $scope.loading = false;
          map.fire('dataload');

          UIUtils.loading.hide();
        });
      })
      .catch(function(err) {
        $scope.map.markers = {};
        // hide loading indicator
        $scope.loading = false;
        map.fire('dataload');
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
