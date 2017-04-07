angular.module('cesium')

  // Add new compare-to directive (need for form validation)
  .directive("compareTo", function() {
      return {
          require: "?ngModel",
          link: function(scope, element, attributes, ngModel) {
            if (ngModel && attributes.compareTo) {
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

  .directive('numberFloat', function() {
    var NUMBER_REGEXP = new RegExp('^[0-9]+([.,][0-9]+)?$');

    return {
      require: '?ngModel',
      link: function(scope, element, attributes, ngModel) {
        if (ngModel) {
          ngModel.$validators.numberFloat = function(modelValue) {
            return ngModel.$isEmpty(modelValue) || NUMBER_REGEXP.test(modelValue);
          };
        }
      }
    };
  })

  .directive('numberInt', function() {
    var INT_REGEXP = new RegExp('^[0-9]+$');
    return {
      require: 'ngModel',
      link: function(scope, element, attrs, ngModel) {
        if (ngModel) {
          ngModel.$validators.numberInt = function (value) {
            return ngModel.$isEmpty(value) || INT_REGEXP.test(value);
          };
        }
      }
    };
  })

  .directive('email', function() {
    var EMAIL_REGEXP = new RegExp('^[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$');
    return {
      require: 'ngModel',
      link: function(scope, element, attrs, ngModel) {
        if (ngModel) {
          ngModel.$validators.email = function (value) {
            return ngModel.$isEmpty(value) || EMAIL_REGEXP.test(value);
          };
        }
      }
    };
  })

  // Add a copy-on-click directive
  .directive('copyOnClick', function ($window, $document, Device, UIUtils) {
    'ngInject';
    return {
      restrict: 'A',
      link: function (scope, element, attrs) {
        var showCopyPopover = function (event) {
          var value = attrs.copyOnClick;
          if (value && Device.clipboard.enable) {
            // copy to clipboard
            Device.clipboard.copy(value)
              .then(function(){
                UIUtils.toast.show('INFO.COPY_TO_CLIPBOARD_DONE');
              })
              .catch(UIUtils.onError('ERROR.COPY_CLIPBOARD'));
          }
          else if (value) {
            var rows = value && value.indexOf('\n') >= 0 ? value.split('\n').length : 1;
            UIUtils.popover.show(event, {
              scope: scope,
              templateUrl: 'templates/common/popover_copy.html',
              bindings: {
                value: attrs.copyOnClick,
                rows: rows
              },
              autoselect: '.popover-copy ' + (rows <= 1 ? 'input' : 'textarea')
            });
          }
        };
        element.bind('click', showCopyPopover);
        element.bind('hold', showCopyPopover);
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

  .directive('trustAsHtml', ['$compile', function($compile){
    return {
      restrict: 'AE',
      link: function(scope, element, attrs)  {
        var value = attrs.trustAsHtml;
        if (value) {
          var html = scope.$eval(value);
          element.append(html);
          $compile(element.contents())(scope);
        }
      }
    };
  }])

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
      if (!template) {
        console.error('[plugin] Could not found template for extension :' + (extensionPoint.templateUrl ? extensionPoint.templateUrl : extensionPoint.template));
        return '';
      }
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
        pre: function(scope, iElement, iAttrs){
          PluginService.extensions.points.current.set(iAttrs.name);
        },
        post: function(){
          PluginService.extensions.points.current.set();
        }
      };
    };


    return {
      restrict: "E",
      compile: compiler,
      scope: {
          content:'='
      }
    };
  })

  .directive('onReadFile', function ($parse) {
    return {
      restrict: 'A',
      scope: false,
      link: function(scope, element, attrs) {
        var fn = $parse(attrs.onReadFile);

        element.on('change', function(onChangeEvent) {
          var reader = new FileReader();
          var fileData = {
            name: this.files[0].name,
            size: this.files[0].size,
            type: this.files[0].type
          };

          reader.onload = function(onLoadEvent) {
            scope.$apply(function() {
              fn(scope, {
                file: {
                  fileContent: onLoadEvent.target.result,
                  fileData : fileData}
              });
            });
          };
          reader.readAsText((onChangeEvent.srcElement || onChangeEvent.target).files[0]);
        });
      }
    };
  })

  .directive("dropzone", function($parse) {
    return {
      restrict: 'A',
      scope: false,
        link: function(scope, elem, attrs) {
          var fn = $parse(attrs.dropzone);
          elem.bind('dragover', function (e) {
            e.stopPropagation();
            e.preventDefault();
          });
          elem.bind('dragenter', function(e) {
            e.stopPropagation();
            e.preventDefault();
          });
          elem.bind('dragleave', function(e) {
            e.stopPropagation();
            e.preventDefault();
          });
          elem.bind('drop', function(e) {
            e.stopPropagation();
            e.preventDefault();
            var fileData = {
              name: e.dataTransfer.files[0].name,
              size: e.dataTransfer.files[0].size,
              type: e.dataTransfer.files[0].type
            };

            var reader = new FileReader();
            reader.onload = function(onLoadEvent) {
              scope.$apply(function () {
                fn(scope, {
                  file: {
                    fileContent: onLoadEvent.target.result,
                    fileData : fileData}
                });
              });
            };
            reader.readAsText(e.dataTransfer.files[0]);
          });
      }
    };
  })
;
