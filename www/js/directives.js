angular.module('cesium.directives', ['cesium.services'])

  // Add new compare-to directive (need for form validation)
  .directive("compareTo", function() {
      return {
          require: "ngModel",
          /*scope: {
              otherModelValue: "=compareTo"
          },*/
          link: function(scope, element, attributes, ngModel) {
            if (attributes.compareTo) {
              ngModel.$validators.compareTo = function(modelValue) {
                  return modelValue == scope.$eval(attributes.compareTo);
              };

              scope.$watch(attributes.compareTo, function() {
                  ngModel.$validate();
              });
            }
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
        var path = attrs.activeLinkPathPrefix ? attrs.activeLinkPathPrefix : attrs.href;
        if (path) {
          path = path.substring(1); //hack because path does not return including hashbang
          scope.location = $location;
          scope.$watch('location.path()', function (newPath) {
            if (newPath && newPath.indexOf(path) === 0) {
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

/**
* Close the current modal
*/
.directive('modalClose', ['$ionicHistory', '$timeout', function($ionicHistory, $timeout) {
  return {
    restrict: 'AC',
    link: function($scope, $element) {
      $element.bind('click', function() {
        if ($scope.closeModal) {
          $ionicHistory.nextViewOptions({
            historyRoot: true,
            disableAnimate: true,
            expire: 300
          });
          // if no transition in 300ms, reset nextViewOptions
          // the expire should take care of it, but will be cancelled in some
          // cases. This directive is an exception to the rules of history.js
          $timeout( function() {
            $ionicHistory.nextViewOptions({
              historyRoot: false,
              disableAnimate: false
            });
          }, 300);
          $scope.closeModal();
        }
      });
    }
  };
}])

/**
* Plugin extension point (see services/plugin-services.js)
*/
.directive('csExtensionPoint', function ($state, $compile, $controller, $templateCache, PluginService) {


  var getTemplate = function(extensionPoint) {
    var template = extensionPoint.templateUrl ? $templateCache.get(extensionPoint.templateUrl) : extensionPoint.template;
    if (extensionPoint.controller) {
      template = '<ng-controller ng-controller="'+extensionPoint.controller+'">' + template + '</div>';
    }
    return template;
  };

  var compiler = function(tElement, tAttributes) {

    if (angular.isDefined(tAttributes.name)) {
      var extensionPoints = PluginService.extensions.points.getActivesByName(tAttributes.name);
      if (extensionPoints.length > 0) {
        tElement.html("");
        _.forEach(extensionPoints, function(extensionPoint){
          tElement.append(getTemplate(extensionPoint));
        });
      }
    }

    return {
      pre: function(scope, iElement, iAttrs, controller){
        PluginService.extensions.points.current.set(iAttrs.name);
      },
      post: function(scope, iElement, iAttrs, controller){
        PluginService.extensions.points.current.set();
      }
    };
  };


  return {
    restrict: "E",
    //link: linker,
    //controller: controller,
    compile: compiler,
    scope: {
        content:'='
    }
  };
})
;
