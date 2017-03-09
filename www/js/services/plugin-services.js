

angular.module('cesium.plugin.services', [])

.provider('PluginService', function PluginServiceProvider() {
  'ngInject';

  var eagerLoadingServices = [];

  var extensionByStates = {};

  this.registerEagerLoadingService = function(serviceName) {
    eagerLoadingServices.push(serviceName);
    return this;
  };

  this.extendState = function(stateName, extension) {
    if (angular.isDefined(stateName) && angular.isDefined(extension)) {
      if (!extensionByStates[stateName]) {
        extensionByStates[stateName] = [];
      }
      extensionByStates[stateName].push(extension);
    }
    return this;
  };

  this.extendStates = function(stateNames, extension) {
    var that = this;
    stateNames.forEach(function(stateName) {
      that.extendState(stateName, extension);
    });
    return this;
  };

  this.$get = ['$injector', '$state', function($injector, $state) {

    var currentExtensionPointName;

    function start() {
      if (eagerLoadingServices.length>0) {
        _.forEach(eagerLoadingServices, function(name) {
          $injector.get(name);
        });
      }
    }

    function getActiveExtensionPointsByName(extensionPointName) {
      var extensions = _.keys(extensionByStates).reduce(function(res, stateName){
        return $state.includes(stateName) ? res.concat(extensionByStates[stateName]) : res;
      }, []);
      return extensions.reduce(function(res, extension){
        return extension.points && extension.points[extensionPointName] ? res.concat(extension.points[extensionPointName]) : res;
      }, []);
    }

    function setCurrentExtensionPointName(extensionPointName) {
      currentExtensionPointName  = extensionPointName;
    }

    function getCurrentExtensionPointName() {
      return currentExtensionPointName;
    }

    return {
      start: start,
      extensions: {
        points: {
          getActivesByName: getActiveExtensionPointsByName,
          current: {
            get: getCurrentExtensionPointName,
            set: setCurrentExtensionPointName
          }
        }
      }
    };
  }];
})
;
