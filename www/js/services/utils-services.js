angular.module('cesium.utils.services', ['ngResource'])

.factory('UIUtils',
  function($ionicLoading, $ionicPopup, $translate, $q, ionicMaterialInk, ionicMaterialMotion, $window, $timeout) {
  'ngInject';

  function exact(regexpContent) {
    return new RegExp("^" + regexpContent + "$");
  }

  var
    loadingTextCache=null,
    CONST = {
      MAX_HEIGHT: 400,
      MAX_WIDTH: 400,
      THUMB_MAX_HEIGHT: 150,
      THUMB_MAX_WIDTH: 150
    },
    regex = {
      IMAGE_SRC: exact("data:([A-Za-z//]+);base64,(.*)")
    }
  ;

  function alertError(err, subtitle) {
    return $q(function(resolve, reject) {
      if (!err) {
        resolve();
        return;
      }
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
    return $q(function(resolve, reject) {
      $translate([message, subtitle, 'INFO.POPUP_TITLE', 'COMMON.BTN_OK'])
      .then(function (translations) {
        $ionicPopup.show({
          template: '<p>' + translations[message] + '</p>',
          title: translations['INFO.POPUP_TITLE'],
          subTitle: translations[subtitle],
          buttons: [
            {
              text: '<b>'+translations['COMMON.BTN_OK']+'</b>',
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

  function askConfirm(message, title) {
    if (!title) {
      title = 'CONFIRM.POPUP_TITLE';
    }
    return $q(function(resolve, reject) {
      $translate([message, title, 'COMMON.BTN_CANCEL', 'COMMON.BTN_OK'])
      .then(function (translations) {
        $ionicPopup.confirm({
          template: translations[message],
          title: translations[title],
          cancelText: translations['COMMON.BTN_CANCEL'],
          okText: translations['COMMON.BTN_OK']
        })
        .then(function(res) {
          resolve(res);
        });
      });
    });
  }

  function hideLoading(timeout){
    if (timeout) {
      $timeout(function(){
        $ionicLoading.hide();
      }, timeout);
    }
    else {
      $ionicLoading.hide();
    }
  }

  function showLoading() {
    if (!loadingTextCache) {
      $translate(['COMMON.LOADING'])
      .then(function(translations){
        loadingTextCache = translations['COMMON.LOADING'];
        showLoading();
      });
      return;
    }

    $ionicLoading.show({
      template: loadingTextCache
    });
  }

  function showToast(message, duration) {
    if (!duration) {
      duration = 2000; // 2s
    }
    $translate([message])
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
      // Otherwise, log to console and display error
      else {
        console.error('>>>>>>>' , err);
        hideLoading(10); // timeout, to avoid bug on transfer (when error on reference)
        alertError(fullMsg, subtitle);
      }
    };
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

       resolve(dataurl);
     };
  }

  function resizeImageFromFile(file, thumbnail) {
    return $q(function(resolve, reject) {

      if (file) {
        var reader = new FileReader();
        reader.onload = function(event){
          var img = document.createElement("img");
          img.onload = imageOnLoadResize(resolve, reject, thumbnail);
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  function resizeImageFromSrc(imageSrc, thumbnail) {
    return $q(function(resolve, reject) {
      var img = document.createElement("img");
      img.onload = imageOnLoadResize(resolve, reject, thumbnail);
      img.src = imageSrc;
    });
  }

  function imageFromAttachment(attachment) {
    if (!attachment || !attachment._content_type || !attachment._content) {
      return null;
    }
    var image = {
      src: "data:" + attachment._content_type + ";base64," + attachment._content
    };
    if (attachment._title) {
      image.title = attachment._title;
    }
    if (attachment._name) {
      image.name = attachment._name;
    }
    return image;
  }

  function imageToAttachment(image) {
    if (!image || !image.src) return null;
    var match = regex.IMAGE_SRC.exec(image.src);
    if (!match) return null;
    var attachment = {
      _content_type: match[1],
      _content: match[2]
    };
    if (image.title) {
      attachment._title = image.title;
    }
    if (image.name) {
      attachment._name = image.name;
    }
    return attachment;
  }

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
    ink: ionicMaterialInk.displayEffect,
    motion: ionicMaterialMotion,
    selection: {
      select: selectElementText,
      get: getSelectionText
    },
    image: {
      resizeFile: resizeImageFromFile,
      resizeSrc: resizeImageFromSrc,
      fromAttachment: imageFromAttachment,
      toAttachment: imageToAttachment
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
