angular.module('cesium.es.common.controllers', ['ngResource', 'cesium.es.services'])

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESSocialsEditCtrl', ESSocialsEditController)

 .controller('ESSocialsViewCtrl', ESSocialsViewController)

 .controller('ESCommentsCtrl', ESCommentsController)

 .controller('ESCategoryModalCtrl', ESCategoryModalController)

 .controller('ESAvatarModalCtrl', ESAvatarModalController)

 .controller('ESPositionEditCtrl', ESPositionEditController)

  .controller('ESSearchPositionModalCtrl', ESSearchPositionModalController)


;


function ESPicturesEditController($scope, UIUtils, $q, Device) {
  'ngInject';

  $scope.selectNewPicture = function(inputSelector) {
    if (Device.enable){
      openPicturePopup();
    }
    else {
      var fileInput = angular.element(document.querySelector(inputSelector||'#pictureFile'));
      if (fileInput && fileInput.length > 0) {
        fileInput[0].click();
      }
    }
  };

  $scope.openPicturePopup = function() {
    Device.camera.getPicture()
      .then(function(imageData) {
        $scope.pictures.push({
          src: "data:image/png;base64," + imageData,
          isnew: true // use to prevent visibility hidden (if animation)
        });
      })
      .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
  };

  $scope.fileChanged = function(event) {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      var file = event.target.files[0];
      UIUtils.image.resizeFile(file)
      .then(function(imageData) {
        $scope.pictures.push({
          src: imageData,
          isnew: true // use to prevent visibility hidden (if animation)
        });
        UIUtils.loading.hide(100);
        resolve();
      });
    });
  };

  $scope.removePicture = function(index){
    $scope.pictures.splice(index, 1);
  };

  $scope.favoritePicture = function(index){
    if (index > 0) {
      var item = $scope.pictures[index];
      $scope.pictures.splice(index, 1);
      $scope.pictures.splice(0, 0, item);
    }
  };

  $scope.rotatePicture = function(index){
    var item = $scope.pictures[index];
    UIUtils.image.rotateSrc(item.src)
      .then(function(dataURL){
        item.src = dataURL;
      });
  };
}


function ESCategoryModalController($scope, UIUtils, $timeout, parameters) {
  'ngInject';

  $scope.loading = true;
  $scope.allCategories = [];
  $scope.categories = [];
  this.searchText = '';

  // modal title
  this.title = parameters && parameters.title;

  $scope.afterLoad = function(result) {
    $scope.categories = result;
    $scope.allCategories = result;
    $scope.loading = false;
    $timeout(function() {
      UIUtils.ink();
    }, 10);
  };

  this.doSearch = function() {
    var searchText = this.searchText.toLowerCase().trim();
    if (searchText.length > 1) {
      $scope.loading = true;
      $scope.categories = $scope.allCategories.reduce(function(result, cat) {
        if (cat.parent && cat.name.toLowerCase().search(searchText) != -1) {
            return result.concat(cat);
        }
        return result;
      }, []);

      $scope.loading = false;
    }
    else {
      $scope.categories = $scope.allCategories;
    }
  };

  // load categories
  if (parameters && parameters.categories) {
    $scope.afterLoad(parameters.categories);
  }
  else if (parameters && parameters.load) {
    parameters.load()
    .then(function(res){
      $scope.afterLoad(res);
    });
  }

}



