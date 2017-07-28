
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
      markerMessageTemplate,
      // Create a  hidden layer, to hold search markers
      markersSearchLayer = L.layerGroup({visible: false}),
      formatPubkey = $filter('formatPubkey'),
      loadingControl,
      searchControl,
      icons= {
        member: {
          type: 'awesomeMarker',
          icon: 'person',
          markerColor: 'green',
          iconColor: 'white'
        },
        mirror: {
          type: 'awesomeMarker',
          icon: 'radio-waves',
          markerColor: 'green',
          iconColor: 'white'
        },
        offline: {
          type: 'awesomeMarker',
          icon: 'ion-close-circled',
          markerColor: 'red',
          iconColor: 'white'
        }
      },
      markerIdByPeerId = {},
      markerCounter = 0
    ;

    // Init the template for marker popup
    markerMessageTemplate = '<div class="item item-peer item-icon-left no-border" ng-click="selectPeer(peer)">';
    markerMessageTemplate += $templateCache.get('templates/network/item_content_peer.html');
    markerMessageTemplate += '</div>';
    markerMessageTemplate = markerMessageTemplate.replace(/[:]rebind[:]|[:][:]/g, ''); // remove binding limitation

    $scope.mapId = 'map-network-' + $scope.$id;
    $scope.helptipPrefix = 'helptip-' + $scope.mapId; // make to override, to avoid error during help tour

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
        },
        markers: {}
      });

    var inheritedEnter = $scope.enter;
    $scope.enter = function(e, state) {
      if ($scope.networkStarted) return;

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

      $scope.search.memberPeersCount = data.memberPeersCount;
      // Always tru if network not started (e.g. after leave+renter the view)
      $scope.search.loading = !$scope.networkStarted || csNetwork.isBusy();

      // Store marker id, to be able to apply deletion
      var markerIdByPeerIdToRemove = angular.copy(markerIdByPeerId);

      _.forEach(data.peers||[], function(peer){
        // skip TOR peer
        if (peer.isTor()) return; // already define
        // get marker id
        var markerId = markerIdByPeerId[peer.id];

        // if already exists
        if (markerId && $scope.map.markers[markerId]) {
          $scope.updateMarker($scope.map.markers[markerId], peer);
          delete markerIdByPeerIdToRemove[peer.id];
          return;
        }

        // Get position by IP
        var bma = peer.bma;
        var address = peer.hasValid4(bma) ? bma.ipv4 : (bma.dns || bma.ipv6);
        esGeo.point.searchByIP(address)

          // Create the marker
          .then(function(position){
            var marker = $scope.updateMarker({
              position: position,
              getMessageScope: function() {
                var scope = $scope.$new();
                scope.peer = peer;
                return scope;
              },
              draggable: true,
              focus: false,
              message: markerMessageTemplate
            }, peer);

            // Add marker to list
            markerId = '' + markerCounter++;
            $scope.map.markers[markerId] = marker;
            markerIdByPeerId[peer.id] = markerId;

            // Create a search marker (will be hide)
            var searchServer = peer.dns || peer.server;
            var searchText = searchServer +
              (peer.uid ? (' | ' + peer.name||peer.uid) : '') +
              ' | ' + formatPubkey(peer.pubkey);
            var searchIp;;
            if (bma.ipv4 && !(peer.dns || peer.server).startsWith(bma.ipv4)) {
              searchIp = bma.ipv4;
              searchText += ' | ' + bma.ipv4;
            }
            markersSearchLayer.addLayer(new L.Marker({
                lat: position.lat,
                lng: position.lng
              },
              {
                opacity: 0,
                icon: L.divIcon({
                  className: 'ng-hide',
                  iconSize: L.point(0, 0)
                }),
                title: searchText,
                uid: peer.uid,
                name: peer.name,
                pubkey: peer.pubkey,
                ipv4: searchIp,
                port: bma.port,
                server: (peer.dns || peer.server)
              }));
          })
          .catch(function(err) {
            console.debug('No position found for address ['+address+']', err);
          });
      });

      leafletData.getMap($scope.mapId).then(function(map) {

        // Add loading control
        if (!loadingControl) {
          loadingControl = L.Control.loading({
            position: 'topright',
            separate: true
          });
          loadingControl.addTo(map);
          if ($scope.search.loading) {
            map.fire('dataloading');
          }
        }

        else if (!$scope.search.loading) {
          $timeout(function() {
            map.fire('dataload');
          }, 500);
        }

        // Add search control
        if (!searchControl) {
          var searchTip = $interpolate($templateCache.get('plugins/map/templates/network/item_search_tooltip.html'));
          searchControl = MapUtils.control.search({
            layer: markersSearchLayer,
            propertyName: 'title',
            buildTip: function (text, val) {
              return searchTip(val.layer.options);
            }
          });
          searchControl.addTo(map);
        }

        // Recenter map// Update map center (if need)
        var needCenterUpdate = $scope.stateCenter && !angular.equals($scope.map.center, $scope.stateCenter);
        if (needCenterUpdate) {
          MapUtils.updateCenter(map, $scope.stateCenter);
          delete $scope.stateCenter;
        }

      });

      // Remove old markers not found in the new result
      _.forEach(_.keys(markerIdByPeerIdToRemove), function(peerId) {
        delete markerIdByPeerId[peerId];
      });
      _.forEach(_.values(markerIdByPeerIdToRemove), function(markerId) {
        delete $scope.map.markers[markerId];
      });


    };

    $scope.updateMarker = function(marker, peer) {
      marker.layer = !peer.online ? 'offline' : (peer.uid ? 'member' : 'mirror');
      marker.icon = angular.copy(icons[marker.layer]);
      marker.opacity = peer.online ? 1 : 0.7;
      marker.title = peer.dns || peer.server;
      if (peer.online && !peer.hasMainConsensusBlock) {
        marker.icon.markerColor = peer.hasConsensusBlock ? 'lightgreen' : 'lightgray';
        marker.opacity = peer.hasConsensusBlock ? 0.9 : 0.8;
      }
      if (!marker.lng) {
        marker.lng = marker.position.lng + Math.random() / 1000;
        marker.lat = marker.position.lat + Math.random() / 1000;
      }

      return marker;
    };

  });
