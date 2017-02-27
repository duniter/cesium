angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot?q&type&hash",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html",
            controller: 'WotLookupCtrl'
          }
        }
      })

      .state('app.wot_identity', {
        url: "/wot/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_identity_uid', {
        url: "/lookup/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_cert', {
        url: "/wot/:pubkey/:uid/:type",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        },
        data: {
          large: 'app.wot_cert_lg'
        }
      })

      .state('app.wot_cert_lg', {
        url: "/wot/cert/lg/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      // wallet cert
      .state('app.wallet_cert', {
        url: "/wallet/cert/:type",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        },
        data: {
          large: 'app.wallet_cert_lg'
        }
      })

      .state('app.wallet_cert_lg', {
        url: "/wallet/cert/lg",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })
      ;
  })

  .controller('WotLookupCtrl', WotLookupController)

  .controller('WotLookupModalCtrl', WotLookupModalController)

  .controller('WotIdentityAbstractCtrl', WotIdentityAbstractController)

  .controller('WotIdentityViewCtrl', WotIdentityViewController)

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)


;

function WotLookupController($scope, $state, $timeout, $focus, $ionicPopover, $ionicHistory,
                             UIUtils, csConfig, csSettings, Device, BMA, csWallet, csWot) {
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
        $scope.search.text = state.stateParams.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else if (state.stateParams && state.stateParams.hash) { // hash tag parameter
        $scope.search.text = '#' + state.stateParams.hash;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else {
        $timeout(function() {
          // get new comers
          if (!csConfig.initPhase || state.stateParams.type == 'newcomers') {
            $scope.doGetNewcomers(0, state.stateParams.newcomers);
          }
          else if (csConfig.initPhase || state.stateParams.type == 'pending') {
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

  $scope.doRefreshLocationHref = function() {

    var stateParams = {
      q: undefined,
      hash: undefined,
      type: undefined
    };

    if ($scope.search.type == 'text') {
      var text = $scope.search.text.trim();
      if (text.match(/^#\w+$/)) {
        stateParams.hash = text.substr(1);
      }
      else {
        stateParams.q = text;
      }
    }
    else {
      stateParams.type = $scope.search.type;
    }

    // Update location href
    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });
    $state.go('app.wot_lookup', stateParams,
      {
        reload: false,
        inherit: true,
        notify: false
      });
  };

  $scope.doSearchText = function() {

    $scope.doSearch();
    $scope.doRefreshLocationHref();
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

    // Update location href
    if (!offset) {
      $scope.doRefreshLocationHref();
    }

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

    // Update location href
    if (!offset) {
      $scope.doRefreshLocationHref();
    }

    return searchFunction(offset, size)
      .then(function(idties){
        if ($scope.search.type != 'pending') return false; // could have change
        $scope.doDisplayResult(idties, offset, size);
        // Always disable "more" on initphase
        $scope.search.hasMore = !csConfig.initPhase && $scope.search.hasMore;
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
      $state.go('app.wot_identity', {
        pubkey: identity.pubkey,
        uid: identity.uid
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

    // Motion
    if (res.length > 0 && $scope.motion) {
      $scope.motion.show({selector: '.lookupForm .item.ink'});
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

function WotLookupModalController($scope, $controller, $focus){
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotLookupCtrl', {$scope: $scope}));

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

  $scope.doRefreshLocationHref = function() {
    // Do NOT change location href
  };

  $scope.showHelpTip = function() {
    // silent
  };

  // removeIf(device)
  // Focus on search text (only if NOT device, to avoid keyboard opening)
  $focus($scope.wotSearchTextId);
  // endRemoveIf(device)
}

/**
 * Abtract controller that load identity, that expose some useful methods in $scope, like 'certify()'
 * @param $scope
 * @param $state
 * @param $timeout
 * @param UIUtils
 * @param Modals
 * @param csConfig
 * @param csWot
 * @param csWallet
 * @constructor
 */
function WotIdentityAbstractController($scope, $rootScope, $state, $translate, UIUtils, Modals, csConfig, csWot, csWallet) {
  'ngInject';

  $scope.formData = {};
  $scope.loading = true;

  $scope.load = function(pubkey, withCache, uid) {
    return csWot.load(pubkey, withCache, uid)
      .then(function(identity){
        if (!identity) return UIUtils.onError('ERROR.IDENTITY_NOT_FOUND')().then($scope.showHome);
        $scope.formData = identity;
        $scope.canCertify = $scope.formData.hasSelf && (!csWallet.isLogin() || (!csWallet.isUserPubkey(pubkey)));
        $scope.canSelectAndCertify = $scope.formData.hasSelf && csWallet.isUserPubkey(pubkey);
        $scope.alreadyCertified = !$scope.canCertify || !csWallet.isLogin() ? false :
          (!!_.findWhere(identity.received_cert, { pubkey: csWallet.data.pubkey, valid: true }) ||
          !!_.findWhere(identity.received_cert_pending, { pubkey: csWallet.data.pubkey, valid: true }));
        $scope.loading = false;
      })
      .catch(function(err) {
        $scope.loading = false;
        UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
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
                  $scope.prepareNewCert(cert);
                  $scope.alreadyCertified = true;
                  UIUtils.alert.info('INFO.CERTIFICATION_DONE');
                  $scope.formData.received_cert_pending.unshift(cert);
                  $scope.doMotion();
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
                if (!cert) return;
                return csWot.extendAll([cert], 'pubkey')
                  .then(function(){
                    UIUtils.toast.show('INFO.CERTIFICATION_DONE');
                    $scope.formData.given_cert_pending.unshift(cert);
                    $scope.doMotion();
                  });
              })
              .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
          });
      })
      .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));

  };

  // Add wallet's data to a new cert
  $scope.prepareNewCert = function(cert) {
    cert.uid = csWallet.data.uid;
    cert.pubkey = csWallet.data.pubkey;
    cert.isMember = csWallet.data.isMember;
    cert.avatar = csWallet.data.avatar;
    cert.name = csWallet.data.name;
  };

  /* -- open screens -- */

  $scope.showCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if (UIUtils.screen.isSmall() ) {
      $state.go('app.wot_cert', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        type: 'received'
      });
    }
    else {
      $state.go('app.wot_cert_lg', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid
      });
    }
  };

  $scope.showGivenCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if (UIUtils.screen.isSmall() ) {
      $state.go('app.wot_cert', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        type: 'given'
      });
    }
    else {
      $state.go('app.wot_cert_lg', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid
      });
    }
  };

  $scope.showSharePopover = function(event) {
    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;
    var url = $state.href('app.wot_identity', {pubkey: $scope.formData.pubkey, uid: $scope.formData.uid}, {absolute: true});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'WOT.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        postMessage: title
      }
    });
  };
}