function ESCommentsController($scope, $filter, $state, $focus, UIUtils) {
  'ngInject';

  $scope.loading = true;
  $scope.defaultCommentSize = 5;
  $scope.formData = {};
  $scope.comments = {};

  $scope.$on('$recordView.enter', function(e, state) {
    // second call (when using cached view)
    if (!$scope.loading && $scope.id) {
      $scope.load($scope.id, {animate: false});
    }
  });

  $scope.$on('$recordView.load', function(event, id, service) {
    $scope.id = id || $scope.id;
    $scope.service = service || $scope.service;
    console.debug("[ES] [comment] Initialized service with: " + service.id);
    if ($scope.id) {
      $scope.load($scope.id);
    }
  });

  $scope.load = function(id, options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || $scope.defaultCommentSize;
    options.animate = angular.isDefined(options.animate) ? options.animate : true;
    options.loadAvatarAllParent = angular.isDefined(options.loadAvatarAllParent) ? options.loadAvatarAllParent : true;
    $scope.loading = true;
    return $scope.service.load(id, options)
      .then(function(data) {
        if (!options.animate && data.result.length) {
          _.forEach(data.result, function(cmt) {
            cmt.isnew = true;
          });
        }
        $scope.comments = data;
        $scope.comments.hasMore = (data.total > data.result.length);
        $scope.loading = false;
        $scope.service.changes.start(id, data, $scope);

        // Set Motion
        $scope.motion.show({
          selector: '.comments .item',
          ink: false
        });
      });
  };

  $scope.$on('$recordView.beforeLeave', function(){
    if ($scope.comments) {
      $scope.service.changes.stop($scope.comments);
    }
  });

  $scope.showMore = function(){
    var from = 0;
    var size = -1;
    $scope.load($scope.id, {from: from, size: size, loadAvatarAllParent: false})
    .then(function() {
      // Set Motion
      $scope.motion.show({
        selector: '.card-avatar'
      });
    });
  };

  $scope.save = function() {
    if (!$scope.formData.message || !$scope.formData.message.length) return;

    $scope.loadWallet({minData: true, auth: true})
      .then(function() {
        UIUtils.loading.hide();
        var comment = $scope.formData;
        $scope.formData = {};
        $scope.focusNewComment();
        return $scope.service.save($scope.id, $scope.comments, comment);
      })

      .catch(UIUtils.onError('REGISTRY.ERROR.FAILED_SAVE_COMMENT'));
  };

  $scope.share = function(event, comment) {
    var params = angular.copy($state.params);
    var stateUrl;
    if (params.anchor) {
      params.anchor= $filter('formatHash')(comment.id);
      stateUrl = $state.href($state.current.name, params, {absolute: true});
    }
    else {
      stateUrl = $state.href($state.current.name, params, {absolute: true}) + '/' + $filter('formatHash')(comment.id);
    }
    var index = _.findIndex($scope.comments.result, {id: comment.id});
    var url = stateUrl + '?u=' + (comment.uid||$filter('formatPubkey')(comment.issuer));
    UIUtils.popover.show(event, {
      templateUrl: 'templates/common/popover_share.html',
      scope: $scope,
      bindings: {
        titleKey: 'COMMENTS.POPOVER_SHARE_TITLE',
        titleValues: {number: index ? index + 1 : 1},
        date: comment.creationTime,
        value: url,
        postUrl: stateUrl,
        postMessage: comment.message
      },
      autoselect: '.popover-share input'
    });
  };

  $scope.edit = function(comment) {
    var newComment = new Comment();
    newComment.copy(comment);
    $scope.formData = newComment;
  };

  $scope.remove = function(comment) {
    if (!comment) {return;}
    comment.remove();
  };

  $scope.reply = function(parent) {
    if (!parent || !parent.id) {return;}

    $scope.formData = {
      parent: parent
    };

    $scope.focusNewComment(true);
  };

  $scope.cancel = function() {
    $scope.formData = {};
    $scope.focusNewComment();
  };

  $scope.focusNewComment = function(forceIfSmall) {
    if (!UIUtils.screen.isSmall()) {
      $focus('comment-form-textarea');
    }
    else {
      if (forceIfSmall) $focus('comment-form-input');
    }
  };

  $scope.removeParentLink = function() {
    delete $scope.formData.parent;
    delete $scope.formData.reply_to;
    $scope.focusNewComment();
  };

  $scope.toggleExpandedReplies = function(comment, index) {
    comment.expandedReplies = comment.expandedReplies || {};
    comment.expandedReplies[index] = !comment.expandedReplies[index];
  };

  $scope.toggleExpandedParent = function(comment, index) {
    comment.expandedParent = comment.expandedParent || {};
    comment.expandedParent[index] = !comment.expandedParent[index];
  };
}

