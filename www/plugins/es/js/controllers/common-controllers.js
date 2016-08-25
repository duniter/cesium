angular.module('cesium.es.common.controllers', ['ngResource', 'cesium.es.services'])

  // Configure menu items
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Menu extension points
      PluginServiceProvider.extendState('app', {
         points: {
           'menu-main': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           },
           'menu-user': {
             templateUrl: "plugins/es/templates/menu_extend.html",
             controller: "ESMenuExtendCtrl"
           }
         }
        });
    }
  })


 .controller('ESMenuExtendCtrl', ESMenuExtendController)

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESSocialsEditCtrl', ESSocialsEditController)

 .controller('ESCategoryModalCtrl', ESCategoryModalController)

;

/**
 * Control menu extension
 */
function ESMenuExtendController($scope, PluginService, csSettings) {
  'ngInject';
  $scope.extensionPoint = PluginService.extensions.points.current.get();

  $scope.updateView = function() {
    $scope.enable = csSettings.data.plugins && csSettings.data.plugins.es ?
                    csSettings.data.plugins.es.enable :
                    !!csSettings.data.plugins.host;
  };

  csSettings.api.data.on.changed($scope, function() {
    $scope.updateView();
  });

  $scope.updateView();
}

function ESPicturesEditController($scope, $ionicModal, Wallet, esMarket, UIUtils, $state, CryptoUtils, $q, $ionicPopup, Device, $timeout, ModalUtils) {
  'ngInject';

  $scope.selectNewPicture = function() {
    if ($scope.isDeviceEnable()){
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



function ESCommentsController($scope, Wallet, UIUtils, $q, $timeout, esHttp, DataService) {
  'ngInject';

  $scope.maxCommentSize = 10;
  $scope.commentData = {};

  $scope.loadComments = function(id) {
    return DataService.record.comment.all(id, $scope.maxCommentSize)
      .then(function(comments) {
        // sort by time asc
        comments  = comments.sort(function(cm1, cm2) {
           return (cm1.time - cm2.time);
        });
        $scope.comments = comments;
      });
  };

  $scope.showMoreComments = function(){
    $scope.maxCommentSize = $scope.maxCommentSize * $scope.maxCommentSize;
    $scope.loadComments($scope.id)
    .then(function() {
      // Set Motion
      $timeout(function() {
        UIUtils.motion.fadeSlideIn({
          selector: '.card-comment'
        });
      }, 10);
    });
  };

  $scope.sendComment = function() {
    if (!$scope.commentData.message || $scope.commentData.message.trim().length === 0) {
      return;
    }
    $scope.loadWallet()
    .then(function(walletData) {
      var comment = $scope.commentData;
      comment.record= $scope.id;
      comment.issuer = walletData.pubkey;
      var obj = {};
      angular.copy(comment, obj);
      if (walletData.uid) {
        obj.uid = walletData.uid;
      }
      obj.isnew = true; // use to  prevent visibility hidden (if animation)
      // Create
      if (!comment.id) {
        comment.time = esHttp.date.now();
        obj.time = comment.time;
        DataService.record.comment.add(comment)
        .then(function (id){
          obj.id = id;
        })
        .catch(UIUtils.onError('esMarket.ERROR.FAILED_SAVE_COMMENT'));
      }
      // Update
      else {
        DataService.record.comment.update(comment, {id: comment.id})
        .catch(UIUtils.onError('esMarket.ERROR.FAILED_SAVE_COMMENT'));
      }

      $scope.comments.push(obj);
      $scope.commentData = {}; // reset comment
      UIUtils.loading.hide();
    });
  };

  $scope.editComment = function(index) {
    var comment = $scope.comments[index];
    $scope.comments.splice(index, 1);
    $scope.commentData = comment;
  };

  $scope.removeComment = function(index) {
    var comment = $scope.comments[index];
    if (!comment || !comment.id) {return;}
    $scope.comments.splice(index, 1);

    DataService.record.comment.remove(comment.id, Wallet.data.keypair)
    .catch(UIUtils.onError('esMarket.ERROR.FAILED_REMOVE_COMMENT'));
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