/**
 * Identity view controller - should extend WotIdentityAbstractCtrl
 */
function WotIdentityViewController($scope, $rootScope, $controller, UIUtils, csWallet) {
  'ngInject';
  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', {$scope: $scope}));

  $scope.motion = UIUtils.motion.fadeSlideInRight;

  $scope.$on('$ionicView.enter', function(e, state) {

    if (state.stateParams &&
      state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) { // load once
        return $scope.load(state.stateParams.pubkey.trim(), true /*withCache*/, state.stateParams.uid)
          .then($scope.doMotion);
      }
    }

    else if (state.stateParams &&
      state.stateParams.uid &&
      state.stateParams.uid.trim().length > 0) {
      if ($scope.loading) { // load once
        return $scope.load(null, true /*withCache*/, state.stateParams.uid)
          .then($scope.doMotion);
      }
    }

    // Load from wallet pubkey
    else if (csWallet.isLogin()){

      if ($scope.loading) {
        return $scope.load(csWallet.data.pubkey, true /*withCache*/, csWallet.data.uid)
          .then($scope.doMotion);
      }
    }

    // Redirect to home
    else {
      $scope.showHome();
    }
  });

  $scope.doMotion = function() {
    $scope.motion.show({selector: '.view-identity .list .item'});

    // Transfer button
    $scope.showFab('fab-transfer');

    // Certify button
    if (($scope.canCertify && !$scope.alreadyCertified) || $rootScope.tour) {
      $scope.showFab('fab-certify-' + $scope.formData.uid);
    }
  };
}

