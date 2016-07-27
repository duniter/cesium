

angular.module('cesium.plugin.services', [])

.provider('$menu', function MenuProvider() {
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

  this.$get = [function menuFactory(apiToken) {

    return new Menu(items);
  }];

  this.sections = sections;
});
