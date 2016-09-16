angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot?q&newcomers",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html",
            controller: 'WotLookupCtrl'
          }
        }
      })

      .state('app.wot_view_identity', {
        url: "/wot/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wallet_view_cert', {
        url: "/wallet/cert/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      .state('app.wallet_view_cert_lg', {
        url: "/wallet/cert/lg/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications_lg.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      .state('app.wot_view_cert', {
        url: "/wot/cert/:pubkey/:uid",
        nativeTransitions: {
          "type": "flip",
          "direction": "right"
        },
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      .state('app.wot_view_cert_lg', {
        url: "/wot/cert/lg/:pubkey/:uid",
        nativeTransitions: {
          "type": "flip",
          "direction": "right"
        },
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications_lg.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })
      ;
  })

  .controller('WotLookupCtrl', WotLookupController)

  .controller('WotLookupModalCtrl', WotLookupModalController)

  .controller('WotIdentityViewCtrl', WotIdentityViewController)

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)

;

function WotLookupController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $focus) {
  'ngInject';

  $scope.search = {
    text: '',
    looking: false,
    newIncomers: true,
    results: []
  };
  $scope.entered = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered) {
      if ($state.stateParams && $state.stateParams.q) { // Query parameter
        $scope.search.text=$state.stateParams.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else { // get new comers
        $timeout(function() {
          $scope.doGetNewcomers($state.stateParams.newcomers);
        }, 100);
      }
      $scope.entered = true;
    }
    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    $focus('wotSearchText');
    // endRemoveIf(device)
  });

  $scope.doSearch = function() {
    $scope.search.looking = true;
    $scope.search.newIncomers = false;
    var text = $scope.search.text.trim();
    if (text.length < 3) {
      $scope.search.results = [];
      $scope.search.looking = false;
    }
    else {
      WotService.search(text)
      .then(function(idties){
        if ($scope.search.text.trim() !== text) return; // search text has changed before received response

        if (!idties || !idties.length) {
          $scope.search.results = BMA.regex.PUBKEY.test(text) ? [{pubkey: text}] : [];
        }
        else {
          $scope.search.results = idties;
        }

        $scope.search.looking = false;

        if ($scope.search.results.length > 0) {
          // Set Motion
          $timeout(function() {
            UIUtils.motion.ripple({
              startVelocity: 3000
            });
            // Set Ink
            UIUtils.ink({
              selector: '.item.ink'
            });
          }, 10);
        }

      })
      .catch(UIUtils.onError('ERROR.WOT_LOOKUP_FAILED'));
    }
  };

  $scope.resetWotSearch = function() {
    $scope.search = {
      text: null,
      looking: false,
      newIncomers: true,
      results: []
    };
  };

  $scope.doGetNewcomers= function(size) {
    $scope.search.looking = true;
    $scope.search.newIncomers = true;

    size = (size && size > 0) ? size : 10;

    WotService.newcomers(size)
      .then(function(idties){
        if (!$scope.search.newIncomers) return; // could have change
        $scope.search.results = idties || [];
        $scope.search.looking = false;

        if ($scope.search.results.length > 0) {
          // Set Motion
          $timeout(function() {
            UIUtils.motion.ripple({
              startVelocity: 3000
            });
            // Set Ink
            UIUtils.ink({
              selector: '.item.ink'
            });
          }, 10);
        }
      });
  };

  $scope.select = function(identity) {
    // identity = self -> open the user wallet
    if (Wallet.isUserPubkey(identity.pubkey)) {
      $state.go('app.view_wallet');
    }
    // Open identity view
    else {
      $state.go('app.wot_view_identity', {
        pubkey: identity.pubkey,
        uid: identity.name||identity.uid
      });
    }
  };

  $scope.scanQrCode = function(){
    if (!Device.enable) {
      return;
    }
    Device.camera.scan()
    .then(function(result) {
      if (!result) {
        return;
      }
      BMA.uri.parse(result)
      .then(function(obj){
        if (obj.pubkey) {
          $scope.search.text = obj.pubkey;
        }
        else if (result.uid) {
          $scope.search.text = obj.uid;
        }
        else {
          $scope.search.text = result;
        }
        $scope.doSearch();
      });
    })
    .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };
}

