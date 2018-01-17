
angular.module('cesium.map.utils.services', ['cesium.services', 'ui-leaflet'])

.factory('MapUtils', function($timeout, $q, $translate, $window, leafletData, csConfig, csSettings, esGeo, UIUtils, leafletHelpers) {
  'ngInject';


  var
    googleApiKey = csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.googleApiKey,
    constants = {
      locations: {
        FRANCE: {
          lat: 46.5588603, lng: 4.229736328124999, zoom: 6
        }
      },
      LOCALIZE_ZOOM: 15
    },
    data = {
      cache: {}
    };
  constants.DEFAULT_CENTER = csSettings.data && csSettings.data.plugins && csSettings.data.plugins.map && csSettings.data.plugins.map.center || constants.locations.FRANCE;

  function initMap(options){
    options = angular.merge({
      center: angular.copy(constants.DEFAULT_CENTER),
      cache: false,
      defaults: {
        scrollWheelZoom: true,
        tileLayerOptions: {
          attribution: '© <a target=\"_blank\" href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }
      },
      layers: {
        baselayers: {
          osm: {
            name: 'OpenStreetMap',
            type: 'xyz',
            url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            layerOptions: {
              subdomains: ["a", "b", "c"],
              attribution: "&copy; <a target=\"_blank\" href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
              continuousWorld: true
            }
          },
          google: {
            name: "Google map",
            type: "xyz",
            url: ('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key='+googleApiKey),
            layerOptions: {
              subdomains: ['mt0','mt1','mt2','mt3'],
              attribution: "&copy; <a target=\"_blank\"  href=\"https://www.google.com/intl/fr_fr/help/terms_maps.html\">Google</a>",
              continuousWorld: true
            }
          }
        }
      },
      controls: {
        custom: []
      }
    }, options || {});

    // Restore existing map options
    if (options.cache && data.cache[options.cache]) {
      console.debug("[map] Restoring map from cache :", data.cache[options.cache]);
      options = angular.merge(options, data.cache[options.cache]);
    }

    // Translate overlays name, if any
    var overlaysNames;
    if (options.layers.overlays) {
      overlaysNames = _.keys(options.layers.overlays).reduce(function (res, key) {
        return res.concat(options.layers.overlays[key].name);
      }, []);

      $translate(overlaysNames).then(function (translations) {
        // Translate overlay names
        _.keys(options.layers.overlays || {}).forEach(function (key) {
          options.layers.overlays[key].name = translations[options.layers.overlays[key].name];
        });
      });
    }

    return options;
  }

  function updateMapCenter(map, center) {
    if (isSameCenter(center, map)) return $q.when();

    return $timeout(function () {
      map.invalidateSize();
      map._resetView(center, center.zoom, true);
    }, 300);
  }

  function bindMapOptions(scope, mapId, options) {
    options = options || {};
    if (!mapId || !options.layers || !scope) throw 'Illegal arguments';
    if (!options.cache) return; // no cache, so bind not need

    // Bind overlays visibility
    if (options.layers.overlays) {
      var overlayNames = _.keys(options.layers.overlays);

      // Init the cache if need
      if (!data.cache[options.cache]) {
        data.cache[options.cache] = {
            center: options.center,
            bounds: options.bounds,
            layers: angular.copy(options.layers)
          };
      }

      // Listen for changes
      leafletData.getMap(mapId)
        .then(function() {
          _($window.document.querySelectorAll('#{0} .leaflet-control-layers-overlays input[type=checkbox]'.format(mapId)))
            .forEach(function (element, index) {
              var overlayName = overlayNames[index];
              var state = options.layers.overlays[overlayName].visible;
              element.addEventListener('change', function (e) {
                state = !state; // update state
                // update cache
                data.cache[options.cache].layers.overlays[overlayName].visible = state;
              });
            });
        });
    }

    // Refresh center and bound, when leaving the view
    scope.$on('$ionicView.leave', function() {
      // update center and bounds
      data.cache[options.cache].center = options.center;
      data.cache[options.cache].bounds = options.bounds;
    });

  }


  function getCenter(options) {
    if (!options) return;
    var center;
    if (options.lat) {
      center = {};
      center.lat = parseFloat(options.lat);
    }
    if (options.lng || options.lon) {
      center = center || {};
      center.lng = parseFloat(options.lng || options.lon);
    }
    if (options.zoom) {
      center = center || {};
      center.zoom = parseFloat(options.zoom);
    }
    if (!center) return;

    // If missing some properties, complete with defaults
    if (!leafletHelpers.isValidCenter(center)) {
      center = angular.merge({}, constants.DEFAULT_CENTER, center);
    }
    return center;
  }

  function isSameCenter(center, map) {
    return leafletHelpers.isSameCenterOnMap(center, map);
  }

  function isDefaultCenter(centerModel) {
    var mapCenter = constants.DEFAULT_CENTER;
    if (centerModel.lat && centerModel.lng && mapCenter.lat.toFixed(4) === centerModel.lat.toFixed(4) && mapCenter.lng.toFixed(4) === centerModel.lng.toFixed(4) && mapCenter.zoom === centerModel.zoom) {
      return true;
    }
    return false;
  }

  // Set the id of a control (set the attribute 'id' of the HTML container)
  function setControlId(control, id) {
    if (!control || !id) throw 'Illegal arguments';

    // Control already added to map
    if (control._container) {
      control._container.id = id;
    }
    // Control not already added to the map (HTML element not exists yet)
    else {
      // Override onAdd() function
      var superOnAdd = control.onAdd;
      control.onAdd = function (map) {
        var container = superOnAdd.call(this, map);
        container.id = id;
        return container;
      };
    }
  }

  // Create a default serach control, with default options
  function initSearchControl(options) {

    options = options || {};
    options.initial = angular.isDefined(options.initial) ? options.initial : false;
    options.marker = angular.isDefined(options.marker) ? options.marker : false;
    options.propertyName = angular.isDefined(options.propertyName) ? options.propertyName : 'title';
    options.position = angular.isDefined(options.position) ? options.position : 'topleft';
    options.zoom = angular.isDefined(options.zoom) ? options.zoom : constants.LOCALIZE_ZOOM;
    options.markerLocation = angular.isDefined(options.markerLocation) ? options.markerLocation : true;

    var translatePromise = $translate(['MAP.COMMON.SEARCH_DOTS', 'COMMON.SEARCH_NO_RESULT']);

    return {
      // Simulate an addTo function, but wait for end of translations job
      addTo: function (map) {
        translatePromise.then(function (translations) {
          var control = L.control.search(angular.merge(options, {
            textPlaceholder: translations['MAP.COMMON.SEARCH_DOTS'],
            textErr: translations['COMMON.SEARCH_NO_RESULT']
          }));

          // Set the HTML element id
          if (options.id) {
            setControlId(control, options.id);
          }
          control.addTo(map);
        });
      }
    };
  }

  function initLocalizeMeControl(options) {
    options = options || {};
    return L.easyButton({
        position: 'topleft',      // inherited from L.Control -- the corner it goes in
        type: 'replace',          // set to animate when you're comfy with css
        leafletClasses: true,     // use leaflet classes to style the button?
        states:[{                 // specify different icons and responses for your button
          stateName: 'locate-me',
          onClick: function(btn, map){
            esGeo.point.current()
              .then(function(res) {
                map.setView({
                  lat: res.lat,
                  lng: res.lon
                }, constants.LOCALIZE_ZOOM);
              })
              .catch(function(err) {
                console.error(err);
                UIUtils.alert.error('MAP.ERROR.LOCALIZE_ME_FAILED');
              });
          },
          title: options.title,
          icon: 'icon ion-android-locate'
        }]
      });
  }

  return {
    map: initMap,
    updateCenter: updateMapCenter,
    center: {
      get: getCenter,
      isSame: isSameCenter,
      isDefault: isDefaultCenter
    },
    control: {
      search: initSearchControl,
      localizeMe: initLocalizeMeControl,
      setId: setControlId
    },
    cache: {
      bind: bindMapOptions
    },
    constants: constants
  };

});