function ESSocialsEditController($scope, $focus, $filter, UIUtils, SocialUtils)  {
  'ngInject';

  $scope.socialData = {
    url: null
  };

  $scope.addSocialNetwork = function() {
    if (!$scope.socialData.url || $scope.socialData.url.trim().length === 0) {
      return;
    }
    $scope.formData.socials = $scope.formData.socials || [];
    var url = $scope.socialData.url.trim();

    var exists = _.findWhere($scope.formData.socials, {url: url});
    if (exists) { // duplicate entry
      $scope.socialData.url = '';
      return;
    }

    var social = SocialUtils.get(url);
    if (!social) {
      UIUtils.alert.error('PROFILE.ERROR.INVALID_SOCIAL_NETWORK_FORMAT');
      $focus('socialUrl');
      return; // stop here
    }
    $scope.formData.socials.push(social);
    $scope.socialData.url = '';

    // Set Motion
    $scope.motion.show({
      selector: '#social-' + $filter('formatSlug')(social.url),
      startVelocity: 10000
    });
  };

  $scope.editSocialNetwork = function(index) {
    var social = $scope.formData.socials[index];
    $scope.formData.socials.splice(index, 1);
    $scope.socialData.url = social.url;
    $focus('socialUrl');
  };

  $scope.filterFn = function(social) {
    return !social.recipient || social.valid;
  };
}

function ESSocialsViewController($scope)  {
  'ngInject';

  $scope.openSocial = function(event, social) {
    return $scope.openLink(event, social.url, {
      type: social.type
    });
  };


  $scope.filterFn = function(social) {
    return !social.recipient || social.valid;
  };

}



function ESAvatarModalController($scope) {

  $scope.formData = {
    initCrop: false,
    imageCropStep: 0,
    imgSrc: undefined,
    result: undefined,
    resultBlob: undefined
  };

  $scope.openFileSelector = function() {
    var fileInput = angular.element(document.querySelector('.modal-avatar #fileInput'));
    if (fileInput && fileInput.length > 0) {
      fileInput[0].click();
    }
  };

  $scope.fileChanged = function(e) {

    var files = e.target.files;
    var fileReader = new FileReader();
    fileReader.readAsDataURL(files[0]);

    fileReader.onload = function(e) {
      $scope.formData.imgSrc = this.result;
      $scope.$apply();
    };
  };

  $scope.doNext = function() {
    if ($scope.formData.imageCropStep == 2) {
      $scope.doCrop();
    }
    else if ($scope.formData.imageCropStep == 3) {
      $scope.closeModal($scope.formData.result);
    }
  };

  $scope.doCrop = function() {
    $scope.formData.initCrop = true;
  };

  $scope.clear = function() {
    $scope.formData = {
      initCrop: false,
      imageCropStep: 1,
      imgSrc: undefined,
      result: undefined,
      resultBlob: undefined
    };
  };

}


