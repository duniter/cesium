angular.module('cesium.es.user.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider.state('app.user_edit_profile', {
      url: "/user/profile/edit",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/user/edit_profile.html",
          controller: 'ProfileCtrl'
        }
      }
    });

  })

 .controller('ProfileCtrl', ProfileController)

;

function ProfileController($scope, $rootScope, UIUtils, $timeout, esUser, $filter, $focus, $q, SocialUtils, $translate, $ionicHistory) {
  'ngInject';

  $scope.loading = true;
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

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loading = true; // to avoid the call of doSave()
    $scope.loadWallet()
      .then(function(walletData) {
        esUser.profile.get({id: walletData.pubkey})
        .then(function(res) {
          if (res && res.found && res._source) {
            var profile = res._source;
            $scope.avatar = profile.avatar ? UIUtils.image.fromAttachment(profile.avatar) : null;
            profile.socials = profile.socials ? SocialUtils.reduce(profile.socials) : [];
            $scope.existing = true;
            $scope.updateView(walletData, profile);
          }
          UIUtils.loading.hide();
          $scope.loading = false;
        })
        .catch(function(err){
          if (err && err.ucode == 404) {
            $scope.updateView(walletData, {});
            UIUtils.loading.hide();
            $scope.loading = false;
            $scope.existing = false;
          }
          else {
            UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
          }
        });

        $focus('profile-name');
      });
  });

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.updateView = function(wallet, profile) {
    $scope.walletData = wallet;
    $scope.formData = profile;
    if (profile.avatar) {
      $scope.avatarStyle={'background-image':'url("'+$scope.avatar.src+'")'};
    }
    // Set Motion
    $timeout(function() {
      UIUtils.motion.ripple();
      // Set Ink
      UIUtils.ink({selector: 'ion-list > .item.ink'});
    }, 10);
  };

  $scope.onFormDataChanged = function() {
    if (!$scope.loading && !$scope.saving) {
      $scope.save(true);
    }
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);

  $scope.fileChanged = function(event) {
      UIUtils.loading.show();
      var file = event.target.files[0];
      return $q(function(resolve, reject) {
        UIUtils.image.resizeFile(file, true)
        .then(function(imageData) {
          $scope.avatar = {src: imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          UIUtils.loading.hide(10);
          //$scope.$apply();
          resolve();
        })
        .catch(UIUtils.onError('Failed to resize image'));
      });
    };

  $scope.submitAndSave = function() {
    $scope.form.$submitted=true;
    $scope.save();
  }

  $scope.save = function(silent) {
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

    var showSuccessToast = function() {
      if (!silent) {
        $translate('PROFILE.INFO.PROFILE_SAVED')
        .then(function(message){
          UIUtils.toast.show(message);
        });
      }
    }
    var doFinishSave = function(formData) {
      if (!$scope.existing) {
        esUser.profile.add(formData)
        .then(function() {
          console.log("User profile successfully created.");
          $scope.existing = true;
          $scope.saving = false;
          showSuccessToast();
        })
        .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
      else {
        esUser.profile.update(formData, {id: $rootScope.walletData.pubkey})
        .then(function() {
          console.log("User profile successfully updated.");
          $scope.saving = false;
          showSuccessToast();
        })
        .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
    };

    if ($scope.avatar && $scope.avatar.src) {
      UIUtils.image.resizeSrc($scope.avatar.src, true) // resize to thumbnail
      .then(function(imageSrc) {
        $scope.formData.avatar = UIUtils.image.toAttachment({src: imageSrc});
        doFinishSave($scope.formData);
      });
    }
    else {
      delete $scope.formData.avatar;
      doFinishSave($scope.formData);
    }
  };

  $scope.cancel = function() {
    $ionicHistory.goBack();
  }
}