function WotLookupModalController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $filter){
  'ngInject';

  WotLookupController.call(this, $scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $filter);

  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.select = function(identity){
    $scope.closeModal({
      pubkey: identity.pubkey,
      uid: identity.uid
    });
  };

}

function WotIdentityViewController($scope, $state, screenmatch, $timeout, UIUtils, Device, WotService) {
  'ngInject';

  $scope.formData = {};
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams &&
        $state.stateParams.pubkey &&
        $state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) {
        $scope.load(
          $state.stateParams.pubkey.trim(),
          $state.stateParams.uid ? $state.stateParams.uid.trim() : null
        );
      }
    }
    else {
      // Redirect to home
      $state.go('app.home');
    }
  });

  $scope.load = function(pubkey) {
    WotService.load(pubkey)
    .then(function(identity){
      $scope.formData = identity;
      $scope.loading = false;
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight();
        UIUtils.ink();
      }, 10);
    })
    .catch(function(err) {
      $scope.loading = false;
      UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
    });
  };

  $scope.showCertifications = function() {
    $state.go(screenmatch.is('sm, xs') ? 'app.wot_view_cert' : 'app.wot_view_cert_lg', {
      pubkey: $scope.formData.pubkey,
      uid: $scope.formData.name || $scope.formData.uid
    });
  };

  $scope.showFab('fab-transfer');

}

/**
 * Certifications controller
 *
 * @param $scope
 * @param $timeout
 * @param $translate
 * @param Wallet
 * @param UIUtils
 * @param WotService
 * @param Modals
 * @constructor
 */
