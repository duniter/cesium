angular.module('cesium.es.common.controllers', ['ngResource', 'cesium.es.services'])

  .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESSocialsEditCtrl', ESSocialsEditController)

 .controller('ESCommentsCtrl', ESCommentsController)

 .controller('ESCategoryModalCtrl', ESCategoryModalController)

;


function ESPicturesEditController($scope, UIUtils, $q, Device) {
  'ngInject';

  $scope.selectNewPicture = function() {
    if (Device.enable){
      openPicturePopup();
    }
    else {
      var fileInput = angular.element(document.querySelector('#pictureFile'));
      if (fileInput && fileInput.length > 0) {
        fileInput[0].click();
      }
    }
  };

  $scope.openPicturePopup = function() {
    Device.camera.getPicture()
    .then(function(imageData) {
      $scope.pictures.push({src: "data:image/png;base64," + imageData});
      $scope.$apply();
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
        //$scope.$apply();
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
}


function ESCategoryModalController($scope, UIUtils, $timeout, parameters) {
  'ngInject';

  $scope.loading = true;
  $scope.allCategories = [];
  $scope.categories = [];
  this.searchText = '';

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



function ESCommentsController($scope, $timeout, $filter, $state, $focus, UIUtils) {
  'ngInject';

  $scope.loading = true;
  $scope.defaultCommentSize = 5;
  $scope.formCommentData = {};
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
    console.debug("[ES] [comment] Initalized service with: " + service.id);
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
        $scope.comments.hasMore = (data.result && data.result.length >= options.size);
        $scope.loading = false;
        $scope.service.changes.start(id, data);

        // Set Motion
        $timeout(function() {
          UIUtils.motion.fadeSlideIn({
            selector: '.comments .item',
            startVelocity: 3000
          });
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
      $timeout(function() {
        UIUtils.motion.fadeSlideIn({
          selector: '.card-avatar'
        });
      }, 10);
    });
  };

  $scope.save = function() {
    if (!$scope.formData.message || !$scope.formData.message.length) return;

    $scope.loadWallet({loadMinData: true})
      .then(function() {
        UIUtils.loading.hide();
        var comment = $scope.formData;
        $scope.formData = {};
        $scope.focusNewComment();
        return $scope.service.save($scope.id, $scope.comments, comment);
      })
      .catch(UIUtils.onError('MARKET.ERROR.FAILED_SAVE_COMMENT'));
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
        date: comment.time,
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

function ESSocialsEditController($scope, $focus, $timeout, $filter, UIUtils, SocialUtils)  {
  'ngInject';

  $scope.socialData = {
    url: null
  };

  $scope.addSocialNetwork = function() {
    if (!$scope.socialData.url || $scope.socialData.url.trim().length === 0) {
      return;
    }
    if (!$scope.formData.socials) {
      $scope.formData.socials = [];
    }
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
    $timeout(function() {
      UIUtils.motion.fadeSlideIn({
        selector: '#social-' + $filter('formatSlug')(url),
        startVelocity: 10000
      });
    }, 10);
  };

  $scope.editSocialNetwork = function(index) {
    var social = $scope.formData.socials[index];
    $scope.formData.socials.splice(index, 1);
    $scope.socialData.url = social.url;
    $focus('socialUrl');
  };
}
