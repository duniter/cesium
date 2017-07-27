
angular.module('cesium.map.network.controllers', ['cesium.services', 'cesium.map.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

      // Extension de la vue d'une identité: ajout d'un bouton
        .extendState('app.network', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/network/lookup_extend.html"
            }
          }
        });

      // [NEW] Ajout d'une nouvelle page #/app/wot/map
      $stateProvider
        .state('app.view_network_map', {
          url: "/network/map?lat&lng&zoom",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/network/view_map.html",
              controller: 'MapNetworkViewCtrl'
            }
          }
        });
    }

    L.AwesomeMarkers.Icon.prototype.options.prefix = 'ion';
  })

  // [NEW] Manage events from the page #/app/wot/map
  .controller('MapNetworkViewCtrl', function($scope, $controller, $q, $interpolate, $translate, $state, $filter, $templateCache, $timeout, $ionicHistory,
                                         esGeo, UIUtils, csNetwork, MapUtils, leafletData) {
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('NetworkLookupCtrl', {$scope: $scope}));

    var
      formatPubkey = $filter('formatPubkey'),
      markerTemplate = $templateCache.get('plugins/map/templates/network/popup_marker.html'),
      // Create a  hidden layer, to hold search markers
      searchLayer = L.layerGroup({visible: false}),
      icons= {
        member: {
          type: 'awesomeMarker',
          icon: 'person',
          markerColor: 'blue'
        },
        mirror: {
          type: 'awesomeMarker',
          icon: 'android-desktop',
          markerColor: 'lightgray'
        },
        offline: {
          type: 'awesomeMarker',
          icon: 'ion-close-circled',
          markerColor: 'red'
        }
      }
    ;

    $scope.mapId = 'map-network-' + $scope.$id;

    $scope.map = MapUtils.map({
        layers: {
          overlays: {
            member: {
              type: 'group',
              name: 'MAP.NETWORK.VIEW.LAYER.MEMBER',
              visible: true
            },
            mirror: {
              type: 'group',
              name: 'MAP.NETWORK.VIEW.LAYER.MIRROR',
              visible: true
            },
            offline: {
              type: 'group',
              name: 'MAP.NETWORK.VIEW.LAYER.OFFLINE',
              visible: false
            }
          }
        }
      });

    var inheritedEnter = $scope.enter;
    $scope.enter = function(e, state) {
      if ($scope.networkStarted) return;

      console.log("[map] [network] Opening the view...");
      // remember state, to be able to refresh location
      $scope.stateName = state && state.stateName;
      $scope.stateParams = angular.copy(state && state.stateParams||{});

      // Read center from state params
      $scope.stateCenter = MapUtils.center(state.stateParams);

      // inherited
      return inheritedEnter(e, state);
    };
    $scope.$on('$ionicView.enter', $scope.enter);

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


    // removeIf(device)
    $scope.onMapCenterChanged = function() {
      if (!$scope.loading) {
        $timeout($scope.updateLocation, 500);
      }
    };
    $scope.$watch('map.center', $scope.onMapCenterChanged, true);
    // endRemoveIf(device)

    $scope.showHelpTip = function() {
      // override subclass
    };

    $scope.updateView = function(data) {
      console.debug("[map] [peers] Updating UI");

      $scope.search.results = data.peers;
      $scope.search.memberPeersCount = data.memberPeersCount;
      // Always tru if network not started (e.g. after leave+renter the view)
      $scope.search.loading = !$scope.networkStarted || csNetwork.isBusy();

      if (!$scope.search.results || !$scope.search.results.length) return; // nothing


      $q.all(data.peers.reduce(function(res, peer){
        // skip TOR peer
        if (peer.isTor()) return res; // already define
        if (peer.lat && peer.lng) return res.concat(peer); // already define
        var ip = peer.getHost();
        return res.concat(esGeo.point.searchByIP(ip)
          .then(function(position){
            return angular.merge(peer, position);
          })
          .catch(function(err) {
            console.debug('No position found for IP ['+ip+']', err);
            return;
          }));
      }, []))
        .then(function(res) {
          var counter = 0;
          //var markers = {};
          var markers = [];
          _.forEach(res, function(peer) {
            if (peer && peer.lat && peer.lng) {
              var type = peer.uid ? 'member' : 'mirror';
              var marker = {
                layer: type,
                icon: icons[type],
                opacity: peer.uid ? 0.9 : 0.6,
                title: peer.dns || peer.server,
                lat: peer.lat,
                lng: peer.lng,
                draggable: true,
                getMessageScope: function() {
                  var scope = $scope.$new();
                  scope.peer = peer;
                  return scope;
                },
                focus: false,
                message: markerTemplate
              };
              //markers[''+counter++] = marker;
              markers.push(marker);
            }
          });

          leafletData.getMap($scope.mapId)
            .then(function(map) {

              $scope.map.markers = markers;

              // Update map center (if need)
              var needCenterUpdate = $scope.stateCenter && !angular.equals($scope.map.center, $scope.stateCenter);
              if (needCenterUpdate) {
                MapUtils.updateCenter(map, $scope.stateCenter);
                delete $scope.stateCenter;
              }

              // Add localize me control
              /*MapUtils.control.localizeMe().addTo(map);

               // Add search control
               var searchTip = $interpolate($templateCache.get('plugins/map/templates/network/item_search_tooltip.html'));
               MapUtils.control.search({
               layer: markersSearchLayer,
               propertyName: 'title',
               buildTip: function(text, val) {
               return searchTip(val.layer.options);
               }
               }).addTo(map);*/
            });
        })
      ;

        // Create a search marker (will be hide)
       /* var searchText = hit.title + ((hit.uid && hit.uid != hit.title) ? (' | ' + hit.uid) : '') + ' | ' + shortPubkey;
        var searchMarker = angular.merge({
          type: type,
          opacity: 0,
          icon: L.divIcon({
            className: type + ' ng-hide',
            iconSize: L.point(0, 0)
          })
        }, {title: searchText, pubkey: hit.pubkey, uid: hit.uid, name: hit.title});
        markersSearchLayer.addLayer(new L.Marker({
            lat: hit.geoPoint.lat,
            lng: hit.geoPoint.lon
          },
          searchMarker));*/
             //console.log($scope.map.markers);


    };

  });
