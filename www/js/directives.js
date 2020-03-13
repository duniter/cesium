angular.module('cesium.directives', [])

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

  // Add new different-to directive (need for form validation)
  .directive("differentTo", function() {
    return {
      require: "?ngModel",
      link: function(scope, element, attributes, ngModel) {
        if (ngModel && attributes.differentTo) {
          ngModel.$validators.differentTo = function(modelValue) {
            return modelValue != scope.$eval(attributes.differentTo);
          };

          scope.$watch(attributes.differentTo, function() {
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
          ngModel.$validators.numberFloat = function(value) {
            return ngModel.$isEmpty(value) || NUMBER_REGEXP.test(value);
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

  .directive('requiredIf', function() {
    return {
      require: '?ngModel',
      link: function(scope, element, attributes, ngModel) {
        if (ngModel && attributes.requiredIf) {
          ngModel.$validators.required = function(value) {
            return !(scope.$eval(attributes.requiredIf)) || !ngModel.$isEmpty(value);
          };

          scope.$watch(attributes.requiredIf, function() {
            ngModel.$validate();
          });
        }
      }
    };
  })

  .directive('geoPoint', function() {
    return {
      require: '?ngModel',
      link: function(scope, element, attributes, ngModel) {
        if (ngModel) {
          ngModel.$validators.geoPoint = function(value) {
            return ngModel.$isEmpty(value) ||
              // twice are defined
              (angular.isDefined(value.lat) && angular.isDefined(value.lon)) ||
              // or twice are NOT defined (=empty object - can be useful to override data in ES node)
              (angular.isUndefined(value.lat) && angular.isUndefined(value.lon));
          };
        }
      }
    };
  })

  // Add a copy-on-click directive
  .directive('copyOnClick', function ($window, Device, UIUtils) {
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
        var path;
        if (attrs.activeLinkPathPrefix) {
          path = attrs.activeLinkPathPrefix.substring(1); //hack because path does not return including hashbang
          scope.location = $location;
          scope.$watch('location.path()', function (newPath) {
            if (newPath && newPath.indexOf(path) === 0) {
              element.addClass(clazz);
            } else {
              element.removeClass(clazz);
            }
          });
        }
        else if (attrs.href) {
          path = attrs.href.substring(1); //hack because path does not return including hashbang
          scope.location = $location;
          scope.$watch('location.path()', function (newPath) {
            if (newPath && newPath == path) {
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

  .directive('trustAsHtml', ['$sce', '$compile', '$parse', function($sce, $compile, $parse){
    return {
      restrict: 'A',
      compile: function (tElement, tAttrs) {
        var ngBindHtmlGetter = $parse(tAttrs.trustAsHtml);
        var ngBindHtmlWatch = $parse(tAttrs.trustAsHtml, function getStringValue(value) {
          return (value || '').toString();
        });
        $compile.$$addBindingClass(tElement);

        return function ngBindHtmlLink(scope, element, attr) {
          $compile.$$addBindingInfo(element, attr.trustAsHtml);

          scope.$watch(ngBindHtmlWatch, function ngBindHtmlWatchAction() {
            // we re-evaluate the expr because we want a TrustedValueHolderType
            // for $sce, not a string
            element.html($sce.getTrustedHtml($sce.trustAsHtml(ngBindHtmlGetter(scope))) || '');
            $compile(element.contents())(scope);
          });
        };
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
            scope.$applyAsync(function() {
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

.directive("dropZone", function($parse) {
    return {
      restrict: 'A',
      scope: false,
      link: function(scope, elem, attrs) {
        var fn = $parse(attrs.dropZone);
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


  // See http://embed.plnkr.co/2vgnFe/
  .directive('fileSelect', function ($parse) {
    'use strict';

    return {
      restrict: 'A',
      scope: false,
      template: '<input type="file" style="display: none;" />' +
        '<ng-transclude></ng-transclude>',
      transclude: true,
      link: function (scope, element, attrs) {
        var fn = $parse(attrs.fileSelect);

        var fileInput = element.children('input[file]');

        if (attrs.accept) {
          fileInput[0].accept = attrs.accept;
        }

        fileInput.on('change', function (onChangeEvent) {
          var reader = new FileReader();
          var fileData = {
            name: this.files[0].name,
            size: this.files[0].size,
            type: this.files[0].type
          };

          reader.onload = function(onLoadEvent) {
            scope.$applyAsync(function() {
              fn(scope, {
                file: {
                  fileContent: onLoadEvent.target.result,
                  fileData : fileData}
              });
            });
          };
          reader.readAsText((onChangeEvent.srcElement || onChangeEvent.target).files[0]);
        });

        element.on('click', function () {
          fileInput[0].click();
        });
      }
    };
  })


  // Un-authenticate when window closed
  // see: https://stackoverflow.com/questions/28197316/javascript-or-angularjs-defer-browser-close-or-tab-close-between-refresh
  .directive('windowExitUnauth', function($window, csSettings, csWallet) {
    return {
      restrict: 'AE',
      link: function(element, attrs){
        var myEvent = $window.attachEvent || $window.addEventListener,
          chkevent = $window.attachEvent ? 'onunload' : 'unload'; /// make IE7, IE8 compatible

        myEvent(chkevent, function (e) { // For >=IE7, Chrome, Firefox
          if (csSettings.data && csSettings.data.keepAuthIdle != csSettings.constants.KEEP_AUTH_IDLE_SESSION) {
            return csWallet.unauth();
          }
        });
      }
    };
  });
;
