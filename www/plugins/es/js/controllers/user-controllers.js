angular.module('cesium.es.user.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider.state('app.user_edit_profile', {
      cache: false,
      url: "/wallet/profile/edit",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/user/edit_profile.html",
          controller: 'ProfileCtrl'
        }
      }
    });

  })

 .controller('ProfileCtrl', ProfileController)

 .controller('AvatarModalCtrl', AvatarModalController)

;

function ProfileController($scope, $rootScope, $timeout, $state, $focus, $translate, $ionicHistory,
                           esUser, SocialUtils, UIUtils, esHttp, ModalUtils, Device) {
  'ngInject';

  $scope.loading = true;
  $scope.dirty = false;
  $scope.walletData = null;
  $scope.formData = {
    title: null,
    description: null,
    socials: []
  };
  $scope.avatar = null;
  $scope.existing = false;
  $scope.socialData = {
    url: null
  };

  $scope.$on('$ionicView.enter', function(e) {
    $scope.loadWallet()
      .then(function(walletData) {
        return $scope.load(walletData);
      })
      .catch(function(err){
        if (err == 'CANCELLED') {
          return $scope.close()
            .then(UIUtils.loading.hide);
        }
        UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
      });
  });

  $scope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if ($scope.dirty && !$scope.saving) {

      // stop the change state action
      event.preventDefault();

      if (!$scope.loading) {
        $scope.loading = true;
        return UIUtils.alert.confirm('CONFIRM.SAVE_BEFORE_LEAVE',
          'CONFIRM.SAVE_BEFORE_LEAVE_TITLE', {
            cancelText: 'COMMON.BTN_NO',
            okText: 'COMMON.BTN_YES_SAVE'
          })
          .then(function(confirmSave) {
            $scope.loading = false;
            if (confirmSave) {
              return $scope.save();
            }
          })
          .then(function() {
            $scope.dirty = false;
            $ionicHistory.nextViewOptions({
              historyRoot: true
            });
            $state.go(next.name, nextParams);
          });
      }
    }
  });

  $scope.load = function(walletData) {
    $scope.loading = true; // to avoid the call of doSave()
    return esUser.profile.get({id: walletData.pubkey})
      .then(function(res) {
        if (res && res.found && res._source) {
          var profile = res._source;
          $scope.avatar = profile.avatar ? esHttp.image.fromAttachment(profile.avatar) : null;
          profile.socials = profile.socials ? SocialUtils.reduce(profile.socials) : [];
          $scope.existing = true;
          $scope.updateView(walletData, profile);
        }

        // removeIf(device)
        $focus('profile-name');
        // endRemoveIf(device)
      })
      .catch(function(err){
        UIUtils.loading.hide(10);
        if (err && err.ucode == 404) {
          $scope.updateView(walletData, {});
          $scope.existing = false;
        }
        else {
          UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
        }
      });
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.updateView = function(wallet, profile) {
    $scope.walletData = wallet;
    $scope.formData = profile;
    if (profile.avatar) {
      $scope.avatarStyle={'background-image':'url("'+$scope.avatar.src+'")'};
    }
    $scope.motion.show();
    UIUtils.loading.hide();

    // Update loading - done with a delay, to avoid trigger onFormDataChanged()
    $timeout(function() {
      $scope.loading = false;
    }, 1000);
  };

  $scope.onFormDataChanged = function() {
    if ($scope.loading) return;
    $scope.dirty = true;
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);

  $scope.save = function(silent) {
    console.debug('saving');
    if(!$scope.form.$valid || !$rootScope.walletData) {
      return;
    }

    $scope.saving = true;

    var onError = function(message) {
      return function(err) {
        $scope.saving = false;
        UIUtils.onError(message)(err);
      };
    };

    var updateWallet = function(formData) {
      if (formData) {
        $scope.walletData.name = formData.title;
        if ($scope.avatar) {
          $scope.walletData.avatar = $scope.avatar;
        }
        else {
          delete $scope.walletData.avatar;
        }

        $scope.walletData.profile = angular.copy(formData);
        $scope.walletData.profile.description = esHttp.util.trustAsHtml(formData.description);
      }
    };

    var showSuccessToast = function() {
      if (!silent) {
        return $translate('PROFILE.INFO.PROFILE_SAVED')
          .then(function(message){
            UIUtils.toast.show(message);
          });
      }
    };

    var doFinishSave = function(formData) {
      // Social url must be unique in socials links - Fix #306:
      if (formData.socials && formData.socials.length) {
        formData.socials = _.uniq(formData.socials, false, function(social) {
          return social.url;
        });
      }
      if (!$scope.existing) {
        return esUser.profile.add(formData)
          .then(function() {
            console.log("User profile successfully created.");
            $scope.existing = true;
            $scope.saving = false;
            $scope.dirty = false;
            updateWallet(formData);
            showSuccessToast();
          })
          .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
      else {
        return esUser.profile.update(formData, {id: $rootScope.walletData.pubkey})
          .then(function() {
            console.log("User profile successfully updated.");
            $scope.saving = false;
            $scope.dirty = false;
            updateWallet(formData);
            showSuccessToast();
          })
          .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
    };

    if ($scope.avatar && $scope.avatar.src) {
      return UIUtils.image.resizeSrc($scope.avatar.src, true) // resize to thumbnail
        .then(function(imageSrc) {
          $scope.formData.avatar = esHttp.image.toAttachment({src: imageSrc});
          doFinishSave($scope.formData);
        });
    }
    else {
      delete $scope.formData.avatar;
      return doFinishSave($scope.formData);
    }
  };

  $scope.saveAndClose = function() {
    $scope.save()
      .then(function() {
        $scope.close();
      });
  };

  $scope.submitAndSaveAndClose = function() {
    $scope.form.$submitted=true;
    $scope.saveAndClose();
  };

  $scope.cancel = function() {
    $scope.dirty = false; // force not saved
    $scope.close();
  };

  $scope.close = function() {
    return $state.go('app.view_wallet');
  };

  $scope.showAvatarModal = function() {
    if (Device.camera.enable) {
      return Device.camera.getPicture()
        .then(function(imageData) {
          $scope.avatar = {src: "data:image/png;base64," + imageData};
          $scope.dirty = true;
        })
        .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
    }
    else {
      return ModalUtils.show('plugins/es/templates/user/modal_edit_avatar.html','AvatarModalCtrl',
        {})
        .then(function(imageData) {
          if (!imageData) return;
          $scope.avatar = {src: imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          $scope.dirty = true;
        });
    }
  };
}


function AvatarModalController($scope) {

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
      $scope.imgSrc = this.result;
      $scope.$apply();
    };
  };

  $scope.doCrop = function() {
    $scope.initCrop = true;
  };

  $scope.clear = function() {
    $scope.imageCropStep = 1;
    delete $scope.imgSrc;
    delete $scope.result;
    delete $scope.resultBlob;
  };

}