function WotCertificationsViewController($scope, $timeout, $translate, Wallet, UIUtils, WotService, Modals) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};
  $scope.showCertifications = true; // default value (overwrite when tab switch, on small view)
  $scope.showGivenCertifications = false; // default value (overwrite on 'large' view)
  $scope.showAvatar = false; // default value (overwrite on 'large' view)

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.pubkey &&
        $state.stateParams.pubkey.trim().length >  0) {
      if ($scope.loading) {
        $scope.load($state.stateParams.pubkey.trim());
      }
    }
    // Redirect o home
    else {
      $timeout(function() {
        $state.go('app.home', null);
      }, 10);
    }
  });

  $scope.load = function(pubkey) {
    WotService.load(pubkey)
    .then(function(identity){
      $scope.formData = identity;
      $scope.canCertify = $scope.formData.hasSelf && (!Wallet.isLogin() || (!Wallet.isUserPubkey(pubkey)));
      $scope.canSelectAndCertify = $scope.formData.hasSelf && Wallet.isUserPubkey(pubkey);
      $scope.alreadyCertified = $scope.canCertify ? !!_.findWhere(identity.certifications, { uid: Wallet.data.uid, valid: true }) : false;

      $scope.loading = false;

      // Effects
      $scope.motionCertifications(100);
      $scope.motionAvatar(300);
      $scope.motionGivenCertifications(900);
    });
  };

  // Certify the current identity
  $scope.certify = function() {
    $scope.loadWallet()
    .then(function(walletData) {
      if (!walletData.isMember) {
        UIUtils.alert.error(walletData.requirements.needSelf ?
          'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY' : 'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY_HAS_SELF');
        return;
      }
      UIUtils.loading.hide();
      UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES')
      .then(function(confirm){
        if (!confirm) {
          return;
        }
        UIUtils.loading.show();
        Wallet.certify($scope.formData.uid,
                    $scope.formData.pubkey,
                    $scope.formData.timestamp,
                    $scope.formData.sig)
        .then(function() {
          UIUtils.loading.hide();
          UIUtils.alert.info('INFO.CERTIFICATION_DONE');
        })
        .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
      });
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

  // Select an identity and certify
  $scope.selectAndCertify = function() {
    $scope.loadWallet()
      .catch(UIUtils.onError('ERROR.LOGIN_FAILED'))
      .then(function(walletData) {
        if (!walletData.isMember) {
          UIUtils.alert.error(walletData.requirements.needSelf ?
            'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY' : 'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY_HAS_SELF');
          return;
        }
        UIUtils.loading.hide();
        // Open Wot lookup modal
        return Modals.showWotLookup();
      })
      .then(function(idty) {
        if (!idty || !idty.pubkey) {
          return; // cancelled
        }
        if (!idty.uid) { // not a member
          UIUtils.alert.error('ERROR.IDENTITY_TO_CERTIFY_HAS_NO_SELF');
          return;
        }

        UIUtils.loading.show();
        // load selected identity
        return WotService.load(idty.pubkey);
      })
      .then(function(identity) {
        if (!identity) return; // cancelled
        UIUtils.loading.hide();
        if (!identity || !identity.hasSelf) {
          UIUtils.alert.error('ERROR.IDENTITY_TO_CERTIFY_HAS_NO_SELF');
          return;
        }

        // Ask confirmation
        $translate('CONFIRM.CERTIFY_RULES_TITLE_UID', {uid: identity.uid})
          .then(function(confirmTitle) {
            return UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES', confirmTitle);
          })
          .then(function(confirm){
            if (!confirm) {
              return;
            }
            UIUtils.loading.show();

            // Send certification
            Wallet.certify(identity.uid,
              identity.pubkey,
              identity.timestamp,
              identity.sig)
              .then(function() {
                UIUtils.loading.hide();
                UIUtils.alert.info('INFO.CERTIFICATION_DONE');
              })
              .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
          });
      })
      .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));

  };

  // Updating wallet data
  $scope.doUpdate = function() {
    $scope.load($scope.formData.pubkey);
  };


  // Show received certifcations
  $scope.setShowCertifications = function(show) {
    $scope.showCertifications = show;
    $scope.motionCertifications();
  };

  // Show given certifcations
  $scope.setShowGivenCertifications = function(show) {
    $scope.showGivenCertifications = show;
    $scope.motionGivenCertifications();
  };

  // Show avatar
  $scope.setShowAvatar = function(show) {
    $scope.showAvatar = show;
    $scope.motionCertifications();
  };

  // Show received certifcations (animation need in tabs)
  $scope.motionCertifications = function(timeout) {
    if ($scope.showCertifications) {
      // Effects
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight({selector: '.list.certifications .item'});
        UIUtils.ink({selector: '.list.certifications .ink'});
      }, timeout || 10);
      if ($scope.canCertify) {
        $scope.showFab('fab-certify');
      }
    }
    else {
      if ($scope.canCertify) {
        $scope.hideFab('fab-certify', 0);
      }
    }
  };

  // Show given certifcations (animation need in tabs)
  $scope.motionGivenCertifications = function(timeout) {
    if ($scope.showGivenCertifications) {
      // Effects
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight({selector: '.list.given-certifications .item'});
        UIUtils.ink({selector: '.list.given-certifications .ink'});
      }, timeout || 10);
      if ($scope.canSelectAndCertify) {
        $scope.showFab('fab-select-certify');
      }
    }
    else {
      if ($scope.canSelectAndCertify) {
        $scope.hideFab('fab-select-certify', 0);
      }
    }
  };

  $scope.motionAvatar = function(timeout) {
    if ($scope.showAvatar) {
      // Effects
      $timeout(function () {
        UIUtils.motion.toggleOn({selector: '.col-avatar .motion'});
      }, timeout || 900);
    }
  };

  $scope.initLargeView = function() {
    $scope.showCertifications = true;
    $scope.showGivenCertifications = true;
    $scope.showAvatar = true;
  };
}



