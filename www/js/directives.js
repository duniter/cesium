angular.module('cesium.directives', [])

  // Add new compare-to directive (need for form validation)
  .directive("compareTo", function() {
      return {
          require: "ngModel",
          scope: {
              otherModelValue: "=compareTo"
          },
          link: function(scope, element, attributes, ngModel) {

              ngModel.$validators.compareTo = function(modelValue) {
                  return modelValue == scope.otherModelValue;
              };

              scope.$watch("otherModelValue", function() {
                  ngModel.$validate();
              });
          }
      };
  })

  // Add a copy-on-click directive
  .directive('copyOnClick', function ($window, Device) {
    'ngInject';
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        element.bind('click', function () {
          if (!Device.clipboard.enable) {
            if ($window.getSelection && !$window.getSelection().toString() && this.value) {
              this.setSelectionRange(0, this.value.length);
            }
          }
        });
        element.bind('hold', function () {
          if (Device.clipboard.enable && this.value) {
            Device.clipboard.copy(this.value);
          }
        });
      }
    };
  })

  // Add a select-on-click directive
  .directive('selectOnClick', function ($window) {
    'ngInject';
      return {
          restrict: 'A',
          link: function (scope, element, attrs) {
              element.bind('click', function () {
                if ($window.getSelection && !$window.getSelection().toString() && this.value) {
                  this.setSelectionRange(0, this.value.length);
                }
              });
          }
      };
  })

  .directive('activeLink', function ($location) {
    'ngInject';
    return {
      restrict: 'A',
      link: function(scope, element, attrs, controller) {
        var clazz = attrs.activeLink;
        var path = attrs.href;
        if (path) {
          path = path.substring(1); //hack because path does not return including hashbang
          scope.location = $location;
          scope.$watch('location.path()', function (newPath) {
            if (path === newPath) {
              element.addClass(clazz);
            } else {
              element.removeClass(clazz);
            }
          });
        }
      }
    };
  })


  // All this does is allow the message
  // to be sent when you tap return
  .directive('input', function($timeout) {
    return {
      restrict: 'E',
      scope: {
        'returnClose': '=',
        'onReturn': '&',
        'onFocus': '&',
        'onBlur': '&'
      },
      link: function(scope, element, attr) {
        element.bind('focus', function(e) {
          if (scope.onFocus) {
            $timeout(function() {
              scope.onFocus();
            });
          }
        });
        element.bind('blur', function(e) {
          if (scope.onBlur) {
            $timeout(function() {
              scope.onBlur();
            });
          }
        });
        element.bind('keydown', function(e) {
          if (e.which == 13) {
            if (scope.returnClose) element[0].blur();
            if (scope.onReturn) {
              $timeout(function() {
                scope.onReturn();
              });
            }
          }
        });
      }
    };
  })
;
