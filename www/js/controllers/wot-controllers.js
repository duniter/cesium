angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot",
        abstract: true,
        enableBack: false, // Workaround need for navigation outside tabs (enableBack is forced to 'true' in ViewXXXCtrl)
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html"
          }
        }
      })

      .state('app.wot_lookup.tab_search', {
        url: "/search?q&type&hash",
        views: {
          'tab': {
            templateUrl: "templates/wot/tabs/tab_lookup.html",
            controller: 'WotLookupCtrl'
          }
        },
        data: {
          silentLocationChange: true,
          large: 'app.wot_lookup_lg'
        }
      })

      .state('app.wot_lookup_lg', {
        url: "/wot/lg?q&type&hash",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup_lg.html",
            controller: 'WotLookupCtrl'
          }
        },
        data: {
          silentLocationChange: true
        }
      })

      .state('app.wot_identity', {
        url: "/wot/:pubkey/:uid?action&block&amount&comment",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_identity_uid', {
        url: "/lookup/:uid?action",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_identity_tx_uid', {
        url: "/wot/tx/:pubkey/:uid?action",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity_tx.html",
            controller: 'WotIdentityTxViewCtrl'
          }
        }
      })

      .state('app.wot_cert', {
        url: "/wot/:pubkey/:uid/:type?block",
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
        url: "/wot/cert/lg/:pubkey/:uid?block",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      // wallet cert
      .state('app.wallet_cert', {
        url: "/account/cert/:type",
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
        url: "/account/cert/lg",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })

      // wallet cert
      .state('app.wallet_cert_by_id', {
        url: "/wallets/:id/cert/:type",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        },
        data: {
          large: 'app.wallet_cert_lg_by_id'
        }
      })

      .state('app.wallet_cert_lg_by_id', {
        url: "/wallets/:id/cert/lg",
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

  .controller('WotIdentityTxViewCtrl', WotIdentityTxViewController)

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)

  .controller('WotSelectPubkeyIdentityModalCtrl', WotSelectPubkeyIdentityModalController)

;

function WotLookupController($scope, $state, $q, $timeout, $focus, $location, $ionicPopover, $ionicHistory,
                             UIUtils, csConfig, csCurrency, csSettings, Device, BMA, csWallet, csWot, csCrypto) {
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
  $scope.enableWallets = false;
  $scope.allowMultiple = false;
  $scope.selection = [];
  $scope.showResultLabel = true;
  $scope.parameters = {}; // override in the modal controller

  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      var params = angular.merge({}, $scope.parameters, state && state.stateParams);
      if (params && params.q) { // Query parameter
        $scope.search.text = params.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else if (params && params.hash) { // hash tag parameter
        $scope.search.text = '#' + params.hash;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else {
        $timeout(function() {
          // Init phase
          if (csCurrency.data.initPhase && !params.type) {
            $scope.doGetPending(0, undefined, true/*skipLocationUpdate*/);
          }
          // get new comers
          else if (params.type === 'newcomers' || (!csConfig.initPhase && !params.type)) {
            $scope.doGetNewcomers(0, undefined, true/*skipLocationUpdate*/);
          }
          else if (params.type === 'pending') {
            $scope.doGetPending(0, undefined, true/*skipLocationUpdate*/);
          }
          else if (params.type === 'wallets') {
            $scope.doGetWallets(0, undefined, true/*skipLocationUpdate*/);
          }

        }, 100);
      }
      // removeIf(device)
      // Focus on search text (only if NOT device, to avoid keyboard opening)
      $focus($scope.wotSearchTextId);
      // endRemoveIf(device)

      $scope.entered = true;

      $timeout(UIUtils.ink, 100);

      $scope.showHelpTip();
    }
    else {

      $scope.updateLocationHref();
      if ($scope.search.results && $scope.search.results.length) {
        $scope.motion.show({selector: '.lookupForm .list .item', ink: true});
      }
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.resetWotSearch = function() {
    $scope.search = {
      text: null,
      loading: false,
      type: 'newcomers',
      results: []
    };
  };

  $scope.updateLocationHref = function() {
    // removeIf(device)
    var stateParams = {
      q: undefined,
      hash: undefined,
      type: undefined
    };

    if ($scope.search.type === 'text') {
      var text = $scope.search.text.trim();
      if (text.match(/^#[\wḡĞǦğàáâãäåçèéêëìíîïðòóôõöùúûüýÿ]+$/)) {
        stateParams.hash = text.substr(1);
      }
      else {
        stateParams.q = text;
      }
    }
    else if ($scope.search.type !== 'last') {
      stateParams.type = $scope.search.type;
    }

    // Update location href
    $location.search(stateParams).replace();
    // endRemoveIf(device)
  };

  $scope.doSearchText = function() {

    $scope.doSearch();
    $scope.updateLocationHref();

    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)
  };

  $scope.doSearch = function() {
    var text = $scope.search.text.trim();
    if ((UIUtils.screen.isSmall() && text.length < 3) || !text.length) {
      $scope.search.results = undefined;
      $scope.search.type = 'none';
      $scope.search.total = undefined;
      return $q.when();
    }

    $scope.search.loading = true;
    $scope.search.type = 'text';

    // If checksum is correct, search on simple pubkey
    let pubkeyWithCk;
    if (BMA.regexp.PUBKEY_WITH_CHECKSUM.test(text)) {
      console.debug("[wot] Validating pubkey checksum... ");
      let matches = BMA.regexp.PUBKEY_WITH_CHECKSUM.exec(text);
      console.log(matches)
      pubkey = matches[1];
      let checksum = matches[2];
      let expectedChecksum = csCrypto.util.pkChecksum(pubkey);
      if (checksum === expectedChecksum) {
        console.debug("[wot] checksum {" + checksum + "} valid for pubkey {" + pubkey + "}")
        text = pubkey
        pubkeyWithCk = pubkey + ':' + checksum
      }
    }

    return csWot.search(text)
      .then(function(idties){
        if ($scope.search.type !== 'text') return; // could have change
        originText = $scope.search.text.trim();
        if (originText !== text && originText !== pubkeyWithCk) return; // search text has changed before received response

        if ((!idties || !idties.length) && (BMA.regexp.PUBKEY.test(text) || BMA.regexp.PUBKEY_WITH_CHECKSUM.test(text))) {
          return BMA.uri.parse(text)
            .then(function(data) {
              $scope.doDisplayResult([data]);
            });
        }
        else {
          $scope.doDisplayResult(idties);

          // count, skipping divider
          var countBy = _.countBy(idties, function(hit) {
            return hit.divider && 'divider' || 'results';
          });
          $scope.search.total = countBy && countBy.results || 0;
        }
      })
      .catch(UIUtils.onError('ERROR.WOT_LOOKUP_FAILED'));
  };

  $scope.doGetNewcomers = function(offset, size, skipLocationUpdate) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'newcomers';

    // Update location href
    if (!offset && !skipLocationUpdate) {
      $scope.updateLocationHref();
    }

    return  csWot.newcomers(offset, size)
      .then(function(res){
        if ($scope.search.type !== 'newcomers') return false; // could have change
        $scope.doDisplayResult(res && res.hits, offset, size, res && res.total);
        return true;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        $scope.search.total = undefined;
        UIUtils.onError('ERROR.LOAD_NEWCOMERS_FAILED')(err);
      });
  };

  $scope.doGetPending = function(offset, size, skipLocationUpdate) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'pending';

    var searchFunction =  csCurrency.data.initPhase ?
      csWot.all :
      csWot.pending;

    // Update location href
    if (!offset && !skipLocationUpdate) {
      $scope.updateLocationHref();
    }

    return searchFunction(offset, size)
      .then(function(res){
        if ($scope.search.type !== 'pending') return false; // could have change
        $scope.doDisplayResult(res && res.hits, offset, size, res && res.total);
        // Always disable "more" on initphase
        $scope.search.hasMore = !csCurrency.data.initPhase && $scope.search.hasMore;
        return true;
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.total = undefined;
        $scope.search.hasMore = false;
        UIUtils.onError('ERROR.LOAD_PENDING_FAILED')(err);
      });
  };

  $scope.doGetWallets = function(offset, size, skipLocationUpdate) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.hideActionsPopover();
    $scope.search.loading = (offset === 0);
    $scope.search.type = 'wallets';

    // Update location href
    if (!offset && !skipLocationUpdate) {
      $scope.updateLocationHref();
    }

    return csWallet.children.all()
      .then(function(children) {
        if (!children || $scope.search.type !== 'wallets') return false; // could have change
        var res = [csWallet].concat(children).reduce(function(res, wallet, index) {
          var item = {
            id: index,
            pubkey: wallet.data.pubkey,
            uid: wallet.data.uid,
            name: wallet.data.localName || wallet.data.name,
            avatar: wallet.data.avatar
          };
          return res.concat(item);
        }, []);

        $scope.doDisplayResult(res, offset, size, res.length);
        $scope.search.hasMore = false;
        return true;
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

  $scope.select = function(item) {
    var state = item.state;

    //  Identity
    if (!state && item.pubkey) {
      // identity = self -> open the user wallet
      state = csWallet.isUserPubkey(item.pubkey) ? 'app.view_wallet' : 'app.wot_identity';
    }

    if (state) {
      // Need to have a back button outside tabs
      $ionicHistory.nextViewOptions({
        historyRoot: false,
        disableAnimate: false,
        expire: 300
      });

      $state.go(state, item.stateParams||item);
    }
  };

  $scope.next = function() {
    // This method should be override by sub controller (e.g. modal controller)
    console.warn('Selected identities (should be override):', $scope.selection);
  };

  $scope.toggleCheck = function(index, e) {
    var identity = $scope.search.results[index];
    if (identity.checked) {
      $scope.addToSelection(identity);
    }
    else {
      $scope.removeSelection(identity, e);
    }
  };

  $scope.toggleSelect = function(identity){
    identity.selected = !identity.selected;
  };

  $scope.addToSelection = function(identity) {

    var copyIdty = angular.copy(identity);
    if (copyIdty.name) {
      copyIdty.name = copyIdty.name.replace('<em>', '').replace('</em>', ''); // remove highlight
    }

    $scope.selection.push(copyIdty);
  };

  $scope.removeSelection = function(identity, e) {

    // Remove from selection array
    var identityInSelection = _.findWhere($scope.selection, {id: identity.id});
    if (identityInSelection) {
      $scope.selection.splice($scope.selection.indexOf(identityInSelection), 1);
    }

    // Uncheck in result array, if exists
    if (!$scope.search.loading) {
      var existIdtyInResult = _.findWhere($scope.search.results, {id: identity.id});
      if (existIdtyInResult && existIdtyInResult.checked) {
        existIdtyInResult.checked = false;
      }
    }
    //e.preventDefault();
  };

  $scope.scanQrCode = function(){
    if (!Device.barcode.enable) {
      return;
    }
    Device.barcode.scan()
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
  $scope.showHelpTip = function(index) {
    if (!$scope.isLogin()) return;
    index = angular.isDefined(index) ? index : csSettings.data.helptip.wotLookup;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startWotLookupTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.wotLookup = endIndex;
        csSettings.store();
      });
  };

  $scope.doDisplayResult = function(res, offset, size, total) {
    res = res || [];

    // pre-check result if already in selection
    if ($scope.allowMultiple && res.length && $scope.selection.length) {
      _.forEach($scope.selection, function(identity) {
        var identityInRes = _.findWhere(res, {id: identity.id});
        if (identityInRes) {
          identityInRes.checked = true;
        }
      });
    }

    if (!offset) {
      $scope.search.results = res || [];
    }
    else {
        $scope.search.results = $scope.search.results.concat(res);
    }
    $scope.search.total = angular.isDefined(total) ? total : undefined;
    $scope.search.loading = false;
    $scope.search.hasMore = $scope.search.results.length >= offset + size;

    $scope.smallscreen = UIUtils.screen.isSmall();

    if (!$scope.search.results.length) return;

    // Motion
    if (res.length > 0 && $scope.motion) {
      $scope.motion.show({selector: '.lookupForm .list .item', ink: true});
    }
  };

  /* -- show/hide popup -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'templates/wot/lookup_popover_actions.html',
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

function WotLookupModalController($scope, $controller, $focus, csWallet, parameters){
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotLookupCtrl', {$scope: $scope}));

  parameters = parameters || {};
  $scope.search.loading = false;
  $scope.enableFilter = angular.isDefined(parameters.enableFilter) ? parameters.enableFilter : false;
  $scope.enableWallets = angular.isDefined(parameters.enableWallets) ? (csWallet.isLogin() && csWallet.children.count() && parameters.enableWallets) : false;
  $scope.allowMultiple = angular.isDefined(parameters.allowMultiple) ? parameters.allowMultiple : false;
  $scope.parameters = parameters;
  $scope.showResultLabel = false;

  $scope.wotSearchTextId = 'wotSearchTextModal';

  if ($scope.allowMultiple && parameters.selection) {
    $scope.selection = parameters.selection;
  }

  var superEnter = $scope.enter;
  $scope.enter = function(e) {
    if ($scope.parameters && $scope.parameters.q) {
      $scope.search.text=$scope.parameters.q;
      if ($scope.parameters.q.trim().length > 2) {
        superEnter(e); // call enter, that launch the search
      }
    }
  };
  $scope.$on('modal.shown', $scope.enter);

  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.select = function(identity){
    $scope.closeModal({
      pubkey: identity.pubkey,
      uid: identity.uid,
      name: identity.name && identity.name.replace(/<\/?em>/ig, '')
    });
  };

  $scope.next = function() {
    $scope.closeModal($scope.selection);
  };

  $scope.updateLocationHref = function() {
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
function WotIdentityAbstractController($scope, $rootScope, $state, $translate, $ionicHistory, $q,
                                       UIUtils, Modals, csConfig, csSettings, csCurrency, csWot, csWallet) {
  'ngInject';

  $scope.formData = {
    hasSelf: true
  };
  $scope.disableCertifyButton = true;
  $scope.loading = true;

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

  $scope.load = function(pubkey, uid, options) {
    return csWot.load(pubkey, uid, options)
      .then(function(identity){
        if (!identity) return UIUtils.onError('ERROR.IDENTITY_NOT_FOUND')().then($scope.showHome);
        $scope.formData = identity;
        var isLogin = csWallet.isLogin();
        $scope.revoked = identity.requirements && (identity.requirements.revoked || identity.requirements.pendingRevocation);
        $scope.canCertify = identity.hasSelf && !$scope.revoked && (!isLogin || !csWallet.isUserPubkey(pubkey) || csWallet.children.count() > 0);
        $scope.canSelectAndCertify = identity.hasSelf && (csWallet.isUserPubkey(pubkey) || csWallet.children.hasPubkey(pubkey));
        var cert = isLogin && _.find((identity.received_cert||[]).concat(identity.received_cert_pending||[]), function (cert) {
          return cert.pubkey === csWallet.data.pubkey && cert.valid && cert.expiresIn > csSettings.data.timeWarningExpire;
        });
        $scope.alreadyCertified = (!$scope.canCertify || !isLogin || csWallet.children.count() > 0) ? false : !!cert;
        $scope.disableCertifyButton = $scope.alreadyCertified || $scope.revoked;
        $scope.loading = false;
      })
      .catch(function(err) {
        $scope.loading = false;
        UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
      });
  };


  $scope.doUpdate = function(silent) {
    if (!silent) {
      $scope.loading = true;
      UIUtils.loading.show();
    }
    var options = {
      cache: false, // No cache
      blockUid: $scope.formData.blockUid || undefined
    };
    return $scope.load($scope.formData.pubkey, $scope.formData.uid, options)
      .then(UIUtils.loading.hide);
  };

  // Certify the current identity
  $scope.certify = function() {

    // Select wallet, if many
    return (csWallet.children.count() ? Modals.showSelectWallet({displayBalance: false}) : $q.when(csWallet))
      .then(function(wallet) {
        if (!wallet) return; // user cancelled

        // Need user auth - fix #513
        return wallet.auth({minData: true})
          .then(function(walletData) {
            UIUtils.loading.hide();

            if (!csCurrency.data.initPhase && !walletData.isMember) {
              UIUtils.alert.error(walletData.requirements.needSelf ?
                'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY' : 'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY_HAS_SELF');
              return;
            }

            if (!csCurrency.data.initPhase && !$scope.formData.hasSelf) {
              UIUtils.alert.error('ERROR.IDENTITY_TO_CERTIFY_HAS_NO_SELF');
              return;
            }

            // Check identity not expired
            if ($scope.formData.requirements.expired) {
              UIUtils.alert.error('ERROR.IDENTITY_EXPIRED');
              return;
            }

            // Check not already certified
            var previousCert = _.find($scope.formData.received_cert, function(cert) {
              return cert.pubkey === wallet.data.pubkey && cert.valid && cert.expiresIn > csSettings.data.timeWarningExpire;
            });
            if (previousCert) {
              $translate('ERROR.IDENTITY_ALREADY_CERTIFY', previousCert)
                .then(function(message) {
                  UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
                });
              return;
            }

            // Check no pending certification
            previousCert = _.findWhere($scope.formData.received_cert_pending, { pubkey: wallet.data.pubkey, valid: true});
            if (previousCert) {
              $translate('ERROR.IDENTITY_ALREADY_CERTIFY_PENDING', previousCert)
                .then(function(message) {
                  UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
                });
              return;
            }

            UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES', 'CONFIRM.POPUP_SECURITY_WARNING_TITLE', {
              cssClass: 'warning',
              okText: 'WOT.BTN_YES_CERTIFY',
              okType: 'button-assertive'
            })
              .then(function(confirm){
                if (!confirm) {
                  return;
                }
                UIUtils.loading.show();
                wallet.certify($scope.formData.uid,
                  $scope.formData.pubkey,
                  $scope.formData.blockUid || ($scope.formData.requirements && $scope.formData.requirements.meta && $scope.formData.requirements.meta.timestamp),
                  $scope.formData.requirements && $scope.formData.requirements.meta && $scope.formData.requirements.meta.sig,
                  $scope.formData.isMember,
                  $scope.formData.wasMember)
                  .then(function(cert) {
                    UIUtils.loading.hide();
                    if (cert) {
                      $scope.prepareNewCert(wallet, cert);
                      $scope.alreadyCertified = true;
                      UIUtils.toast.show('INFO.CERTIFICATION_DONE');
                      $scope.formData.received_cert_pending.unshift(cert);
                      $scope.formData.requirements.pendingCertificationCount++;
                      $scope.doMotion();
                    }
                  })
                  .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
              });
          })
          .catch(function(err) {
            if (err === 'CANCELLED') return;
            UIUtils.onError('ERROR.LOGIN_FAILED')(err);
          });
      });
  };

  // Select an identity and certify
  $scope.selectAndCertify = function() {

    // Select wallet, if many
    return (csWallet.children.count() ? Modals.showSelectWallet({displayBalance: false}) : $q.when(csWallet))
      .then(function(wallet) {
        // Need user auth - fix #513
        return wallet.auth({minData: true})
          .then(function (walletData) {
            if (!csCurrency.data.initPhase && !walletData.isMember) {
              UIUtils.alert.error(walletData.requirements.needSelf || walletData.requirements.needMembership ?
                'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY' : 'ERROR.NEED_MEMBER_ACCOUNT_TO_CERTIFY_HAS_SELF');
              return;
            }
            UIUtils.loading.hide();
            // Open Wot lookup modal
            return Modals.showWotLookup();
          })
          .then(function (idty) {
            if (!idty || !idty.pubkey) {
              return; // cancelled
            }
            if (!idty.uid) { // not a member
              UIUtils.alert.error('ERROR.IDENTITY_TO_CERTIFY_HAS_NO_SELF');
              return;
            }

            UIUtils.loading.show();

            var options = {cache: false, blockUid: idty.blockUid};

            // load selected identity
            return csWot.load(idty.pubkey, idty.uid, options);
          })

          .then(function (identity) {
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
            var previousCert = _.findWhere(identity.received_cert, {pubkey: wallet.data.pubkey, valid: true});
            if (previousCert) {
              $translate('ERROR.IDENTITY_ALREADY_CERTIFY', previousCert)
                .then(function (message) {
                  UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
                });
              return;
            }

            // Check not pending certification
            previousCert = _.findWhere(identity.received_cert_pending, {pubkey: wallet.data.pubkey, valid: true});
            if (previousCert) {
              $translate('ERROR.IDENTITY_ALREADY_CERTIFY_PENDING', previousCert)
                .then(function (message) {
                  UIUtils.alert.error(message, 'ERROR.UNABLE_TO_CERTIFY_TITLE');
                });
              return;
            }

            // Ask confirmation
            $translate('CONFIRM.CERTIFY_RULES_TITLE_UID', {uid: identity.uid})
              .then(function (confirmTitle) {
                return UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES', confirmTitle);
              })
              .then(function (confirm) {
                if (!confirm) {
                  return;
                }
                UIUtils.loading.show();

                // Send certification
                wallet.certify(identity.uid,
                  identity.pubkey,
                  identity.blockUid || (identity.requirements && identity.requirements.meta && identity.requirements.meta.timestamp),
                  identity.requirements && identity.requirements.meta && identity.requirements.meta.sig,
                  identity.isMember,
                  identity.wasMember)
                  .then(function (cert) {
                    UIUtils.loading.hide();
                    if (!cert) return;
                    return csWot.extendAll([cert], 'pubkey')
                      .then(function () {
                        UIUtils.toast.show('INFO.CERTIFICATION_DONE');
                        $scope.formData.given_cert_pending.unshift(cert);
                        $scope.doMotion();
                      });
                  })
                  .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
              });
          })
          .catch(function (err) {
            if (err === 'CANCELLED') return;
            UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
          });
      });
  };

  // Add wallet's data to a new cert
  $scope.prepareNewCert = function(wallet, cert) {
    cert.uid = wallet.data.uid;
    cert.pubkey = wallet.data.pubkey;
    cert.isMember = wallet.data.isMember;
    cert.avatar = wallet.data.avatar;
    cert.name = wallet.data.name;
  };

  $scope.removeActionParamInLocationHref = function(state) {
    if (!state || !state.stateParams || !state.stateParams.action) return;

    var stateParams = angular.copy(state.stateParams);

    // Reset action param
    stateParams.action = null;
    stateParams.amount = null;
    stateParams.comment = null;

    // Update location href
    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: false,
      historyRoot: false
    });
    $state.go(state.stateName, stateParams,
      {
        reload: false,
        inherit: true,
        notify: false
      });
  };

  $scope.doAction = function(action, options) {
    if (action === 'certify') {
      return $scope.certify();
    }
    if (action === 'transfer') {
      $scope.showTransferModal(options);
    }
  };

  /* -- open screens -- */

  $scope.showCertifications = function() {
    var block = $scope.formData.requirements && $scope.formData.requirements.alternatives && $scope.formData.blockUid || undefined;
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if (UIUtils.screen.isSmall() ) {
      $state.go('app.wot_cert', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        type: 'received',
        block: block
      });
    }
    else {
      $state.go('app.wot_cert_lg', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        block: block
      });
    }
  };

  $scope.showGivenCertifications = function() {
    var block = $scope.formData.requirements && $scope.formData.requirements.alternatives && $scope.formData.blockUid || undefined;
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if (UIUtils.screen.isSmall() ) {
      $state.go('app.wot_cert', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        type: 'given',
        block: block
      });
    }
    else {
      $state.go('app.wot_cert_lg', {
        pubkey: $scope.formData.pubkey,
        uid: $scope.formData.uid,
        block: block
      });
    }
  };

  $scope.showSharePopover = function(event) {
    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;
    // Use shareBasePath (fix #530) or rootPath (fix #390)
    var url = (csConfig.shareBaseUrl || $rootScope.rootPath) + $state.href('app.wot_identity', {pubkey: $scope.formData.pubkey, uid: $scope.formData.uid});
    // Override default position, is small screen - fix #545
    if (UIUtils.screen.isSmall()) {
      event = angular.element(document.querySelector('#wot-share-anchor-'+$scope.formData.pubkey)) || event;
    }
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
function WotIdentityViewController($scope, $rootScope, $controller, $timeout, $state, UIUtils, Modals, csWallet) {
  'ngInject';
  // Initialize the super class and extend it.
  angular.extend(this, $controller('WotIdentityAbstractCtrl', {$scope: $scope}));

  $scope.motion = UIUtils.motion.fadeSlideInRight;
  $scope.qrcodeId = 'qrcode-wot-' + $scope.$id;

  // Init likes here, to be able to use in extension
  $scope.options = $scope.options || {};
  $scope.options.like = {
    kinds: ['LIKE', 'ABUSE'],
    index: 'user',
    type: 'profile'
  };
  $scope.likeData = {
    likes: {},
    abuses: {}
  };

  $scope.$on('$ionicView.enter', function(e, state) {

    var onLoadSuccess = function() {
      $scope.doMotion();
      if (state.stateParams && state.stateParams.action) {
        $timeout(function() {
          $scope.doAction(state.stateParams.action.trim(), state.stateParams);
        }, 100);

        $scope.removeActionParamInLocationHref(state);

        // Need by like controller
        $scope.likeData.id = $scope.formData.pubkey;
      }

      $scope.showQRCode();
    };
    var options = {
      cache: true,
      blockUid: state.stateParams && state.stateParams.block || undefined
    };

    if (state.stateParams &&
      state.stateParams.pubkey &&
      state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) { // load once

        return $scope.load(state.stateParams.pubkey.trim(), state.stateParams.uid, options)
          .then(onLoadSuccess)
          .catch(UIUtils.onError("ERROR.LOAD_IDENTITY_FAILED"));
      }
    }

    else if (state.stateParams &&
      state.stateParams.uid &&
      state.stateParams.uid.trim().length > 0) {
      if ($scope.loading) { // load once
        return $scope.load(null, state.stateParams.uid, options)
          .then(onLoadSuccess);
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

    $scope.$broadcast('$csExtension.motion');
  };

  $scope.doQuickFix = function(event) {
    if (event === 'showSelectIdentities') {
      return $scope.showSelectIdentities();
    }
  };

  $scope.showSelectIdentities = function() {
    if (!$scope.formData.requirements || !$scope.formData.requirements.alternatives) return;

    return Modals.showSelectPubkeyIdentity({
      identities: [$scope.formData.requirements].concat($scope.formData.requirements.alternatives)
    })
    .then(function(res) {
      if (!res || !res.pubkey) return; // Skip if cancelled
      // open the identity
      return $state.go('app.wot_identity', {
        pubkey: res.pubkey,
        uid: res.uid,
        block: res.meta && res.meta.timestamp || res.blockUid
      });
    });
  };

  $scope.showQRCode = function(timeout) {
    if (!$scope.qrcodeId || !$scope.formData.pubkey) return; // Skip

    // Get the DIV element
    var element = angular.element(document.querySelector('#' + $scope.qrcodeId + ' .content'));
    if (!element) {
      console.error("[wot-controller] Cannot found div #{0} for the QRCode. Skipping.".format($scope.qrcodeId));
      return;
    }

    console.debug("[wot-controller] Generating QR code for identity...");
    $timeout(function() {
      var svg = UIUtils.qrcode.svg($scope.formData.pubkey);
      element.html(svg);
      UIUtils.motion.toggleOn({selector: '#'+$scope.qrcodeId}, timeout || 1100);
    });
  };

  $scope.hideQRCode = function() {
    if (!$scope.qrcodeId) return;
    var element = angular.element(document.querySelector('#' + $scope.qrcodeId));
    if (element) {
      UIUtils.motion.toggleOff({selector: '#'+$scope.qrcodeId});
    }
  };
}

/**
 * Identity tx view controller
 */
function WotIdentityTxViewController($scope, $timeout, $q, BMA, csSettings, csWot, csTx, UIUtils) {
  'ngInject';

  $scope.formData= {};
  $scope.loading = true;
  $scope.motion = UIUtils.motion.fadeSlideInRight;

  $scope.$on('$ionicView.enter', function(e, state) {
    if ($scope.loading) {
      $scope.pubkey = state.stateParams.pubkey;
      $scope.uid = state.stateParams.uid;
      $scope.load();
    }
    else {
      // update view
      $scope.updateView();
    }
  });

  // Load data
  $scope.load = function(fromTime) {
    return $q.all([
        csWot.extend({pubkey: $scope.pubkey}),
        csTx.load($scope.pubkey, fromTime)
      ])
      .then(function(res) {
        $scope.formData = angular.merge(res[0], res[1]);
        $scope.loading = false;
        $scope.updateView();
      });
  };

  // Updating data
  $scope.doUpdate = function(silent) {
    console.debug('[wot] TX history reloading...');
    $scope.formData = {};
    return (silent ?
        $scope.load() :
        UIUtils.loading.show()
          .then($scope.load)
          .then(UIUtils.loading.hide)
      )
      .then($scope.updateView)
      .catch(UIUtils.onError('ERROR.IDENTITY_TX_FAILED'));
  };

  // Update view
  $scope.updateView = function() {
    $scope.$broadcast('$$rebind::balance'); // force rebind balance
    $scope.$broadcast('$$rebind::rebind'); // force rebind
    $scope.motion.show();
  };

  $scope.downloadHistoryFile = function(options) {
    options = options || {};
    options.fromTime = options.fromTime || -1; // default: full history
    csTx.downloadHistoryFile($scope.pubkey, options);
  };

  $scope.showMoreTx = function(fromTime) {

    fromTime = fromTime ||
      ($scope.formData.tx.fromTime - csSettings.data.walletHistoryTimeSecond) ||
      (moment().utc().unix() - 2 * csSettings.data.walletHistoryTimeSecond);

    UIUtils.loading.show();
    return csTx.load($scope.pubkey, fromTime)
      .then(function(res) {
        angular.merge($scope.formData, res);
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        // If http rest limitation: wait then retry
        if (err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
          $timeout(function() {
            return $scope.showMoreTx(fromTime);
          }, 2000);
        }
        else {
          UIUtils.onError('ERROR.IDENTITY_TX_FAILED')(err);
        }
      });
  };

}


/**
 * Certifications controller - extend WotIdentityAbstractCtrl
 */
function WotCertificationsViewController($scope, $rootScope, $controller, csSettings, csWallet, UIUtils) {
  'ngInject';

  var wallet;

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

    // First load
    if ($scope.loading) {
      var options = {
        cache: true,
        blockUid: state.stateParams && state.stateParams.block || undefined
      };

      if (state.stateParams &&
        state.stateParams.pubkey &&
        state.stateParams.pubkey.trim().length > 0) {

        return $scope.load(state.stateParams.pubkey.trim(), state.stateParams.uid, options)
          .then(function () {
            $scope.doMotion();
            $scope.showHelpTip();
          });
      }

      else {
        wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
        if (!wallet) {
          UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
          return $scope.showHome();
        }
        if (!wallet.isLogin()) {
          return $scope.showHome();
        }
        return $scope.load(wallet.data.pubkey, wallet.data.uid, options)
          .then(function () {
            $scope.doMotion();
            $scope.showHelpTip();
          });
      }
    }

    else {
      $scope.doMotion();
    }
  });

  $scope.$on('$ionicView.leave', function() {
    $scope.loading = true;
  });

  // Updating data
  $scope.doUpdate = function() {
    var options = {
      cache: false, // No cache
      blockUid: $scope.formData.blockUid || undefined
    };
    return $scope.load($scope.formData.pubkey, $scope.formData.uid, options)
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


/**
 * Select identities from a pubkey (useful when many self on the same pubkey)
 * @param $scope
 * @param $q
 * @param csWot
 * @param parameters
 * @constructor
 */
function WotSelectPubkeyIdentityModalController($scope, $q, csWot, parameters) {

  $scope.loading = true;

  $scope.load = function() {
    // If list of identities given by parameters: use it
    if (parameters && parameters.identities) {
      $scope.identities = parameters.identities;
      $scope.pubkey = $scope.identities[0].pubkey;
      $scope.loading = false;
      return $q.when();
    }

    // Or load from pubkey
    $scope.pubkey = parameters && parameters.pubkey;
    if (!pubkey) {
      return $q.reject('Missing parameters: [pubkey] or [identities]');
    }

    return csWot.loadRequirements({pubkey: pubkey, uid: uid})
      .then(function(data) {
        if (data && data.requirements) {
          $scope.identities = data.requirements;
          if (data.requirements.alternatives) {
            $scope.identities = [data.requirements].concat(data.requirements.alternatives);
          }
          else {
            $scope.identities = [data.requirements];
          }
        }
        $scope.loading = false;
      });
  };
  $scope.$on('modal.shown', $scope.load);
}
