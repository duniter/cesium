
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
  .controller('MapWotViewCtrl', function($scope, $q, $translate, $state, $filter, $templateCache, $timeout, $ionicHistory,
                                         esGeo, UIUtils, MapData, leafletData) {
    'ngInject';

    var constants = {
      FRANCE: {
        lat: 47.35, lng: 5.65, zoom: 6
      },
      ICONS: {
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
      }
    };
    constants.DEFAULT_CENTER = constants.FRANCE;
    var
      markersSearchLayer,
      searchControl;

    $scope.init = false;
    $scope.loading = true;
    $scope.mapId = 'map-wot-' + $scope.$id;
    $scope.map = {
      center: angular.copy(constants.DEFAULT_CENTER),
      defaults: {
        scrollWheelZoom: true
      },
      layers: {
        baselayers: {
          openStreetMap: {
            name: 'OpenStreetMap',
            type: 'xyz',
            url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
        },
        overlays: {
          member: {
            type: 'group',
            name: '',
            visible: true
          },
          wallet: {
            type: 'group',
            name: '',
            visible: true
          }
        }
      },
      legend: {},
      controls: {
        custom: []
      }
    };

    $scope.init = function() {
      if ($scope.initialized) return $q.when(); // init only once

      return $translate(['MAP.WOT.VIEW.LEGEND.MEMBER', 'MAP.WOT.VIEW.LEGEND.WALLET', 'MAP.WOT.VIEW.SEARCH_DOTS', 'COMMON.SEARCH_NO_RESULT'])
        .then(function(translations){

          // Set layers overlays
          $scope.map.layers.overlays.member.name=translations['MAP.WOT.VIEW.LEGEND.MEMBER'];
          $scope.map.layers.overlays.wallet.name=translations['MAP.WOT.VIEW.LEGEND.WALLET'];

          // Create a  hidden layer, to hold search markers
          markersSearchLayer = L.layerGroup({visible: false});

          // Add search control
          searchControl = L.control.search({
            layer: markersSearchLayer,
            initial: false,
            marker: false,
            propertyName: 'title',
            position: 'topleft',
            zoom: 13,
            buildTip: function(text, val) {
              var marker = val.layer.options;
              var title = marker.name != marker.uid ? marker.name +' ' : '';
              if (marker.type == 'member') {
                return '<a href="#" class="'+marker.type+'">'+title+'<span class="positive"><i class="icon ion-person"></i> '+marker.uid+'</span></a>';
              }
              else {
                return '<a href="#" class="'+marker.type+'">'+title+'<span class="gray"><i class="icon ion-key"></i> '+marker.shortPubkey+'</span></a>';
              }

              return '<a href="#" class="'+marker.type+'">'+title+'</a>';
            },
            textPlaceholder: translations['MAP.WOT.VIEW.SEARCH_DOTS'],
            textErr: translations['COMMON.SEARCH_NO_RESULT'],
            markerLocation: true
          });

          $scope.initialized = true;
        });
    };

    // [NEW] When opening the view
    $scope.enter = function(e, state) {
      if ($scope.loading) {
        console.log("[map] Opening the view... (first time)");

        // remember state, to be able to refresh location
        $scope.stateName = state && state.stateName;
        $scope.stateParams = angular.copy(state && state.stateParams||{});

        // Read state params
        var center;
        if (state.stateParams) {
          if (state.stateParams.lat) {
            center = {};
            center.lat = parseFloat(state.stateParams.lat);
          }
          if (state.stateParams.lng) {
            center = center || {};
            center.lng = parseFloat(state.stateParams.lng);
          }
          if (state.stateParams.zoom) {
            center = center || {};
            center.zoom = parseFloat(state.stateParams.zoom);
          }
          if (center) {
            center = angular.merge({}, constants.DEFAULT_CENTER, center);
          }
        }

        // Init map
        return $scope.init()
          .then(function() {
            // Load data
            return $scope.load(center);
          });
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
              icon: constants.ICONS[type],
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
            }, {title: searchText, shortPubkey: shortPubkey, uid: hit.uid, name: hit.title});
            markersSearchLayer.addLayer(new L.Marker({
                lat: hit.geoPoint.lat,
                lng: hit.geoPoint.lon
              },
              searchMarker));
            return res;
          }, {});

          $scope.map.markers = markers;


          leafletData.getMap($scope.mapId).then(function(map) {
            // Add search control to map
            searchControl.addTo(map);

            // Add center to me control to map
            L.easyButton('icon ion-android-locate', function(btn, map){
              $scope.localizeMe();
            }).addTo(map);

            var needCenterUpdate = center && !angular.equals($scope.map.center, center);
            if (needCenterUpdate) {
              //angular.merge($scope.map.center, center);
              $timeout(function() {
                map.invalidateSize();
                map._resetView(center, center.zoom, true);
              }, 300);
            }
            $scope.loading = false;
            UIUtils.loading.hide();
          });
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
      $scope.stateParams.lat = ($scope.map.center.lat != constants.DEFAULT_CENTER.lat) ? $scope.map.center.lat : undefined;
      $scope.stateParams.lng = ($scope.map.center.lng != constants.DEFAULT_CENTER.lng) ? $scope.map.center.lng : undefined;
      $scope.stateParams.zoom = ($scope.map.center.zoom != constants.DEFAULT_CENTER.zoom) ? $scope.map.center.zoom : undefined;

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
