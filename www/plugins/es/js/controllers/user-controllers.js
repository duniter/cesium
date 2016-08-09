angular.module('cesium.user.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($menuProvider, $stateProvider, $urlRouterProvider) {
    'ngInject';
    $menuProvider.addItem({
      text: 'MENU.USER_PROFILE',
      icon: "ion-person",
      section: $menuProvider.sections.USER,
      url: '#/app/user/profile/edit',
      ngIf: "isLogin()"
    });

    $menuProvider.addItem({
      text: 'MENU.USER_PROFILE',
      icon: "ion-person",
      section: $menuProvider.sections.USER,
      ngClick: "login('app.user_edit_profile')",
      ngIf: "!isLogin()"
    });

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

function ProfileController($scope, $rootScope, UIUtils, $timeout, UserService, $filter, $focus, $q, SocialUtils) {
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
        UserService.profile.get({id: walletData.pubkey})
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
          //if (err && err.ucode == 404) {
            $scope.updateView(walletData, {});
            UIUtils.loading.hide();
            $scope.loading = false;
            $scope.existing = false;
          /*}
          else {
            UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
          }*/
        });
      });

      $timeout(function () {
        var header = document.getElementById('profile-header');
        header.classList.toggle('on', true);
      }, 100);
  });

  $scope.setProfileForm = function(profileForm) {
    $scope.profileForm = profileForm;
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
      //UIUtils.ink({selector: '.item.ink'});
    }, 10);
  };

  $scope.onFormDataChanged = function() {
    if (!$scope.loading && !$scope.saving) {
      $scope.doSave();
    }
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);

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
        selector: '#social-' + $filter('formatSlug')(url)
      });
    }, 0);
  };

  $scope.editSocialNetwork = function(index) {
    var social = $scope.formData.socials[index];
    $scope.formData.socials.splice(index, 1);
    $scope.socialData.url = social.url;
    $focus('socialUrl');
  };

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

  $scope.doSave = function() {
    $scope.profileForm.$submitted=true;
    if(!$scope.profileForm.$valid || !$rootScope.walletData) {
      return;
    }

    $scope.saving = true;

    var onError = function(message) {
      return function(err) {
        $scope.saving = false;
        UIUtils.onError(message)(err);
      };
    };

    var doFinishSave = function(formData) {
      if (!$scope.existing) {
        UserService.profile.add(formData)
        .then(function() {
          console.log("User profile successfully created.");
          $scope.existing = true;
          $scope.saving = false;
        })
        .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
      else {
        UserService.profile.update(formData, {id: $rootScope.walletData.pubkey})
        .then(function() {
          console.log("User profile successfully updated.");
          $scope.saving = false;
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
}

