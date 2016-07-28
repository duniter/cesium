angular.module('cesium.user.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($menuProvider) {
    'ngInject';
    $menuProvider.addItem({
      text: 'MENU.USER_PROFILE',
      icon: "ion-person",
      section: $menuProvider.sections.USER,
      url: '#/app/user/profile',
      ngIf: "isLogged()"
    });

    $menuProvider.addItem({
      text: 'MENU.USER_PROFILE',
      icon: "ion-person",
      section: $menuProvider.sections.USER,
      ngClick: "login('app.user_profile')",
      ngIf: "!isLogged()"
    });
  })

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

    .state('app.user_profile', {
      url: "/user/profile",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/user/profile.html",
          controller: 'ProfileCtrl'
        }
      }
    })
    ;
  })

 .controller('ProfileCtrl', ProfileController)

;

function ProfileController($scope, UIUtils, $timeout, UserService, $filter) {
  'ngInject';

  $scope.walletData = null;
  $scope.formData = {
    title: null,
    description: null,
    socials: []
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        UserService.profile.get({pubkey: wallet.pubkey})
        .then(function(res) {
          if (res && res.found) {
            // Make to remove duplicate social network entries
            if (res._source && res._source.socials) {
              var map = res._source.socials.reduce(function(res, social) {
                if (social.url && social.url.startsWith('www.')) {
                  social.url = 'http://' + social.url;
                }
                var id = $filter('formatSlug')(social.url);
                res[id] = {
                  type: UserService.util.social.getType(social.url),
                  url: social.url
                };
                return res;
              }, {});
              res._source.socials = _.values(map);
            }
            $scope.updateView(wallet, res._source);
          }
          UIUtils.loading.hide();
        })
        .catch(function(err){
          if (err && err.ucode == 404) {
            $scope.updateView(wallet, {});
            UIUtils.loading.hide();
          }
          else {
            UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
          }
        })
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
    // Set Motion
    $timeout(function() {
      UIUtils.motion.fadeSlideInRight();
      // Set Ink
      UIUtils.ink({selector: '.item.ink'});
    }, 10);
  };

  $scope.doSave = function() {
    $scope.profileForm.$submitted=true;
    if(!$scope.profileForm.$valid || !$scope.walletData) {
      return;
    }
    UIUtils.loading.show();

    $scope.formData.pubkey = $scope.walletData.pubkey;
    UserService.profile.update($scope.formData, {pubkey: $scope.formData.pubkey}, $scope.walletData.keypair)
    .then(function() {
      UIUtils.loading.hide();
    })
    .catch(UIUtils.onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
  };

  $scope.addSocialNetwork = function() {
    if (!$scope.formData.newSocial || $scope.formData.newSocial.trim().length === 0) {
      return;
    }
    if (!$scope.formData.socials) {
      $scope.formData.socials = [];
    }
    var url = $scope.formData.newSocial.trim();

    var exists = _.findWhere($scope.formData.socials, {url: url});
    if (exists) { // duplicate entry
      delete $scope.formData.newSocial;
      return;
    }

    var type = UserService.util.social.getType(url);
    if (!type) {
      UIUtils.alert.error('PROFILE.ERROR.INVALID_SOCIAL_NETWORK_FORMAT');
      return; // stop here
    }
    $scope.formData.socials.push({
      type: type,
      url: url
    });
    delete $scope.formData.newSocial;

    // Set Motion
    $timeout(function() {
      UIUtils.motion.fadeSlideIn({
        selector: '#social-' + $filter('formatSlug')(url)
      });
    }, 0);
  }

  $scope.removeSocialNetwork = function() {

  }
}