function ESPositionEditController($scope, csConfig, esGeo, ModalUtils) {
  'ngInject';

  // The default country used for address localisation
  var defaultCountry = csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.defaultCountry;

  var loadingCurrentPosition = false;
  $scope.formPosition = {
    loading: false,
    enable: undefined
  };

  $scope.tryToLocalize = function() {
    if ($scope.formPosition.loading || loadingCurrentPosition) return;

    var searchText = $scope.getAddressToSearch();

    // No address, so try to localize by device
    if (!searchText) {
      loadingCurrentPosition = true;
      return esGeo.point.current()
        .then($scope.updateGeoPoint)
        .then(function() {
          loadingCurrentPosition = false;
        })
        .catch(function(err) {
          console.error(err); // Silent
          loadingCurrentPosition = false;
          //$scope.form.geoPoint.$setValidity('required', false);
        });
    }

    $scope.formPosition.loading = true;
    return esGeo.point.searchByAddress(searchText)
      .then(function(res) {
        if (res && res.length == 1) {
          return $scope.updateGeoPoint(res[0]);
        }
        return $scope.openSearchLocationModal({
          text: searchText,
          results: res||[],
          forceFallback: !res || !res.length // force fallback search first
        });
      })
      .then(function() {
        $scope.formPosition.loading = false;
      })
      .catch(function(err) {
        console.error(err); // Silent
        $scope.formPosition.loading = false;
      });
  };

  $scope.onCityChanged = function() {
    if ($scope.loading) return;
    if ($scope.form) {
      $scope.form.$valid = undefined;
    }
    if ($scope.formPosition.enable) {
      return $scope.tryToLocalize();
    }
  };

  $scope.onUseGeopointChanged = function() {
    if ($scope.loading) return;
    if (!$scope.formPosition.enable) {
      if ($scope.formData.geoPoint) {
        $scope.formData.geoPoint = null;
        //$scope.form.geoPoint.$setValidity('required', true);
        $scope.dirty = true;
      }
    }
    else {
      $scope.tryToLocalize();
    }
  };

  $scope.onGeopointChanged = function() {
    if ($scope.loading) {
      $scope.formPosition.enable = $scope.formData.geoPoint && !!$scope.formData.geoPoint.lat && !!$scope.formData.geoPoint.lon;
    }
  };
  $scope.$watch('formData.geoPoint', $scope.onGeopointChanged);

  $scope.getAddressToSearch = function() {
    return $scope.formData.address && $scope.formData.city ?
      [$scope.formData.address.trim(), $scope.formData.city.trim()].join(', ') :
    $scope.formData.city || $scope.formData.address;
  };

  $scope.updateGeoPoint = function(res) {
    // user cancel
    if (!res || !res.lat || !res.lon) {
      // nothing to do
      return;
    }

    $scope.dirty = true;
    $scope.formData.geoPoint = $scope.formData.geoPoint || {};
    $scope.formData.geoPoint.lat =  parseFloat(res.lat);
    $scope.formData.geoPoint.lon =  parseFloat(res.lon);

    if (res.address && res.address.city) {
      var cityParts = [res.address.city];
      if (res.address.postcode) {
        cityParts.push(res.address.postcode);
      }
      if (res.address.country != defaultCountry) {
        cityParts.push(res.address.country);
      }
      $scope.formData.city = cityParts.join(', ');
    }
  };

  /* -- modal -- */

  $scope.openSearchLocationModal = function(options) {

    options = options || {};

    var parameters = {
      text: options.text || $scope.getAddressToSearch(),
      results: options.results,
      fallbackText: options.fallbackText || $scope.formData.city,
      forceFallback: angular.isDefined(options.forceFallback) ? options.forceFallback : undefined
    };

    return ModalUtils.show(
        'plugins/es/templates/common/modal_location.html',
        'ESSearchPositionModalCtrl',
        parameters,
        {
          focusFirstInput: true
          //,scope: $scope
        }
      )
      .then($scope.updateGeoPoint);
  };
}

function ESSearchPositionModalController($scope, $q, $translate, esGeo, parameters) {
  'ngInject';

  $scope.search = {
    text: parameters.text || '',
    fallbackText: parameters.fallbackText || undefined,
    forceFallback: angular.isDefined(parameters.forceFallback) ? parameters.forceFallback : false,
    loading: false,
    results: parameters.results || undefined
  };

  $scope.$on('modal.shown', function() {
    // Load search
    $scope.doSearch(true/*first search*/);
  });

  $scope.doSearch = function(firstSearch) {

    var text = $scope.search.text && $scope.search.text.trim();
    if (!text) {
      return $q.when(); // nothing to search
    }

    $scope.search.loading = true;

    // Compute alternative query text
    var fallbackText = firstSearch && $scope.search.fallbackText && $scope.search.fallbackText.trim();
    fallbackText = fallbackText && fallbackText != text ? fallbackText : undefined;

    // Execute the given query
    return ((firstSearch && $scope.search.forceFallback && $scope.search.results) ?
      $q.when($scope.search.results) :
      esGeo.point.searchByAddress(text)
    )
      .then(function(res) {
        if (res && res.length || !fallbackText) return res;

        // Fallback search
        return $q.all([
          $translate('PROFILE.MODAL_LOCATION.ALTERNATIVE_RESULT_DIVIDER', {address: fallbackText}),
          esGeo.point.searchByAddress(fallbackText)
        ])
          .then(function (res) {
            var dividerText = res[0];
            res = res[1];
            if (!res || !res.length) return res;

            return [{name: dividerText}].concat(res);
          });
      })
      .then(function(res) {
        $scope.search.loading = false;
        $scope.search.results = res||[];

        $scope.license = res && res.length && res[0].license;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = [];
        $scope.license = undefined;
        throw err;
      })
      ;
  };

}
