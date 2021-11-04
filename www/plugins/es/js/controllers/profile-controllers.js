angular.module('cesium.es.profile.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider
      .state('app.edit_profile', {
        url: "/wallet/profile/edit",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/user/edit_profile.html",
            controller: 'ESViewEditProfileCtrl'
          }
        },
        cache: false,
        data: {
          auth: true
        }
      })

      .state('app.edit_profile_by_id', {
        url: "/wallets/:id/profile/edit",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/user/edit_profile.html",
            controller: 'ESViewEditProfileCtrl'
          }
        },
        cache: false,
        data: {
          login: true
        }
      });

  })

 .controller('ESViewEditProfileCtrl', ESViewEditProfileController)


;

function ESViewEditProfileController($scope, $q, $timeout, $state, $focus, $translate, $controller,
                                     $ionicHistory, $ionicPopover,
                                     UIUtils, csWallet, esHttp, esProfile, ModalUtils, Device) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESPositionEditCtrl', {$scope: $scope}));

  $scope.formData = {
    title: null,
    description: null,
    socials: [],
    geoPoint: null
  };
  $scope.loading = true;
  $scope.dirty = false;
  $scope.walletData = null;
  $scope.avatar = null;
  $scope.existing = false;
  $scope.socialData = {
    url: null
  };
  $scope.socialReorder = true;

  var wallet;

  $scope.enter = function(e, state) {

    wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
    if (!wallet) {
      UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
      return $scope.showHome();
    }

    $scope.walletId = wallet.id;

    return wallet.auth({
        minData: true
      })
      .then($scope.load)
      .catch(function(err){
        if (err === 'CANCELLED') {
          UIUtils.loading.hide(10);
          $scope.cancel();
          return;
        }
        UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
      });
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if (!$scope.dirty || $scope.saving || event.defaultPrevented) return;

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
            $scope.form.$submitted=true;
            return $scope.save(false/*silent*/, true/*haswait debounce*/)
              .then(function(saved){
                if (saved) {
                  $scope.dirty = false;
                }
                return saved; // change state only if not error
              });
          }
          else {
            $scope.dirty = false;
            return true; // ok, change state
          }
        })
        .then(function(confirmGo) {
          if (confirmGo) {
            // continue to the order state
            $ionicHistory.nextViewOptions({
              historyRoot: true
            });
            $state.go(next.name, nextParams);
          }
        })
        .catch(function(err) {
          // Silent
        });
    }
  });

  $scope.load = function(walletData) {
    $scope.loading = true; // to avoid the call of doSave()
    return esProfile.get(walletData.pubkey, {
        raw: true
      })
      .then(function(profile) {
        if (profile) {
          $scope.avatar = esHttp.image.fromAttachment(profile.source.avatar);
          $scope.existing = true;
          $scope.updateView(walletData, profile.source);
        }
        else {
          $scope.avatar = undefined;
          $scope.existing = false;
          $scope.updateView(walletData, {});
        }

        UIUtils.loading.hide();

        // Update loading - done with a delay, to avoid trigger onFormDataChanged()
        return $timeout(function() {
          $scope.loading = false;
        }, 1000);
      })
      .then(function() {
        // removeIf(device)
        $focus('profile-name');
        // endRemoveIf(device)
      })
      .catch(UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED'));
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.updateView = function(walletData, profile) {
    $scope.walletData = walletData;
    $scope.formData = profile;
    if (profile.avatar) {
      $scope.avatarStyle={'background-image':'url("'+$scope.avatar.src+'")'};
    }
    $scope.motion.show();
  };

  $scope.onFormDataChanged = function() {
    if ($scope.loading) return;
    $scope.dirty = true;
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);

  $scope.save = function(silent, hasWaitDebounce) {
    if($scope.form.$invalid || !$scope.walletData || ($scope.saving && !hasWaitDebounce)) {
      return $q.reject();
    }

    if (!hasWaitDebounce) {
      console.debug('[ES] [profile] Waiting debounce end, before saving...');
      $scope.saving = true;
      return $timeout(function() {
        return $scope.save(silent, true);
      }, 650);
    }

    console.debug('[ES] [profile] Saving user profile...');

    // removeIf(no-device)
    if (!silent) {
      UIUtils.loading.show();
    }
    // endRemoveIf(no-device)

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
        $scope.walletData.profile.descriptionHtml = esHttp.util.parseAsHtml(formData.description);
      }
    };

    var showSuccessToast = function() {
      if (!silent) {
        // removeIf(no-device)
        UIUtils.loading.hide();
        // endRemoveIf(no-device)

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

      // Workaround for old data
      if (formData.position) {
        formData.position = null;
      }

      // Make sure to convert lat/lon to float
      if (formData.geoPoint && formData.geoPoint.lat && formData.geoPoint.lon) {
        formData.geoPoint.lat =  parseFloat(formData.geoPoint.lat);
        formData.geoPoint.lon =  parseFloat(formData.geoPoint.lon);
      }
      else{
        formData.geoPoint = null; // force to null, need by ES update request
      }

      if (!$scope.existing) {
        return esProfile.add(formData, {wallet: wallet})
          .then(function() {
            console.info("[ES] [profile] Successfully created.");
            $scope.existing = true;
            $scope.saving = false;
            $scope.dirty = false;
            updateWallet(formData);
            showSuccessToast();
            return true;
          })
          .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
      else {
        return esProfile.update(formData, {id: $scope.walletData.pubkey, wallet: wallet})
          .then(function() {
            console.info("[ES] Profile successfully updated.");
            $scope.saving = false;
            $scope.dirty = false;
            updateWallet(formData);
            showSuccessToast();
            return true;
          })
          .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
    }; // end of doFinishSave

    if ($scope.avatar && $scope.avatar.src) {
      return UIUtils.image.resizeSrc($scope.avatar.src, true) // resize to thumbnail
        .then(function(imageSrc) {
          $scope.formData.avatar = esHttp.image.toAttachment({src: imageSrc});
          return doFinishSave($scope.formData);
        });
    }
    else {
      delete $scope.formData.avatar;
      return doFinishSave($scope.formData);
    }
  };

  $scope.saveAndClose = function() {
    return $scope.save()
      .then(function(saved) {
        if (saved) $scope.close();
      });
  };

  $scope.submitAndSaveAndClose = function() {
    $scope.form.$submitted=true;
    $scope.saveAndClose();
  };

  $scope.cancel = function() {
    $scope.dirty = false; // force not saved
    if (wallet.isDefault()) {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      return $state.go('app.view_wallet');
    }
    else {
      return $state.go('app.view_wallet_by_id', {id: wallet.id});
    }
  };

  $scope.close = function() {
    if (wallet.isDefault()) {
      $ionicHistory.nextViewOptions({
        historyRoot: true
      });
      return $state.go('app.view_wallet', {refresh: true});
    }
    else {
      return $state.go('app.view_wallet_by_id', {refresh: true, id: wallet.id});
    }
  };

  $scope.showAvatarModal = function() {
    if (Device.camera.enable) {
      return Device.camera.getPicture()
        .then(function(imageData) {
          if (!imageData) return;
          $scope.avatar = {src: "data:image/png;base64," + imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          $scope.dirty = true;
        })
        .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
    }
    else {
      return ModalUtils.show('plugins/es/templates/common/modal_edit_avatar.html','ESAvatarModalCtrl',
        {})
        .then(function(imageData) {
          if (!imageData) return;
          $scope.avatar = {src: imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          $scope.dirty = true;
        });
    }
  };

  $scope.rotateAvatar = function(){
    if (!$scope.avatar || !$scope.avatar.src || $scope.rotating) return;

    $scope.rotating = true;

    return UIUtils.image.rotateSrc($scope.avatar.src)
      .then(function(imageData){
        $scope.avatar.src = imageData;
        $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
        $scope.dirty = true;
        $scope.rotating = false;
      })
      .catch(function(err) {
        console.error(err);
        $scope.rotating = false;
      });
  };

  $scope.removeProfile = function(){
    // Hide popover if need
    $scope.hideActionsPopover();

    return $scope.existing && wallet.auth({minData: true})
        .then(function(walletData) {

          UIUtils.loading.hide();
          UIUtils.alert.confirm('PROFILE.CONFIRM.DELETE', undefined, {okText: 'COMMON.BTN_DELETE'})
            .then(function(confirm) {
              if (confirm){

                console.debug('[ES] [profile] Deleting user profile...');
                // removeIf(no-device)
                UIUtils.loading.show();
                // endRemoveIf(no-device)
                return esProfile.remove(walletData.pubkey, {wallet: wallet})
                  .then(function () {
                    if (wallet.isDefault()) {
                      walletData.name=null; // keep local name, on children wallets
                    }
                    walletData.profile = null;
                    walletData.avatar = null;
                    console.debug('[ES] [profile] Successfully deleted');
                    $scope.dirty = false;
                    return $scope.close();
                  })
                  .then(function() {
                    return $timeout(function() {
                      UIUtils.toast.show('PROFILE.INFO.PROFILE_REMOVED');
                    }, 750);
                  })
                  .catch(UIUtils.onError('PROFILE.ERROR.REMOVE_PROFILE_FAILED'));
              }
            });
        });
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/es/templates/user/edit_popover_actions.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
  };
}


