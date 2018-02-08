
angular.module('cesium.map.network.controllers', ['cesium.services', 'cesium.map.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {

      PluginServiceProvider

        .extendState('app.network', {
          points: {
            'filter-buttons': {
              templateUrl: "plugins/map/templates/network/lookup_extend.html",
              controller: "ESExtensionCtrl"
            }
          }
        });

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
      markersSearchLayer,
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

    $scope.loading = true;
    $scope.mapId = 'map-network-' + $scope.$id;
    $scope.helptipPrefix = 'helptip-' + $scope.mapId; //Override value from super controller (avoid error during help tour)

    $scope.map = MapUtils.map({
      cache: 'map-network',
      layers: {
        overlays: {
          member: {
            type: 'featureGroup',
            name: 'MAP.NETWORK.VIEW.LAYER.MEMBER',
            visible: true
          },
          mirror: {
            type: 'featureGroup',
            name: 'MAP.NETWORK.VIEW.LAYER.MIRROR',
            visible: true
          },
          offline: {
            type: 'featureGroup',
            name: 'MAP.NETWORK.VIEW.LAYER.OFFLINE',
            visible: false
          }
        }
      },
      bounds: {},
      loading: true,
      markers: {}
    });

    var inheritedEnter = $scope.enter;
    $scope.enter = function(e, state) {
      if ($scope.loading) {
        if (state.stateParams && state.stateParams.c) {
          var cPart = state.stateParams.c.split(':');
          $scope.map.center.lat = parseFloat(cPart[0]);
          $scope.map.center.lng = parseFloat(cPart[1]);
          $scope.map.center.zoom = parseInt(cPart[2]);
        }

        $scope.$watch("map.center", function() {
          if (!$scope.map.loading) {
            return $timeout(function() {
              $scope.updateLocationHref();
            }, 300);
          }
        }, true);

        // Load the map (and init if need)
        $scope.loadMap()
          .then(function(map){

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

    var inheritedComputeOptions = $scope.computeOptions;
    $scope.computeOptions = function() {
      var options = inheritedComputeOptions();
      options.filter.online = 'all';
      return options;
    };

    $scope.loadMap = function() {
      return leafletData.getMap($scope.mapId).then(function(map) {
        if (!$scope.map.loading) return map; // already loaded

        // Add loading control
        L.Control.loading({
          position: 'topright',
          separate: true
        }).addTo(map);

        // Add search control
        // Create a  hidden layer, to hold search markers
        markersSearchLayer = L.layerGroup({visible: false});
        var searchTip = $interpolate($templateCache.get('plugins/map/templates/network/item_search_tooltip.html'));
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
            popupMarkerId && $timeout(function(){
              var popupMarker = _.find(map._layers, function(layer) {
                  return (layer.options && layer.options.id === popupMarkerId);
                });
              popupMarker && popupMarker.openPopup();
            }, 400);
          },
          firstTipSubmit: true,
          tooltipLimit: 50
        })
        .addTo(map);

        // Add marker cluster layer
        var _getMarkerColor = function(marker) {
          return marker.options && marker.options.icon.options.markerColor;
        };
        var markerClusterLayer = L.markerClusterGroup({
          disableClusteringAtZoom: MapUtils.constants.LOCALIZE_ZOOM,
          maxClusterRadius: 65,
          showCoverageOnHover: false,
          iconCreateFunction: function (cluster) {
            var countByColor = _.countBy(cluster.getAllChildMarkers(), _getMarkerColor);
            var markerColor = countByColor.green ? 'green' :
              (countByColor.lightgreen ? 'lightgreen' : (countByColor.lightgray ? 'lightgray' : 'red'));
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
        if (esGeo.point.ip.license) {
          markerClusterLayer.getAttribution = function() {
            return '<a target=\"_blank\" href="{0}">{1}</a>'.format(
              esGeo.point.ip.license.url,
              esGeo.point.ip.license.name);
          };
        }
        markerClusterLayer.addTo(map);

        //$scope.map.layers.overlays['offline'].visible=false;

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
        esGeo.point.ip.search(address)

        // Create the marker
          .then(function(position){// Add marker to list
            markerId = '' + markerCounter++;
            var marker = $scope.updateMarker({
              position: position,
              getMessageScope: function() {
                var scope = $scope.$new();
                scope.peer = peer;
                return scope;
              },
              draggable: false,
              focus: false,
              message: markerMessageTemplate,
              id: markerId
            }, peer);


            $scope.map.markers[markerId] = marker;
            markerIdByPeerId[peer.id] = markerId;

            // Create a search marker (will be hide)
            var searchServer = peer.dns || peer.server;
            var searchText = searchServer +
              (peer.uid ? (' | ' + (peer.name||peer.uid)) : '') +
              ' | ' + formatPubkey(peer.pubkey);
            var searchIp;
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
                peer: angular.extend({ipv4: searchIp}, peer),
                popupMarkerId: markerId
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
        leafletData.getMap($scope.mapId)
          .then(function (map) {
            $scope.loading = false;
            map.fire('dataload');
          });
      }
    };

    $scope.updateMarker = function(marker, peer) {
      marker.layer = !peer.online ? 'offline' : (peer.uid ? 'member' : 'mirror');
      marker.icon = angular.copy(icons[marker.layer]);
      marker.opacity = peer.online ? 1 : 1;
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

    $scope.showHelpTip = function() {
      // override subclass
    };
  });
