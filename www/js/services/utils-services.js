angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils', function($ionicLoading, $ionicPopup, $translate, $q, ionicMaterialInk, ionicMaterialMotion, $window, $timeout,
           $ionicPopover, $state, $rootScope, screenmatch) {
  'ngInject';


  var
    loadingTextCache=null,
    CONST = {
      MAX_HEIGHT: 400,
      MAX_WIDTH: 400,
      THUMB_MAX_HEIGHT: 100,
      THUMB_MAX_WIDTH: 100
    },
    data = {
      smallscreen: screenmatch.bind('xs, sm', $rootScope)
    }
  ;

  function alertError(err, subtitle) {
    if (!err) {
      return $q.when();
    }

    return $q(function(resolve) {
      $translate([err, subtitle, 'ERROR.POPUP_TITLE', 'ERROR.UNKNOWN_ERROR', 'COMMON.BTN_OK'])
      .then(function (translations) {
        var message = err.message || translations[err];
        return $ionicPopup.show({
          template: '<p>' + (message || translations['ERROR.UNKNOWN_ERROR']) + '</p>',
          title: translations['ERROR.POPUP_TITLE'],
          subTitle: translations[subtitle],
          buttons: [
            {
              text: '<b>'+translations['COMMON.BTN_OK']+'</b>',
              type: 'button-assertive',
              onTap: function(e) {
                resolve(e);
              }
            }
          ]
        });
      });
    });
  }

  function alertInfo(message, subtitle) {
    return $q(function(resolve) {
      $translate([message, subtitle, 'INFO.POPUP_TITLE', 'COMMON.BTN_OK'])
      .then(function (translations) {
        $ionicPopup.show({
          template: '<p>' + translations[message] + '</p>',
          title: translations['INFO.POPUP_TITLE'],
          subTitle: translations[subtitle],
          buttons: [
            {
              text: translations['COMMON.BTN_OK'],
              type: 'button-positive',
              onTap: function(e) {
                resolve(e);
              }
            }
          ]
        });
      });
    });
  }

  function askConfirm(message, title, options) {
    title = title || 'CONFIRM.POPUP_TITLE';

    options = options || {};
    options.cssClass = options.cssClass || 'confirm';
    options.okText = options.okText || 'COMMON.BTN_OK';
    options.cancelText = options.cancelText || 'COMMON.BTN_CANCEL';

    return $translate([message, title, options.cancelText, options.okText])
      .then(function (translations) {
        return $ionicPopup.confirm({
          template: translations[message],
          cssClass: options.cssClass,
          title: translations[title],
          cancelText: translations[options.cancelText],
          cancelType: options.cancelType,
          okText: translations[options.okText],
          okType: options.okType,
        });
      });
  }

  function hideLoading(timeout){
    if (timeout) {
      return $timeout(function(){
        return $ionicLoading.hide();
      }, timeout);
    }
    else {
      return $ionicLoading.hide();
    }
  }

  function showLoading() {
    if (!loadingTextCache) {
      return $translate('COMMON.LOADING')
        .then(function(translation){
          loadingTextCache = translation;
          return showLoading();
        });
    }

    return $ionicLoading.show({
      template: loadingTextCache
    });
  }

  function showToast(message, duration) {
    if (!duration) {
      duration = 2000; // 2s
    }
    return $translate([message])
      .then(function(translations){
        $ionicLoading.show({ template: translations[message], noBackdrop: true, duration: duration });
      });
  }

  function onError(msg, reject/*optional*/) {
    return function(err) {
      var fullMsg = msg;
      var subtitle;
      if (!!err && !!err.message) {
        fullMsg = err.message;
        subtitle = msg;
      }
      else if (!msg){
        fullMsg = err;
      }
      // If reject has been given, use it
      if (!!reject) {
        reject(fullMsg);
      }
      // If just a user cancellation: silent
      else if (fullMsg == 'CANCELLED') {
        return hideLoading(10); // timeout, to avoid bug on transfer (when error on reference)
      }

      // Otherwise, log to console and display error
      else {
        console.error(err);
        hideLoading(10); // timeout, to avoid bug on transfer (when error on reference)
        return alertError(fullMsg, subtitle);
      }
    };
  }

  function isSmallScreen() {
    return data.smallscreen.active;
  }

  function selectElementText(el) {
    if (el.value || el.type == "text" || el.type == "textarea") {
      // Source: http://stackoverflow.com/questions/14995884/select-text-on-input-focus
      if ($window.getSelection && !$window.getSelection().toString()) {
        el.setSelectionRange(0, el.value.length);
      }
    }
    else {
      if (el.childNodes && el.childNodes.length > 0) {
        selectElementText(el.childNodes[0]);
      }
      else {
        // See http://www.javascriptkit.com/javatutors/copytoclipboard.shtml
        var range = $window.document.createRange(); // create new range object
        range.selectNodeContents(el); // set range to encompass desired element text
        var selection = $window.getSelection(); // get Selection object from currently user selected text
        selection.removeAllRanges(); // unselect any user selected text (if any)
        selection.addRange(range); // add range to Selection object to select it
      }
    }
  }

  function getSelectionText(){
    var selectedText = "";
    if (window.getSelection){ // all modern browsers and IE9+
        selectedText = $window.getSelection().toString();
    }
    return selectedText;
  }

  function imageOnLoadResize(resolve, reject, thumbnail) {
    return function(event) {
          var width = event.target.width;
          var height = event.target.height;
       var maxWidth = (thumbnail ? CONST.THUMB_MAX_WIDTH : CONST.MAX_WIDTH);
       var maxHeight = (thumbnail ? CONST.THUMB_MAX_HEIGHT : CONST.MAX_HEIGHT);

          if (width > height) {
         if (width > maxWidth) {
           height *= maxWidth / width;
           width = maxWidth;
            }
          } else {
         if (height > maxHeight) {
           width *= maxHeight / height;
           height = maxHeight;
            }
          }
          var canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(event.target, 0, 0,  canvas.width, canvas.height);

          var dataurl = canvas.toDataURL();

          canvas.remove();

          resolve(dataurl);
        };
  }

  function resizeImageFromFile(file, thumbnail) {
    var img = document.createElement("img");
    return $q(function(resolve, reject) {

      if (file) {
        var reader = new FileReader();
        reader.onload = function(event){
          img.onload = imageOnLoadResize(resolve, reject, thumbnail);
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
      else {
        reject('no file to resize');
      }
    })
    .then(function(dataurl) {
      img.remove();
      return dataurl;
    })
    ;
  }

  function resizeImageFromSrc(imageSrc, thumbnail) {
    var img = document.createElement("img");
    return $q(function(resolve, reject) {
      img.onload = imageOnLoadResize(resolve, reject, thumbnail);
      img.src = imageSrc;
    })
    .then(function(data){
      img.remove();
      return data;
    });
  }


  function showPopover(event, options) {

    var deferred = $q.defer();

    options = options || {};
    options.templateUrl = options.templateUrl ? options.templateUrl : 'templates/common/popover_copy.html';
    options.scope = options.scope || $rootScope;
    options.scope.popovers = options.scope.popovers || {};
    options.autoselect = options.autoselect || false;
    options.bindings = options.bindings || {};
    options.autoremove = angular.isDefined(options.autoremove) ? options.autoremove : true;
    options.backdropClickToClose = angular.isDefined(options.backdropClickToClose) ? options.backdropClickToClose : true;
    options.focusFirstInput = angular.isDefined(options.focusFirstInput) ? options.focusFirstInput : false;

    var _show = function(popover) {
      popover = popover || options.scope.popovers[options.templateUrl];
      popover.isResolved=false;
      popover.deferred=deferred;
      popover.options=options;
      // Fill the popover scope
      angular.merge(popover.scope, options.bindings);
      $timeout(function() { // This is need for Firefox
        popover.show(event)
        .then(function() {
          var element;
          // Auto select text
          if (options.autoselect) {
            element = document.querySelectorAll(options.autoselect)[0];
            if (element) {
              if ($window.getSelection && !$window.getSelection().toString()) {
                element.setSelectionRange(0, element.value.length);
                element.focus();
              }
              else {
                element.focus();
              }
            }
          }
          else {
            // Auto focus on a element
            if (options.autofocus) {
              element = document.querySelectorAll(options.autofocus)[0];
              if (element) element.focus();
            }
          }

          popover.scope.$parent.$emit('popover.shown');

          // Callback 'afterShow'
          if (options.afterShow) options.afterShow(popover);
        });
      });
    };

    var _cleanup = function(popover) {
      popover = popover || options.scope.popovers[options.templateUrl];
      if (popover) {
        delete options.scope.popovers[options.templateUrl];
        // Remove the popover
        popover.remove()
          // Workaround for issue #244
          // See also https://github.com/driftyco/ionic-v1/issues/71
          // and https://github.com/driftyco/ionic/issues/9069
          .then(function() {
            var bodyEl = angular.element($window.document.querySelectorAll('body')[0]);
            bodyEl.removeClass('popover-open');
          });
      }
    };

    var popover = options.scope.popovers[options.templateUrl];
    if (!popover) {

      $ionicPopover.fromTemplateUrl(options.templateUrl, {
        scope: options.scope,
        backdropClickToClose: options.backdropClickToClose
      })
        .then(function (popover) {
          popover.isResolved = false;

          popover.scope.closePopover = function(result) {
            var autoremove = popover.options.autoremove;
            delete popover.options.autoremove; // remove to avoid to trigger 'popover.hidden'
            popover.hide()
              .then(function() {
                if (autoremove) {
                  return _cleanup(popover);
                }
              })
              .then(function() {
                popover.deferred.resolve(result);
                delete popover.deferred;
                delete popover.options;
              });
          };

          // Execute action on hidden popover
          popover.scope.$on('popover.hidden', function() {
            if (popover.options && popover.options.afterHidden) {
              popover.options.afterHidden();
            }
            if (popover.options && popover.options.autoremove) {
              _cleanup(popover);
            }
          });

          // Cleanup the popover when hidden
          options.scope.$on('$remove', function() {
            if (popover.deferred) {
              popover.deferred.resolve();
            }
            _cleanup();
          });

          options.scope.popovers[options.templateUrl] = popover;
          _show(popover);
        });
    }
    else {
      _show(popover);
    }

    return deferred.promise;
  }

  function showSharePopover(event, options) {
    options = options || {};
    options.templateUrl = options.templateUrl ? options.templateUrl : 'templates/common/popover_share.html';
    options.autoselect = options.autoselect || '.popover-share input';
    options.bindings = options.bindings || {};
    options.bindings.value = options.bindings.value || options.bindings.url ||
      $state.href($state.current, $state.params, {absolute: true});
    options.bindings.postUrl = options.bindings.postUrl || options.bindings.value;
    options.bindings.postMessage = options.bindings.postMessage || '';
    options.bindings.titleKey = options.bindings.titleKey || 'COMMON.POPOVER_SHARE.TITLE';
    showPopover(event, options);
  }

  function showHelptip(id, options) {
    var element = (typeof id == 'string') ? $window.document.getElementById(id) : id;

    options = options || {};
    var deferred = options.deferred || $q.defer();

    if(element && !options.timeout) {
      if (options.preAction) {
        element[options.preAction]();
      }
      options.templateUrl = options.templateUrl ? options.templateUrl : 'templates/common/popover_helptip.html';
      options.autofocus = options.autofocus || '#helptip-btn-ok';
      options.bindings = options.bindings || {};
      options.bindings.icon = options.bindings.icon || {};
      options.bindings.icon.position = options.bindings.icon.position || false;
      options.bindings.icon.glyph = options.bindings.icon.glyph ||
        (options.bindings.icon.position && options.bindings.icon.position.startsWith('bottom-') ? 'ion-arrow-down-c' :'ion-arrow-up-c');
      options.bindings.icon.class = options.bindings.icon.class || 'calm icon ' + options.bindings.icon.glyph;
      options.bindings.tour = angular.isDefined(options.bindings.tour) ? options.bindings.tour : false;
      showPopover(element, options)
        .then(function(result){
          if (options.postAction) {
            element[options.postAction]();
          }
          deferred.resolve(result);
        })
        .catch(function(err){
          if (options.postAction) {
            element[options.postAction]();
          }
          deferred.reject(err);
        });
    }
    else {

      // Do timeout if ask
      if (options.timeout) {
        var timeout = options.timeout;
        options.retryTimeout = options.retryTimeout || timeout;
        delete options.timeout;
        options.deferred = deferred;
        $timeout(function () {
          showHelptip(id, options);
        }, timeout);
      }

      // No element: reject
      else if (angular.isDefined(options.retry) && !options.retry) {

        if (options.onError === 'continue') {
          $timeout(function () {
            deferred.resolve(true);
          });
        }
        else {
          $timeout(function () {
            deferred.reject("[helptip] element now found: " + id);
          });
        }
      }

      // Retry until element appears
      else {
        options.retry = angular.isUndefined(options.retry) ? 2 : (options.retry-1);
        options.deferred = deferred;
        $timeout(function() {
          showHelptip(id, options);
        }, options.timeout || options.retryTimeout || 100);
      }
    }

    return deferred.promise;
  }

  function disableEffects() {
    this.ink = function(){};

    function disableMotion(baseSelector) {
      return function(options) {
        if (!options || !options.selector) {
          options = {
              selector: (baseSelector + ' .item')
            };
        }
        var parentsInDom = document.querySelectorAll(baseSelector);
        for (var i = 0; i < parentsInDom.length; i++) {
            var parent = parentsInDom[i];
            parent.className = parent.className.replace(/\banimate-[a-z- ]+\b/,'');
        }

        var itemsInDom = document.querySelectorAll(options.selector);
        for (var j = 0; j < itemsInDom.length; j++) {
            var child = itemsInDom[j];
            child.style.webkitTransitionDelay = "0s";
            child.style.transitionDelay = "0s";
            child.className += ' in done';
        }
      };
    }

    this.motion.fadeSlideIn= disableMotion('.animate-fade-slide-in');
    this.motion.fadeSlideInRight = disableMotion('.animate-fade-slide-in-right');
    this.motion.ripple = disableMotion('.animate-ripple');
  }

  function showFab(id, timeout) {
    if (!timeout) {
      timeout = 900;
    }
    $timeout(function () {
      // Could not use 'getElementById', because it return only once element,
      // but many fabs can have the same id (many view could be loaded at the same time)
      var fabs = document.getElementsByClassName('button-fab');
      _.forEach(fabs, function(fab){
        if (fab.id == id) {
          fab.classList.toggle('on', true);
        }
      });
    }, timeout);
  }

  function hideFab(id, timeout) {
    if (!timeout) {
      timeout = 10;
    }
    $timeout(function () {
      // Could not use 'getElementById', because it return only once element,
      // but many fabs can have the same id (many view could be loaded at the same time)
      var fabs = document.getElementsByClassName('button-fab');
      _.forEach(fabs, function(fab){
        if (fab.id == id) {
          fab.classList.toggle('on', false);
        }
      });
    }, timeout);
  }

  ionicMaterialMotion.toggleOn = function(options, timeout) {
    // We have a single option, so it may be passed as a string or property
    if (typeof options === 'string') {
      options = {
        selector: options
      };
    }

    // Fail early & silently log
    var isInvalidSelector = typeof options.selector === 'undefined' || options.selector === '';

    if (isInvalidSelector) {
      console.log('invalid toggleOn selector');
      return false;
    }

    if (!timeout) {
      timeout = 900;
    }
    $timeout(function () {
      var items = document.querySelectorAll(options.selector);
      var itemsCount = items.length;
      for (var i = 0; i < itemsCount; i++) {
        var element = items[i];
        element.classList.toggle('on', true);
      }
    }, timeout);
  };

  ionicMaterialMotion.toggleOff = function(options, timeout) {
    // We have a single option, so it may be passed as a string or property
    if (typeof options === 'string') {
      options = {
        selector: options
      };
    }

    // Fail early & silently log
    var isInvalidSelector = typeof options.selector === 'undefined' || options.selector === '';

    if (isInvalidSelector) {
      console.log('invalid toggleOff selector');
      return false;
    }

    if (!timeout) {
      timeout = 900;
    }
    $timeout(function () {
      var items = document.querySelectorAll(options.selector);
      var itemsCount = items.length;
      for (var i = 0; i < itemsCount; i++) {
        var element = items[i];
        element.classList.toggle('on', false);
      }
    }, timeout);
  };

  return {
    alert: {
      error: alertError,
      info: alertInfo,
      confirm: askConfirm
    },
    loading: {
      show: showLoading,
      hide: hideLoading
    },
    toast: {
      show: showToast
    },
    onError: onError,
    screen: {
      isSmall: isSmallScreen
    },
    ink: ionicMaterialInk.displayEffect,
    motion: ionicMaterialMotion,
    fab: {
      show: showFab,
      hide: hideFab
    },
    popover: {
      show: showPopover,
      share: showSharePopover,
      helptip: showHelptip
    },
    disableEffects: disableEffects,
    selection: {
      select: selectElementText,
      get: getSelectionText
    },
    image: {
      resizeFile: resizeImageFromFile,
      resizeSrc: resizeImageFromSrc
    }
  };
})


// See http://plnkr.co/edit/vJQXtsZiX4EJ6Uvw9xtG?p=preview
.factory('$focus', function($timeout, $window) {
  'ngInject';

  return function(id) {
    // timeout makes sure that it is invoked after any other event has been triggered.
    // e.g. click events that need to run before the focus or
    // inputs elements that are in a disabled state but are enabled when those events
    // are triggered.
    $timeout(function() {
      var element = $window.document.getElementById(id);
      if(element)
        element.focus();
    });
  };
})

;
