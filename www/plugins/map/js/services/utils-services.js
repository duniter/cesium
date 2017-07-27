
angular.module('cesium.map.utils.services', ['cesium.services', 'ui-leaflet'])

.factory('MapUtils', function($timeout, $q, $translate, leafletData, csSettings, esGeo, UIUtils) {
  'ngInject';

  var constants = {
    locations: {
      FRANCE: {
        lat: 46.5588603, lng: 4.229736328124999, zoom: 6
      }
    },
    icons: {
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
          openStreetMap: {
            name: 'OpenStreetMap',
            type: 'xyz',
            url: 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
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
    return $timeout(function () {
      map.invalidateSize();
      map._resetView(center, center.zoom, true);
    }, 300);
  }

  function initIcon(type) {
    return constants.icons[type];
  }

  function initCenter(options) {
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
    return angular.merge({}, constants.DEFAULT_CENTER, center);
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

    var translatePromise = $translate(['MAP.WOT.VIEW.SEARCH_DOTS', 'COMMON.SEARCH_NO_RESULT']);

    return {
      // Simulate an addTo function, but wait for end of translations job
      addTo: function (map) {
        translatePromise.then(function (translations) {
          L.control.search(angular.merge(options, {
            textPlaceholder: translations['MAP.WOT.VIEW.SEARCH_DOTS'],
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
    icon: initIcon,
    center: initCenter,
    updateCenter: updateMapCenter,
    control: {
      search: initSearchControl,
      localizeMe: initLocalizeMeControl
    },
    constants: constants
  };

});