/**
 * Certifications controller - extend WotIdentityAbstractCtrl
 */
function WotCertificationsViewController($scope, $rootScope, $controller, csSettings, csWallet, UIUtils) {
  'ngInject';
// Initialize the super class and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', {$scope: $scope}));

  // Values overwritten in tab controller (for small screen)
  $scope.motions = {
    receivedCertifications: angular.copy(UIUtils.motion.fadeSlideIn),
    givenCertifications: angular.copy(UIUtils.motion.fadeSlideInRight),
    avatar: angular.copy(UIUtils.motion.fadeIn),
  };
  $scope.motions.receivedCertifications.enable = true;
  $scope.motions.givenCertifications.enable = true;
  $scope.motions.avatar.enable = true;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (state.stateParams && state.stateParams.type) {
      $scope.motions.receivedCertifications.enable = (state.stateParams.type != 'given');
      $scope.motions.givenCertifications.enable = (state.stateParams.type == 'given');
      $scope.motions.avatar.enable = false;
    }

    if (state.stateParams &&
      state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length > 0) {

      if ($scope.loading) { // load once
        return $scope.load(state.stateParams.pubkey.trim(), true /*withCache*/, state.stateParams.uid)
          .then(function() {
            $scope.doMotion();
            $scope.showHelpTip();
          });
      }
      else {
        $scope.doMotion();
      }
    }

    // Load from wallet pubkey
    else if (csWallet.isLogin()){
      if ($scope.loading) {
        return $scope.load(csWallet.data.pubkey, true /*withCache*/, csWallet.data.uid)
          .then(function() {
            $scope.doMotion();
            $scope.showHelpTip();
          });
      }
      else {
        $scope.doMotion();
      }
    }

    // Redirect to home
    else {
      $scope.showHome();
    }
  });

  $scope.$on('$ionicView.leave', function() {
    $scope.loading = true;
  });

  // Updating data
  $scope.doUpdate = function() {
    return $scope.load($scope.formData.pubkey, false /*no cache*/, $scope.formData.uid)
      .then(function() {
        $scope.doMotion();
        $scope.showHelpTip();
      });
  };

  $scope.doMotion = function(skipItems) {
    // Motions received certifications part
    $scope.doMotionReceivedCertifications(0, skipItems);

    // Motion on avatar part
    if ($scope.motions.avatar.enable) {
      $scope.motions.avatar.show({selector: '.col-avatar .' + $scope.motions.avatar.ionListClass});
    }

    // Motion on given certification part
    $scope.doMotionGivenCertifications($scope.motions.receivedCertifications.enable ? 100 : 10, skipItems);
  };

  // Effects on received certifcations
  $scope.doMotionReceivedCertifications = function(timeout, skipItems) {
    if ($scope.motions.receivedCertifications.enable) {
      if (!skipItems) {
        $scope.motions.receivedCertifications.show({selector: '.list.certifications .item', timeout: timeout});
      }

      // Fab button
      if (($scope.canCertify && !$scope.alreadyCertified) || $rootScope.tour) {
        $scope.showFab('fab-certify', timeout);
      }
    }
    // If not enable, make sure to hide fab button
    else {
      // Hide fab button
      if ($scope.canCertify || $rootScope.tour) {
        $scope.hideFab('fab-certify', 0);
      }
    }
  };

  // Effects on given certifcations
  $scope.doMotionGivenCertifications = function(timeout, skipItems) {

    if ($scope.motions.givenCertifications.enable) {
      if (!skipItems) {
        $scope.motions.givenCertifications.show({selector: '.list.given-certifications .item', timeout: timeout});
      }
      // Fab button
      if ($scope.canSelectAndCertify || $rootScope.tour) {
        $scope.showFab('fab-select-certify');
      }
    }

    // If not enable, make sure to hide fab button
    else {
      // Hide fab button
      if ($scope.canSelectAndCertify || $rootScope.tour) {
        $scope.hideFab('fab-select-certify', 0);
      }
    }
  };

  // Show help tip
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    if (!csSettings.data.helptip.enable) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    var isWallet = csWallet.isUserPubkey($scope.formData.pubkey);
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
}


