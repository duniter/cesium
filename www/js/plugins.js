
angular.module('cesium.plugins', [
  /* --  Generated plugin's modules -- */

  'cesium.plugins.translations',
  'cesium.plugins.templates',

  /* --  Plugins  -- */

  // Graph plugin:
  // removeIf(ubuntu)
  // FIXME: issue #463
  'cesium.graph.plugin',
  // endRemoveIf(ubuntu)

  // RML9 plugin:
  //'cesium.rml9.plugin',

  // ES plugin (Cesium+):
  'cesium.es.plugin'
  ])
;
