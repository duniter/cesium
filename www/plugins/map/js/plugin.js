
angular.module('cesium.map.plugin', ['cesium.services'])

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
          cache: false,
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/wot/map.html",
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

    $scope.loading = true;

    var constants = {
      FRANCE: {
        lat: 47.35, lng: 5.65, zoom: 6
      }
    };
    constants.DEFAULT_CENTER = constants.FRANCE;

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
      legend: {}
    };

    var icons = {
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

    var markersLayer = L.layerGroup({
      visible: false
    });

    //$scope.$on()
    //$scope.map.controls.custom.push(searchControl);

    // [NEW] When opening the view
    $scope.$on('$ionicView.enter', function(e, state) {

      if ($scope.loading) {
        console.log("[map] Opening the view... (first time)");

        // remember state, to be able to refresh location
        $scope.stateName = state && state.stateName;
        $scope.stateParams = angular.copy(state && state.stateParams||{});

        var center = angular.copy(constants.DEFAULT_CENTER);
        if (state.stateParams) {
          if (state.stateParams && state.stateParams.lat) {
            center.lat = parseFloat(state.stateParams.lat);
          }
          if (state.stateParams && state.stateParams.lng) {
            center.lng = parseFloat(state.stateParams.lng);
          }
          if (state.stateParams && state.stateParams.zoom) {
            center.zoom = parseFloat(state.stateParams.zoom);
          }
        }

        $scope.load(center);
      }
      else {
        console.log("[map] Opening the view... NOT the first time !");
      }
    });

    $scope.load = function(center) {
      center = center||constants.DEFAULT_CENTER;

      $scope.loading = true;

      // removeIf(no-device)
      UIUtils.loading.show();
      // endRemoveIf(no-device)

      $q.all([
        $translate(['MAP.WOT.VIEW.LEGEND.MEMBER', 'MAP.WOT.VIEW.LEGEND.WALLET', 'MAP.WOT.VIEW.SEARCH_DOTS', 'COMMON.SEARCH_NO_RESULT']),
        MapData.load()
      ])
      .then(function(res) {
        var translations = res[0];
        res = res[1];
        if (!res || !res.length) return;

        var overlaysNames = {
          member: translations['MAP.WOT.VIEW.LEGEND.MEMBER'],
          wallet: translations['MAP.WOT.VIEW.LEGEND.WALLET']
        };

        $scope.map.layers.overlays.member.name=overlaysNames.member;
        $scope.map.layers.overlays.wallet.name=overlaysNames.wallet;

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
            icon: icons[type],
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
          markersLayer.addLayer(new L.Marker({
              lat: hit.geoPoint.lat,
              lng: hit.geoPoint.lon
            },
            searchMarker));
          return res;
        }, {});

        $scope.map.markers = markers;
        angular.merge($scope.map.center, center);


        $scope.loading = false;
        UIUtils.loading.hide();
        leafletData.getMap().then(function(map) {

          // Control: search
          L.control.search({
            layer: markersLayer,
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
          }).addTo(map);

          L.easyButton('<i class="icon ion-ios-location"></i>', function(btn, map){
            return esGeo.point.current()
              .then(function(res) {
                console.log(res);
                $scope.map.center = {
                  lat: res.lat,
                  lng: res.lon,
                  zoom: 14
                };
              });
          }).addTo(map);

          map.invalidateSize();
          map._resetView(map.getCenter(), map.getZoom(), true);
        });
      });
    };

    $scope.updateLocation = function() {
      $ionicHistory.nextViewOptions({
        disableAnimate: true,
        disableBack: true,
        historyRoot: true
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

    $scope.centerMe = function() {
      $scope.map.center.autoDiscover = true;
      /*esGeo.point.current()
        .then(function() {

        })*/
    };

    $scope.onMapCenterChanged = function() {
      if (!$scope.loading) {
        $timeout($scope.updateLocation, 500);
      }
    };
    $scope.$watch('map.center', $scope.onMapCenterChanged, true);

  })

  // [NEW] Manage events from the page #/app/wot/map
  .factory('MapData', function(csHttp, esHttp, csWot) {
    'ngInject';

    var
      that = this,
      constants = {
        DEFAULT_LOAD_SIZE: 1000
      },
      fields = {
        profile: ["issuer", "title", "description", "geoPoint"]
      };

    that.raw = {
      profile: {
        postSearch: esHttp.post('/user/profile/_search')
      }
    };

    function createFilterQuery(options) {
      var query = {
        bool: {
          must: [
            {exists: {field: "geoPoint"}}
          ]
        }
      };

      return query;
    }

    function load(options) {
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || constants.DEFAULT_LOAD_SIZE;

      var request = {
        query: createFilterQuery(options),
        from: options.from,
        size: options.size,
        _source: fields.profile
      };

      return that.raw.profile.postSearch(request)
        .then(function(res) {
          if (!res.hits || !res.hits.total) return [];

          var commaRegexp = new RegExp('[,]');

          res = res.hits.hits.reduce(function(res, hit) {
            var item = hit._source;

            if (!item.geoPoint || !item.geoPoint.lat || !item.geoPoint.lon) return res;

            // Convert lat/lon to float (if need)
            if (item.geoPoint.lat && typeof item.geoPoint.lat === 'string') {
              item.geoPoint.lat = parseFloat(item.geoPoint.lat.replace(commaRegexp, '.'));
            }
            if (item.geoPoint.lon && typeof item.geoPoint.lon === 'string') {
              item.geoPoint.lon = parseFloat(item.geoPoint.lon.replace(commaRegexp, '.'));
            }

            return res.concat(item);
          }, []);

          return csWot.extendAll(res, 'issuer');
        });
    }

    return {
      load: load
    };

  });


