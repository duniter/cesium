
angular.module('cesium.plugins', [
  /* --  Generated plugin's modules -- */

  'cesium.plugins.translations',
  'cesium.plugins.templates',

  /* --  Plugins  -- */

  // Graph plugin:
  // removeIf(ubuntu)
  // Graph should be disable for Ubuntu build - see issue #463
  'cesium.graph.plugin',
  // endRemoveIf(ubuntu)

  // RML9 plugin:
  //'cesium.rml9.plugin',

  // ES plugin (Cesium+):
  'cesium.es.plugin',

  // Map plugin (Cesium+):
  'cesium.map.plugin'
  ])
;
