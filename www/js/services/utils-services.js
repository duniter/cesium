// var qrcode;

angular.module('cesium.utils.services', ['angular-fullscreen-toggle'])

// Replace the '$ionicPlatform.ready()', to enable multiple calls
// See http://stealthcode.co/multiple-calls-to-ionicplatform-ready/
.factory('ionicReady', function($ionicPlatform) {
  'ngInject';

  var readyPromise;

  return function () {
    if (!readyPromise) {
      readyPromise = $ionicPlatform.ready();
    }
    return readyPromise;
  };
})

.factory('UIUtils', function($ionicLoading, $ionicPopup, $ionicConfig, $ionicHistory, $translate, $q,
                             ionicMaterialInk, ionicMaterialMotion, $window, $timeout, Fullscreen,
                             // removeIf(no-device)
                             $cordovaToast,
                             // endRemoveIf(no-device)
                             $ionicPopover, $state, $rootScope, screenmatch) {
  'ngInject';


  var
    loadingTextCache=null,
    CONST = {
      MAX_HEIGHT: 480,
      MAX_WIDTH: 640,
      THUMB_MAX_HEIGHT: 200,
      THUMB_MAX_WIDTH: 200
    },
    data = {
      smallscreen: screenmatch.bind('xs, sm', $rootScope)
    },
    exports,
    raw = {}
    ;

  function alertError(err, subtitle) {
    if (!err) {
      return $q.when(); // Silent
    }

    return $q(function(resolve) {
      $translate(['ERROR.POPUP_TITLE', 'ERROR.UNKNOWN_ERROR', 'COMMON.BTN_OK']
        // avoid error "translationId must be a not empty string"
        .concat(typeof err === 'string' ? [err] : [])
        .concat(subtitle ? [subtitle] : [])
      )
        .then(function (translations) {
          var message = err.message || translations[err];
          return $ionicPopup.show({
            template: '<p>' + (message || translations['ERROR.UNKNOWN_ERROR']) + '</p>',
            title: translations['ERROR.POPUP_TITLE'],
            subTitle: subtitle && translations[subtitle] || undefined,
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

  function alertInfo(message, subtitle, options) {
    if (!message) return $q.reject("Missing 'message' argument");
    options = options || {};
    options.cssClass = options.cssClass || 'info';
    options.okText = options.okText || 'COMMON.BTN_OK';

    return $q(function(resolve) {
      $translate([message, 'INFO.POPUP_TITLE', options.okText].concat(subtitle ? [subtitle] : []))
        .then(function (translations) {
          $ionicPopup.show({
            template: '<p>' + translations[message] + '</p>',
            title: translations['INFO.POPUP_TITLE'],
            subTitle: subtitle && translations[subtitle] || undefined,
            cssClass: options.cssClass,
            buttons: [
              {
                text: translations[options.okText],
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

  function alertNotImplemented() {
    return alertInfo('INFO.FEATURES_NOT_IMPLEMENTED');
  }

  function alertDemo() {
    return $translate(["MODE.DEMO.FEATURE_NOT_AVAILABLE", "MODE.DEMO.INSTALL_HELP"])
      .then(function(translations) {
        var message = translations["MODE.DEMO.FEATURE_NOT_AVAILABLE"] + "<br/><br/>" + translations["MODE.DEMO.INSTALL_HELP"];
        return alertInfo(message, undefined, {cssClass: 'large'});
      });
  }

  function askConfirm(message, title, options) {
    message = message || 'CONFIRM.CAN_CONTINUE';
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
          okType: options.okType
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

  function showLoading(options) {
    if (!loadingTextCache) {
      return $translate('COMMON.LOADING')
        .then(function(translation){
          loadingTextCache = translation;
          return showLoading(options);
        });
    }
    options = options || {};
    options.template = options.template||loadingTextCache;

    return $ionicLoading.show(options);
  }

  function updateLoading(options) {
    return $ionicLoading._getLoader().then(function(loader) {
      if (!loader || !loader.isShown) return;
      // Translate template (if exists)
      if (options && options.template) {
        return $translate(options && options.template)
          .then(function(template) {
            options.template = template;
            return loader;
          });
      }
    })
      .then(function(loader) {
        if (loader && loader.isShown) return showLoading(options);
      });
  }

  function showToast(message, duration, position) {
    if (!message) return $q.reject("Missing 'message' argument");
    duration = duration || 'short';
    position = position || 'bottom';

    return $translate([message])
      .then(function(translations){

        // removeIf(no-device)
        // Use the Cordova Toast plugin
        if (!!window.cordova) {
          $cordovaToast.show(translations[message], duration, position);
          return;
        }
        // endRemoveIf(no-device)

        // removeIf(device)
        // Use the $ionicLoading toast.
        // First, make sure to convert duration in number
        if (typeof duration == 'string') {
          if (duration === 'short') {
            duration = 2000;
          }
          else {
            duration = 5000;
          }
        }
        return $ionicLoading.show({ template: translations[message], noBackdrop: true, duration: duration });
        // endRemoveIf(device)
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
      else if (fullMsg === 'CANCELLED') {
        return hideLoading(10); // timeout, to avoid bug on transfer (when error on reference)
      }

      // Otherwise, log to console and display error
      else {
        hideLoading(10); // timeout, to avoid bug on transfer (when error on reference)
        return alertError(fullMsg, subtitle);
      }
    };
  }

  function isSmallScreen() {
    return data.smallscreen.active;
  }

  function selectElementText(el) {
    if (el.value || el.type === "text" || el.type === "textarea") {
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
      var width = event.target.width,
        height = event.target.height,
        maxWidth = (thumbnail ? CONST.THUMB_MAX_WIDTH : CONST.MAX_WIDTH),
        maxHeight = (thumbnail ? CONST.THUMB_MAX_HEIGHT : CONST.MAX_HEIGHT)
        ;

      var canvas = document.createElement("canvas");
      var ctx;

      // Thumbnail: resize and crop (to the expected size)
      if (thumbnail) {

        // landscape
        if (width > height) {
          width *= maxHeight / height;
          height = maxHeight;
        }

        // portrait
        else {
          height *= maxWidth / width;
          width = maxWidth;
        }
        canvas.width = maxWidth;
        canvas.height = maxHeight;
        ctx = canvas.getContext("2d");
        var xoffset = Math.trunc((maxWidth - width) / 2 + 0.5);
        var yoffset = Math.trunc((maxHeight - height) / 2 + 0.5);
        ctx.drawImage(event.target,
          xoffset, // x1
          yoffset, // y1
          maxWidth + -2 * xoffset, // x2
          maxHeight + -2 * yoffset // y2
        );
      }

      // Resize, but keep the full image
      else {

        // landscape
        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        }

        // portrait
        else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx = canvas.getContext("2d");

        // Resize the whole image
        ctx.drawImage(event.target, 0, 0,  canvas.width, canvas.height);
      }

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

  function imageOnLoadRotate(resolve, reject) {
    var deg = Math.PI / 180;
    var angle = 90 * deg;
    return function(event) {
      var width = event.target.width;
      var height = event.target.height;
      var maxWidth = CONST.MAX_WIDTH;
      var maxHeight = CONST.MAX_HEIGHT;

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
      canvas.width = height;
      canvas.height = width;

      var ctx = canvas.getContext("2d");
      ctx.rotate(angle);
      ctx.drawImage(event.target, 0, (-1) * canvas.width);

      var dataurl = canvas.toDataURL();

      canvas.remove();

      resolve(dataurl);
    };
  }

  function rotateFromSrc(imageSrc, angle) {
    var img = document.createElement("img");
    return $q(function(resolve, reject) {
        img.onload = imageOnLoadRotate(resolve, reject, angle);
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
    options.autoremove = angular.isDefined(options.autoremove) ? options.autoremove : true;
    options.backdropClickToClose = angular.isDefined(options.backdropClickToClose) ? options.backdropClickToClose : true;
    options.focusFirstInput = angular.isDefined(options.focusFirstInput) ? options.focusFirstInput : false;

    var _show = function(popover) {
      popover = popover || options.scope.popovers[options.templateUrl];
      popover.isResolved=false;
      popover.deferred=deferred;
      popover.options=options;
      // Fill the popover scope
      if (options.bindings) {
        angular.merge(popover.scope, options.bindings);
      }
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
            var autoremove = popover.options && popover.options.autoremove;
            if (popover.options) delete popover.options.autoremove; // remove to avoid to trigger 'popover.hidden'
            popover.hide()
              .then(function() {
                if (autoremove) {
                  return _cleanup(popover);
                }
              })
              .then(function() {
                if (popover.deferred) {
                  popover.deferred.resolve(result);
                }
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

  function showCopyPopover(event, value) {
    var rows = value && value.indexOf('\n') >= 0 ? value.split('\n').length : 1;
    return showPopover(event, {
      templateUrl: 'templates/common/popover_copy.html',
      bindings: {
        value: value,
        rows: rows
      },
      autoselect: '.popover-copy ' + (rows <= 1 ? 'input' : 'textarea')
    });
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
    return showPopover(event, options);
  }

  function showHelptip(id, options) {
    var element = (typeof id == 'string') && id ? $window.document.getElementById(id) : id;
    if (!id && !element && options.selector) {
      element = $window.document.querySelector(options.selector);
    }

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
        if (fab.id === id) {
          fab.classList.toggle('on', false);
        }
      });
    }, timeout);
  }

  function motionDelegate(delegate, ionListClass) {
    var motionTimeout = isSmallScreen() ? 100 : 10;
    var defaultSelector = '.list.{0} .item, .list .{0} .item'.format(ionListClass, ionListClass);
    return {
      ionListClass: ionListClass,
      show: function(options) {
        options = options || {};
        options.selector = options.selector || defaultSelector;
        options.ink = angular.isDefined(options.ink) ? options.ink : true;
        options.startVelocity = options.startVelocity || (isSmallScreen() ? 1100 : 3000);
        return $timeout(function(){

          // Display ink effect (no selector need)
          if (options.ink) exports.ink();

          // Display the delegated motion effect
          delegate(options);
        }, options.timeout || motionTimeout);
      }
    };
  }

  function setEffects(enable) {
    if (exports.motion.enable === enable) return; // unchanged
    console.debug('[UI] [effects] ' + (enable ? 'Enable' : 'Disable'));

    exports.motion.enable = enable;
    if (enable) {
      $ionicConfig.views.transition('platform');
      angular.merge(exports.motion, raw.motion);
    }
    else {
      $ionicConfig.views.transition('none');
      var nothing = {
        ionListClass: '',
        show: function(){}
      };
      angular.merge(exports.motion, {
        enable : false,
        default: nothing,
        fadeSlideIn: nothing,
        fadeSlideInRight: nothing,
        panInLeft: nothing,
        pushDown: nothing,
        ripple: nothing,
        slideUp: nothing,
        fadeIn: nothing,
        toggleOn: toggleOn,
        toggleOff: toggleOff
      });
      $rootScope.motion = nothing;
    }
    $ionicHistory.clearCache();
  }

  raw.motion = {
    enable: true,
    default: motionDelegate(ionicMaterialMotion.ripple, 'animate-ripple'),
    blinds: motionDelegate(ionicMaterialMotion.blinds, 'animate-blinds'),
    fadeSlideIn: motionDelegate(ionicMaterialMotion.fadeSlideIn, 'animate-fade-slide-in'),
    fadeSlideInRight: motionDelegate(ionicMaterialMotion.fadeSlideInRight, 'animate-fade-slide-in-right'),
    panInLeft: motionDelegate(ionicMaterialMotion.panInLeft, 'animate-pan-in-left'),
    pushDown: motionDelegate(ionicMaterialMotion.pushDown, 'push-down'),
    ripple: motionDelegate(ionicMaterialMotion.ripple, 'animate-ripple'),
    slideUp: motionDelegate(ionicMaterialMotion.slideUp, 'slide-up'),
    fadeIn: motionDelegate(function(options) {
      toggleOn(options);
    }, 'fade-in'),
    toggleOn: toggleOn,
    toggleOff: toggleOff
  };

  function createQRCodeObj(text, typeNumber,
                        errorCorrectionLevel, mode, mb) {

    mb = mb || 'default'; // default | SJIS | UTF-8
    qrcode.stringToBytes = qrcode.stringToBytesFuncs[mb];

    var qr = qrcode(typeNumber || 4, errorCorrectionLevel || 'M');
    qr.addData(text, mode);
    qr.make();

    return qr;
  }

  /**
   * Create a QRCode as an <svg> tag
   * @param text
   * @param typeNumber
   * @param errorCorrectionLevel
   * @param mode
   * @param mb multibyte ? value: 'default' | 'SJIS' | 'UTF-8'
   * @returns {string}
   */
  function getSvgQRCode(text, typeNumber,
                        errorCorrectionLevel, mode, mb) {

    var qr = createQRCodeObj(text, typeNumber, errorCorrectionLevel, mode, mb);
    return qr.createSvgTag();
  }

  /**
   * Create a QRCode as an <img> tag
   * @param text
   * @param typeNumber
   * @param errorCorrectionLevel
   * @param mode
   * @param mb multibyte ? value: 'default' | 'SJIS' | 'UTF-8'
   * @returns {string}
   */
  function getImgQRCode(text, typeNumber,
                           errorCorrectionLevel, mode, mb) {

    var qr = createQRCodeObj(text, typeNumber, errorCorrectionLevel, mode, mb);
    return qr.createImgTag();
  }

  function toggleOn(options, timeout) {
    // We have a single option, so it may be passed as a string or property
    if (typeof options === 'string') {
      options = {
        selector: options
      };
    }

    // Fail early & silently log
    var isInvalidSelector = typeof options.selector === 'undefined' || options.selector === '';

    if (isInvalidSelector) {
      console.error('invalid toggleOn selector');
      return false;
    }

    $timeout(function () {
      var elements = document.querySelectorAll(options.selector);
      if (elements) _.forEach(elements, function(element){
        element.classList.toggle('on', true);
      });
    }, timeout || 100);
  }

  function toggleOff(options, timeout) {
    // We have a single option, so it may be passed as a string or property
    if (typeof options === 'string') {
      options = {
        selector: options
      };
    }

    // Fail early & silently log
    var isInvalidSelector = typeof options.selector === 'undefined' || options.selector === '';

    if (isInvalidSelector) {
      console.error('invalid toggleOff selector');
      return false;
    }

    $timeout(function () {
      var elements = document.querySelectorAll(options.selector);
      if (elements) _.forEach(elements, function(element){
        element.classList.toggle('on', false);
      });
    }, timeout || 900);
  }

  exports = {
    alert: {
      error: alertError,
      info: alertInfo,
      confirm: askConfirm,
      notImplemented: alertNotImplemented,
      demo: alertDemo
    },
    loading: {
      show: showLoading,
      hide: hideLoading,
      update: updateLoading
    },
    toast: {
      show: showToast
    },
    onError: onError,
    screen: {
      isSmall: isSmallScreen,
      fullscreen: Fullscreen
    },
    ink: ionicMaterialInk.displayEffect,
    motion: raw.motion,
    setEffects: setEffects,
    qrcode: {
      svg: getSvgQRCode,
      img: getImgQRCode
    },
    fab: {
      show: showFab,
      hide: hideFab
    },
    popover: {
      show: showPopover,
      copy: showCopyPopover,
      share: showSharePopover,
      helptip: showHelptip
    },
    selection: {
      select: selectElementText,
      get: getSelectionText
    },
    image: {
      resizeFile: resizeImageFromFile,
      resizeSrc: resizeImageFromSrc,
      rotateSrc: rotateFromSrc
    },
    raw: raw
  };

  return exports;
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
