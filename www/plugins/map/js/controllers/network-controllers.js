
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
          url: "/network/map?c",
          views: {
            'menuContent': {
              templateUrl: "plugins/map/templates/network/view_map.html",
              controller: 'MapNetworkViewCtrl'
            }
          },
          data: {
            silentLocationChange: true
          }
        });
    }
  })

  // [NEW] Manage events from the page #/app/wot/map
  .controller('MapNetworkViewCtrl', function($scope, $controller, $q, $interpolate, $translate, $filter, $templateCache, $timeout, $location,
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
      loading: true,
        markers: {}
      });

    var inheritedEnter = $scope.enter;
    $scope.enter = function(e, state) {
      if ($scope.map.loading) {

        // Load the map (and init if need)
        $scope.loadMap().then(function(map){

          // Load indicator
          map.fire('dataloading');

          // inherited
          return inheritedEnter(e, state); // will call inherited load()
        });
      }

      else {
        // Make sur to have previous center coordinate defined in the location URL
        $scope.updateLocationHref();

        // inherited
        return inheritedEnter(e, state);
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

        // Add search control
        var searchTip = $interpolate($templateCache.get('plugins/map/templates/network/item_search_tooltip.html'));
        searchControl = MapUtils.control.search({
          layer: markersSearchLayer,
          propertyName: 'title',
          zoom: 10,
          buildTip: function (text, val) {
            return searchTip(val.layer.options);
          }
        });
        searchControl.addTo(map);

        $scope.map.loading = false;
        return map;
      });
    };

    $scope.updateView = function(data) {
      console.debug("[map] [peers] Updating UI");

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
                peer: angular.extend({ipv4: searchIp}, peer)
              }));
          })
          .catch(function(err) {
            console.debug('No position found for address ['+address+']', err);
          });
      });

      // Remove old markers not found in the new result
      _.forEach(_.keys(markerIdByPeerIdToRemove), function(peerId) {
        delete markerIdByPeerId[peerId];
      });
      _.forEach(_.values(markerIdByPeerIdToRemove), function(markerId) {
        delete $scope.map.markers[markerId];
      });

      // Hide loading indicator, when finished
      if (!$scope.search.loading) {
        leafletData.getMap($scope.mapId).then(function (map) {
            map.fire('dataload');
          });
      }
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

    $scope.showHelpTip = function() {
      // override subclass
    };

    // Update the browser location, to be able to refresh the page
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
