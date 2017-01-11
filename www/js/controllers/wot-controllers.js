angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot?q&newcomers&pendings",
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
        url: "/wallet/cert",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        },
        data: {
          large: 'app.wallet_view_cert_lg'
        }
      })

      .state('app.wallet_view_cert_lg', {
        url: "/wallet/cert/lg",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications_lg.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      .state('app.wot_view_cert', {
        url: "/wot/cert/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        },
        data: {
          large: 'app.wot_view_cert_lg'
        }
      })

      .state('app.wot_view_cert_lg', {
        url: "/wot/cert/lg/:pubkey/:uid",
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

function WotLookupController($scope, BMA, $state, UIUtils, $timeout, csConfig, csSettings, Device, csWallet, csWot, $focus, $ionicPopover) {
  'ngInject';

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    loading: true,
    type: null,
    results: []
  };
  $scope.entered = false;
  $scope.wotSearchTextId = 'wotSearchText';
  $scope.enableFilter = true;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!$scope.entered) {
      if (state.stateParams && state.stateParams.q) { // Query parameter
        $scope.search.text=state.stateParams.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else {
        $timeout(function() {
          // get new comers
          if (!csConfig.initPhase || state.stateParams.newcomers) {
            $scope.doGetNewcomers(0, state.stateParams.newcomers);
          }
          else {
            $scope.doGetPending(0, state.stateParams.pendings);
          }
        }, 100);
      }
      // removeIf(device)
      // Focus on search text (only if NOT device, to avoid keyboard opening)
      $focus($scope.wotSearchTextId);
      // endRemoveIf(device)

      $scope.entered = true;

      $scope.showHelpTip();
    }
  });

  $scope.resetWotSearch = function() {
    $scope.search = {
      text: null,
      loading: false,
      type: 'newcomers',
      results: []
    };
  };

  $scope.doSearch = function() {
    $scope.search.loading = true;
    var text = $scope.search.text.trim();
    if ((UIUtils.screen.isSmall() && text.length < 3) || !text.length) {
      $scope.search.results = [];
      $scope.search.loading = false;
      $scope.search.type = 'none';
    }
    else {
      $scope.search.type = 'text';
      csWot.search(text)
      .then(function(idties){
        if ($scope.search.type != 'text') return; // could have change
        if ($scope.search.text.trim() !== text) return; // search text has changed before received response

        if ((!idties || !idties.length) && BMA.regex.PUBKEY.test(text)) {
          $scope.doDisplayResult([{pubkey: text}]);
        }
        else {
          $scope.doDisplayResult(idties);
        }
      })
      .catch(UIUtils.onError('ERROR.WOT_LOOKUP_FAILED'));
    }
  };

  $scope.doGetNewcomers = function(offset, size) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'newcomers';

    return csWot.newcomers(offset, size)
      .then(function(idties){
        if ($scope.search.type != 'newcomers') return false; // could have change
        $scope.doDisplayResult(idties, offset, size);
        return true;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        UIUtils.onError('ERROR.LOAD_NEWCOMERS_FAILED')(err);
      });
  };

  $scope.doGetPending = function(offset, size) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'pending';

    var searchFunction =  csConfig.initPhase ?
      csWot.all :
      csWot.pending;

    return searchFunction(offset, size)
      .then(function(idties){
        if ($scope.search.type != 'pending') return false; // could have change
        $scope.doDisplayResult(idties, offset, size);
        return true;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        UIUtils.onError('ERROR.LOAD_PENDING_FAILED')(err);
      });
  };

  $scope.showMore = function() {
    var offset = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;
    var searchFunction = ($scope.search.type == 'newcomers') ?
      $scope.doGetNewcomers :
      $scope.doGetPending;

    return searchFunction(offset)
      .then(function(ok) {
        if (ok) {
          $scope.search.loadingMore = false;
          $scope.$broadcast('scroll.infiniteScrollComplete');
        }
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.select = function(identity) {
    // identity = self -> open the user wallet
    if (csWallet.isUserPubkey(identity.pubkey)) {
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

  // Show help tip (show only not already shown)
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    var index = angular.isDefined(index) ? index : csSettings.data.helptip.wot;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startWotTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.wot = endIndex;
        csSettings.store();
      });
  };

  $scope.doDisplayResult = function(res, offset, size) {
    if (!offset) {
      $scope.search.results = res || [];
    }
    else {
        $scope.search.results = $scope.search.results.concat(res);
    }
    $scope.search.loading = false;
    $scope.search.hasMore = $scope.search.results.length >= offset + size;

    $scope.smallscreen = UIUtils.screen.isSmall();

    if (!$scope.search.results.length) return;

    // Set Motion
    if (res.length > 0) {
      $timeout(function () {
        UIUtils.motion.ripple({
          startVelocity: 3000
        });
        // Set Ink
        UIUtils.ink({
          selector: '.item.ink'
        });
      }, 10);
    }
  };

  /* -- show/hide popup -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wot/lookup_popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

}

function WotLookupModalController($scope, BMA, $state, UIUtils, $timeout, csConfig, csSettings, Device, csWallet, csWot, $focus, $ionicPopover){
  'ngInject';

  WotLookupController.call(this, $scope, BMA, $state, UIUtils, $timeout, csConfig, csSettings, Device, csWallet, csWot, $focus, $ionicPopover);

  $scope.search.loading = false;
  $scope.enableFilter = false;

  $scope.wotSearchTextId = 'wotSearchTextModal';
  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.select = function(identity){
    $scope.closeModal({
      pubkey: identity.pubkey,
      uid: identity.uid
    });
  };

  $scope.showHelpTip = function() {
    // silent
  };

  // removeIf(device)
  // Focus on search text (only if NOT device, to avoid keyboard opening)
  $focus($scope.wotSearchTextId);
  // endRemoveIf(device)
}

function WotIdentityViewController($scope, $state, $timeout, UIUtils, csWot) {
  'ngInject';

  $scope.formData = {};
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (state.stateParams &&
      state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) { // load once
        $scope.load(state.stateParams.pubkey.trim(),
                    true /*withCache*/,
                    state.stateParams.uid);
      }
    }
    else {
      // Redirect to app
      $state.go('app.home');
    }
  });

  $scope.load = function(pubkey, withCache, uid) {
    csWot.load(pubkey, withCache, uid)
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
    // Warn: do not use a simple link here (a ng-click is need for help tour)
    $state.go(UIUtils.screen.isSmall() ? 'app.wot_view_cert' : 'app.wot_view_cert_lg', {
      pubkey: $scope.formData.pubkey,
      uid: $scope.formData.name || $scope.formData.uid
    });
  };

  $scope.showSharePopover = function(event) {
    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;
    var url = $state.href('app.wot_view_identity', {pubkey: $scope.formData.pubkey, uid: $scope.formData.uid}, {absolute: true});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'WOT.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        postMessage: title
      }
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
 * @param csSettings
 * @param csWallet
 * @param UIUtils
 * @param csWot
 * @param Modals
 * @constructor
 */
