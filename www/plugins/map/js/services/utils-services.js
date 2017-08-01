
angular.module('cesium.map.utils.services', ['cesium.services', 'ui-leaflet'])

.factory('MapUtils', function($timeout, $q, $translate, leafletData, csConfig, csSettings, esGeo, UIUtils, leafletHelpers) {
  'ngInject';


  var
    googleApiKey = csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.googleApiKey;
    constants = {
    locations: {
      FRANCE: {
        lat: 46.5588603, lng: 4.229736328124999, zoom: 6
      }
    },
    LOCALIZE_ZOOM: 14
  };
  constants.DEFAULT_CENTER = csSettings.data && csSettings.data.plugins && csSettings.data.plugins.map && csSettings.data.plugins.map.center || constants.locations.FRANCE;

  function initMap(options){
    options = angular.merge({
      center: angular.copy(constants.DEFAULT_CENTER),
      defaults: {
        scrollWheelZoom: true
      },
      layers: {
        baselayers: {
          osm: {
            name: 'OpenStreetMap',
            type: 'xyz',
            url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            layerOptions: {
              subdomains: ["a", "b", "c"],
              attribution: "&copy; <a href=\"http://www.openstreetmap.org/copyright\">OpenStreetMap</a>",
              continuousWorld: true
            }
          },
          cycle: {
            name: "Google map",
            type: "xyz",
            url: 'http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key='+googleApiKey,
            layerOptions: {
              subdomains: ['mt0','mt1','mt2','mt3'],
              attribution: "&copy; <a href=\"http://google.com/copyright\">Google</a>",
              continuousWorld: true
            }
          }
        }
      },
      controls: {
        custom: []
      }
    }, options || {});

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
          L.control.search(angular.merge(options, {
            textPlaceholder: translations['MAP.COMMON.SEARCH_DOTS'],
            textErr: translations['COMMON.SEARCH_NO_RESULT']
          })).addTo(map);
        });
      }
    };
  }

  function initLocalizeMeControl() {
    return L.easyButton('icon ion-android-locate', function(btn, map){
      return esGeo.point.current()
        .then(function(res) {
          map.invalidateSize();
          map._resetView({
            lat: res.lat,
            lng: res.lon
          }, constants.LOCALIZE_ZOOM, true);
        })
        .catch(UIUtils.onError('MAP.ERROR.LOCALIZE_ME_FAILED'));
    });
  }

  return {
    map: initMap,
    center: {
      get: getCenter,
      isSame: isSameCenter,
      isDefault: isDefaultCenter
    },
    updateCenter: updateMapCenter,
    control: {
      search: initSearchControl,
      localizeMe: initLocalizeMeControl
    },
    constants: constants
  };

});
