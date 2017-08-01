angular.module('cesium.es.profile.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider.state('app.user_edit_profile', {
      cache: false,
      url: "/wallet/profile/edit",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/user/edit_profile.html",
          controller: 'ESViewEditProfileCtrl'
        }
      },
      data: {
        auth: true
      }
    });

  })

 .controller('ESViewEditProfileCtrl', ESViewEditProfileController)

 .controller('ESAvatarModalCtrl', ESAvatarModalController)

;

function ESViewEditProfileController($scope, $rootScope, $q, $timeout, $state, $focus, $translate, $ionicHistory,
                           csConfig, UIUtils, esHttp, esProfile, esGeo, ModalUtils, Device) {
  'ngInject';

  // The default country used for address localisation
  var defaultCountry = csConfig.plugins && csConfig.plugins.es && csConfig.plugins.es.defaultCountry;

  $scope.loading = true;
  $scope.dirty = false;
  $scope.walletData = null;
  $scope.formData = {
    title: null,
    description: null,
    socials: [],
    geoPoint: {}
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
    return esProfile.get(walletData.pubkey, {raw: true})
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

        // removeIf(device)
        $focus('profile-name');
        // endRemoveIf(device)
      })
      .catch(function(err){
        UIUtils.loading.hide(10);
        UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
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

  $scope.save = function(silent, hasWaitDebounce) {
    if(!$scope.form.$valid || !$rootScope.walletData || $scope.saving) {
      return $q.reject();
    }

    if (!hasWaitDebounce) {
      console.debug('[ES] [profile] Waiting debounce end, before saving...');
      return $timeout(function() {
        return $scope.save(silent, true);
      }, 650);
    }

    $scope.saving = true;
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
        $scope.walletData.profile.description = esHttp.util.trustAsHtml(formData.description);
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
        delete formData.position;
      }
      if ($scope.formData.geoPoint && $scope.formData.geoPoint.lat && $scope.formData.geoPoint.lon) {
        $scope.formData.geoPoint.lat =  parseFloat($scope.formData.geoPoint.lat);
        $scope.formData.geoPoint.lon =  parseFloat($scope.formData.geoPoint.lon);
      }
      else{
        $scope.formData.geoPoint = null;
      }

      if (!$scope.existing) {
        return esProfile.add(formData)
          .then(function() {
            console.info("[ES] [profile] successfully created.");
            $scope.existing = true;
            $scope.saving = false;
            $scope.dirty = false;
            updateWallet(formData);
            showSuccessToast();
          })
          .catch(onError('PROFILE.ERROR.SAVE_PROFILE_FAILED'));
      }
      else {
        return esProfile.update(formData, {id: $rootScope.walletData.pubkey})
          .then(function() {
            console.info("[ES] Profile successfully updated.");
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
    return $state.go('app.view_wallet', {refresh: true});
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
      return ModalUtils.show('plugins/es/templates/user/modal_edit_avatar.html','ESAvatarModalCtrl',
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

  $scope.localizeByAddress = function() {

    return UIUtils.loading.show()
      .then($scope.searchPositions)
      .then(function(res) {
        UIUtils.loading.hide();

        if (!res) return; // no result, or city value just changed
        if (res.length == 1) {
          return res[0];
        }

        return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
          {
            categories : res,
            title: 'PROFILE.MODAL_LOCATIONS.TITLE'
          },
          {focusFirstInput: true}
        );
      })
      .then(function(res) {
        if (res && res.lat && res.lon) {
          $scope.formData.geoPoint = $scope.formData.geoPoint || {};
          $scope.formData.geoPoint.lat =  parseFloat(res.lat);
          $scope.formData.geoPoint.lon =  parseFloat(res.lon);
        }
      })
      .catch(UIUtils.onError('PROFILE.ERROR.ADDRESS_LOCATION_FAILED'));
  };

  $scope.searchPositions = function(query) {

    // Build the query
    if (!query) {
      if (!$scope.formData.city) {
        return $q.when(); // nothing to search
      }

      var cityPart = $scope.formData.city.split(',');
      var city = cityPart[0];

      var country = cityPart.length > 1 ? cityPart[1].trim() : defaultCountry;
      var street = $scope.formData.address ? angular.copy($scope.formData.address.trim()) : undefined;
      if (street) {
        // Search with AND without street
        return $q.all([
          $scope.searchPositions({
            street: street,
            city: city,
            country: country
          }),
          $scope.searchPositions({
            city: city,
            country: country
          })
        ])
        .then(function(res){
          return res[0].concat(res[1]);
        });
      }
      else {
        return $scope.searchPositions({
          city: city,
          country: country
        });
      }
    }

    var queryString = (query.street ? query.street + ', ' : '') +
      query.city +
      (query.country ? ', ' + query.country : '');
    // Execute the given query
    return $q.all([
      $translate('PROFILE.MODAL_LOCATIONS.RESULT_DIVIDER', {address: queryString}),
      esGeo.point.searchByAddress(query)
    ])
      .then(function(res) {
        var dividerText = res[0];
        res = res[1];
        if (!res) return $q.when(); // no result

        // Ask user to choose
        var parent = {name: dividerText};
        var hits = res.reduce(function(res, hit){
          if (hit.class == 'waterway') return res;
          return res.concat({
            name: hit.display_name,
            parent: parent,
            lat: hit.lat,
            lon: hit.lon
          });
        }, [parent]);

        if (hits.length == 1) return $q.when(); // no result (after filtering)

        return hits;
      });
  };

  $scope.localizeMe = function() {
    return esGeo.point.current()
      .then(function(position) {
        if (!position || !position.lat || !position.lon) return;
        $scope.formData.geoPoint = $scope.formData.geoPoint || {};
        $scope.formData.geoPoint.lat =  parseFloat(position.lat);
        $scope.formData.geoPoint.lon =  parseFloat(position.lon);
      })
      .catch(UIUtils.onError('PROFILE.ERROR.GEO_LOCATION_FAILED'));
  };

  $scope.removeLocalisation = function() {
    if ($scope.formData.geoPoint) {
      $scope.formData.geoPoint.lat = null;
      $scope.formData.geoPoint.lon = null;
    }
  };

  $scope.onCityChanged = function() {
    if ($scope.loading) return;
    var hasGeoPoint = $scope.formData.geoPoint && $scope.formData.geoPoint.lat && $scope.formData.geoPoint.lon;
    if (!hasGeoPoint) {
      return $scope.localizeByAddress();
    }
  };

}


function ESAvatarModalController($scope) {

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
