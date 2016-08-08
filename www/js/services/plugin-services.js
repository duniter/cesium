

angular.module('cesium.plugin.services', [])

.provider('PluginService', function PluginServiceProvider() {
  'ngInject';

  var eagerLoadingServices = [];

  this.registerEagerLoadingService = function(serviceName) {
    eagerLoadingServices.push(serviceName);
  };

  this.$get = ['$injector', function pluginFactory($injector) {

    function start() {
      if (eagerLoadingServices.length>0) {
        _.forEach(eagerLoadingServices, function(name) {
          $injector.get(name);
        });
      }
    }

    return {
      start: start
    };
  }];
})

.provider('$menu', function MenuProvider() {
  'ngInject';

  var items = [],

  sections = {
    DISCOVER: 0,
    MAIN: 1,
    USER: 2
  };

  this.addItem = function(menuItem) {
    if (!menuItem.section) {
      menuItem.section = 2; // default section
    }
    if (!menuItem.ngIf) {
      menuItem.ngIf = 'true';
    }
    if (!menuItem.ngClick) {
      menuItem.ngClick = '';
    }
    if (menuItem.disable === "undefined") {
      menuItem.disable = false;
    }
    items.push(menuItem);
  };

  function Menu(items) {
    this.items = items;
    this.sections = sections;
  }

  this.$get = [function menuFactory() {

    return new Menu(items);
  }];

  this.sections = sections;
});