function WotCertificationsViewController($scope, $rootScope, $state, $timeout, $translate, csConfig, csSettings, csWallet, UIUtils, csWot, Modals) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};
  $scope.showCertifications = true; // default value (overwrite when tab switch, on small view)
  $scope.showGivenCertifications = false; // default value (overwrite on 'large' view)
  $scope.showAvatar = false; // default value (overwrite on 'large' view)

  $scope.$on('$ionicView.enter', function(e, state) {
    if (state.stateParams && state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length >  0) {
      if ($scope.loading) {
        $scope.load(state.stateParams.pubkey.trim(), true /*withCache*/);
      }
    }

    // Load from wallet pubkey
    else if (csWallet.isLogin()){
      if ($scope.loading) {
        $scope.load(csWallet.data.pubkey, true /*withCache*/, csWallet.data.uid);
      }
    }

    // Redirect to home
    else {
      $timeout(function() {
        $state.go('app.home', null);
      }, 10);
    }
  });

  $scope.load = function(pubkey, withCache, uid) {
    return csWot.load(pubkey, withCache, uid)
    .then(function(identity){
      $scope.formData = identity;
      $scope.canCertify = $scope.formData.hasSelf && (!csWallet.isLogin() || (!csWallet.isUserPubkey(pubkey)));
      $scope.canSelectAndCertify = $scope.formData.hasSelf && csWallet.isUserPubkey(pubkey);
      $scope.alreadyCertified = !$scope.canCertify || !csWallet.isLogin() ? false :
        (!!_.findWhere(identity.received_cert, { pubkey: csWallet.data.pubkey, valid: true }) ||
         !!_.findWhere(identity.received_cert_pending, { pubkey: csWallet.data.pubkey, valid: true }));

      $scope.loading = false;

      // Effects
      $scope.motionCertifications(100);
      $scope.motionAvatar(300);
      $scope.motionGivenCertifications(900);

      // Show help tip
      var isWallet = csWallet.isUserPubkey(pubkey);
      $scope.showHelpTip(isWallet);
    });
  };

  // Certify the current identity
  $scope.certify = function() {
    $scope.loadWallet()
    .then(function() {
      UIUtils.loading.hide();

      if (!csConfig.initPhase && !$rootScope.walletData.isMember) {
        UIUtils.alert.error($rootScope.walletData.requirements.needSelf ?
          'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY' : 'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY_HAS_SELF');
        return;
      }

      // Check identity not expired
      if ($scope.formData.requirements.expired) {
        UIUtils.alert.error('ERROR.IDENTITY_EXPIRED');
        return;
      }

      // Check not already certified
      var previousCert = _.findWhere($scope.formData.received_cert, { pubkey: csWallet.data.pubkey, valid: true});
      if (previousCert) {
        $translate('ERROR.IDENTITY_ALREADY_CERTIFY', previousCert)
          .then(function(message) {
            UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
          });
        return;
      }

      // Check not pending certification
      previousCert = _.findWhere($scope.formData.received_cert_pending, { pubkey: csWallet.data.pubkey, valid: true});
      if (previousCert) {
        $translate('ERROR.IDENTITY_ALREADY_CERTIFY_PENDING', previousCert)
          .then(function(message) {
            UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
          });
        return;
      }


      UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES')
      .then(function(confirm){
        if (!confirm) {
          return;
        }
        UIUtils.loading.show();
        csWallet.certify($scope.formData.uid,
                    $scope.formData.pubkey,
                    $scope.formData.timestamp,
                    $scope.formData.sig,
                    $scope.formData.isMember,
                    $scope.formData.wasMember)
        .then(function(cert) {
          UIUtils.loading.hide();
          if (cert) {
            cert.uid = csWallet.data.uid;
            cert.pubkey = csWallet.data.pubkey;
            cert.isMember = csWallet.data.isMember;
            UIUtils.alert.info('INFO.CERTIFICATION_DONE');
            $scope.formData.received_cert_pending.unshift(cert);
            $scope.motionCertifications();
          }
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
      .then(function() {
        if (!csConfig.initPhase && !$rootScope.walletData.isMember) {
          UIUtils.alert.error($rootScope.walletData.requirements.needSelf || $rootScope.walletData.requirements.needMembership ?
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
        return csWot.load(idty.pubkey, false /*no cache*/);
      })
      .then(function(identity) {
        if (!identity) return; // cancelled
        UIUtils.loading.hide();
        if (!identity || !identity.hasSelf) {
          UIUtils.alert.error('ERROR.IDENTITY_TO_CERTIFY_HAS_NO_SELF');
          return;
        }

        // Check identity not expired
        if (identity.requirements.expired) {
          UIUtils.alert.error('ERROR.IDENTITY_EXPIRED');
          return;
        }

        // Check not already certified
        var previousCert = _.findWhere(identity.received_cert, { pubkey: csWallet.data.pubkey, valid: true});
        if (previousCert) {
          $translate('ERROR.IDENTITY_ALREADY_CERTIFY', previousCert)
            .then(function(message) {
              UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
            });
          return;
        }

        // Check not pending certification
        previousCert = _.findWhere(identity.received_cert_pending, { pubkey: csWallet.data.pubkey, valid: true});
        if (previousCert) {
          $translate('ERROR.IDENTITY_ALREADY_CERTIFY_PENDING', previousCert)
            .then(function(message) {
              UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
            });
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
            csWallet.certify(identity.uid,
              identity.pubkey,
              identity.timestamp,
              identity.sig,
              identity.isMember,
              identity.wasMember)
              .then(function(cert) {
                UIUtils.loading.hide();
                if (cert) {
                  UIUtils.alert.info('INFO.CERTIFICATION_DONE');
                  $scope.formData.given_cert_pending.unshift(cert);
                  $scope.motionGivenCertifications();
                }
              })
              .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
          });
      })
      .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));

  };

  // Updating wallet data
  $scope.doUpdate = function() {
    $scope.load($scope.formData.pubkey, false /*no cache*/);
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

  // Show help tip
  $scope.showHelpTip = function(isWallet) {
    if (!$scope.isLogin()) return;
    if (!csSettings.data.helptip.enable) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    var index = isWallet ? csSettings.data.helptip.walletCerts : csSettings.data.helptip.wotCerts;
    if (index < 0) return;

    var startFunc = isWallet ?
      helptipScope.startWalletCertTour(index, false) :
      helptipScope.startWotCertTour(index, false);

    return startFunc.then(function(endIndex) {
        helptipScope.$destroy();
        if (isWallet) {
          csSettings.data.helptip.walletCerts = endIndex;
        }
        else {
          csSettings.data.helptip.wotCerts = endIndex;
        }
        csSettings.store();
      });
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



