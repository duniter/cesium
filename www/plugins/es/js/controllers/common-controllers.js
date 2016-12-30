angular.module('cesium.es.common.controllers', ['ngResource', 'cesium.es.services'])

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESSocialsEditCtrl', ESSocialsEditController)

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



function ESCommentsController($scope, $timeout, $filter, $state, $focus, UIUtils, esHttp, DataService) {
  'ngInject';

  $scope.loadingComments = true;
  $scope.defaultCommentSize = 5;
  $scope.formCommentData = {};

  $scope.loadComments = function(id, options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || $scope.defaultCommentSize;
    options.loadAvatarAllParent = angular.isDefined(options.loadAvatarAllParent) ? options.loadAvatarAllParent : true;
    return DataService.record.comment.load(id, options)
      .then(function(data) {
        $scope.comments = data;
        $scope.comments.hasMore = (data.result && data.result.length >= options.size);
        $scope.loadingComments = false;
        DataService.record.comment.changes.start(id, data);
      });
  };

  $scope.$on('$ionicView.beforeLeave', function(){
    if ($scope.comments) {
      DataService.record.comment.changes.stop($scope.comments);
    }
  });

  $scope.$on('$ionicView.enter', function(){
    if (!$scope.loadingComments) { // second call (when using cached view)
      $scope.loadComments($scope.id)
        .then(function() {
          // Set Motion
          $timeout(function() {
            UIUtils.motion.fadeSlideIn({
              selector: '.card-avatar'
            });
          }, 10);
        });
    }
  });

  $scope.showMoreComments = function(){
    var from = 0;
    var size = -1;
    $scope.loadComments($scope.id, {from: from, size: size, loadAvatarAllParent: false})
    .then(function() {
      // Set Motion
      $timeout(function() {
        UIUtils.motion.fadeSlideIn({
          selector: '.card-avatar'
        });
      }, 10);
    });
  };

  $scope.saveComment = function() {
    if (!$scope.formCommentData.message || !$scope.formCommentData.message.length) return;

    $scope.loadWallet({loadMinData: true})
      .then(function() {
        UIUtils.loading.hide();
        var comment = $scope.formCommentData;
        $scope.formCommentData = {};
        $scope.focusNewComment();
        return DataService.record.comment.save($scope.id, $scope.comments, comment);
      })
      .catch(UIUtils.onError('MARKET.ERROR.FAILED_SAVE_COMMENT'));
  };

  $scope.shareComment = function(event, comment) {
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

  $scope.editComment = function(comment) {
    var newComment = new Comment();
    newComment.copy(comment);
    $scope.formCommentData = newComment;
  };

  $scope.removeComment = function(comment) {
    if (!comment) {return;}
    comment.remove();
  };

  $scope.replyComment = function(parent) {
    if (!parent || !parent.id) {return;}

    $scope.formCommentData = {
      parent: parent
    };

    $scope.focusNewComment(true);
  };

  $scope.cancelReplyComment = function() {
    $scope.formCommentData = {};
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

  $scope.cancelCommentReplyTo = function() {
    delete $scope.formCommentData.parent;
    delete $scope.formCommentData.reply_to;
    $scope.focusNewComment();
  };

  $scope.toggleCommentExpandedReplies = function(comment, index) {
    comment.expandedReplies = comment.expandedReplies || {};
    comment.expandedReplies[index] = !comment.expandedReplies[index];
  };

  $scope.toggleCommentExpandedParent = function(comment, index) {
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
