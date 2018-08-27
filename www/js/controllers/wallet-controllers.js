angular.module('cesium.wallet.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider


      .state('app.view_wallet', {
        url: "/account?refresh",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet.html",
            controller: 'WalletCtrl'
          }
        },
        data: {
          login: true,
          silentLocationChange: true
        }
      })

      .state('app.view_wallet_tx', {
        url: "/history/account?refresh",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx.html",
            controller: 'WalletTxCtrl'
          }
        },
        data: {
          login: true,
          silentLocationChange: true
        }
      })

      .state('app.view_wallet_tx_errors', {
        url: "/history/account/errors",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx_error.html",
            controller: 'WalletTxErrorCtrl'
          }
        },
        data: {
          login: true
        }
      })

      .state('app.view_wallets', {
        url: "/wallets",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/list/view_wallets.html",
            controller: 'WalletListCtrl'
          }
        },
        data: {
          login: true
        }
      })

      .state('app.view_wallet_by_id', {
        url: "/wallets/:id?refresh",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet.html",
            controller: 'WalletCtrl'
          }
        },
        data: {
          login: true,
          silentLocationChange: true
        }
      })

      .state('app.view_wallet_tx_by_id', {
        url: "/history/wallets/:id?refresh",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx.html",
            controller: 'WalletTxCtrl'
          }
        },
        data: {
          login: true,
          silentLocationChange: true
        }
      })

      .state('app.view_wallet_tx_errors_by_id', {
        url: "/history/wallets/:id/errors",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx_error.html",
            controller: 'WalletTxErrorCtrl'
          }
        },
        data: {
          login: true
        }
      })
    ;
  })


  .controller('WalletCtrl', WalletController)

  .controller('WalletTxCtrl', WalletTxController)

  .controller('WalletTxErrorCtrl', WalletTxErrorController)

  .controller('WalletSecurityModalCtrl', WalletSecurityModalController)

  .controller('WalletListCtrl', WalletListController)

  .controller('WalletSelectModalCtrl', WalletSelectModalController)

  .controller('PopoverWalletSelectModalCtrl', PopoverWalletSelectModalController)
;

function WalletController($scope, $rootScope, $q, $ionicPopup, $timeout, $state, $translate, $ionicPopover, $location,
                          UIUtils, Modals, csPopovers, BMA, csConfig, csSettings, csWallet, csHelp) {
  'ngInject';

  $scope.loading = true;
  $scope.settings = csSettings.data;
  $scope.qrcodeId = 'qrcode-wallet-' + $scope.$id;

  var wallet;

  $scope.enter = function(e, state) {
    $scope.loading = $scope.loading || (state.stateParams && state.stateParams.refresh);
    $scope.enableSelectWallet = csWallet.children.count() > 0;
    if ($scope.loading) { // load once
      wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
      if (!wallet) {
        UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
        return $scope.showHome();
      }

      $scope.isDefaultWallet = wallet.isDefault();
      $scope.walletId = wallet.id;

      $scope.cleanLocationHref(state);

      return $scope.load();
    }
    else {
      // update view (to refresh avatar + plugin data, such as profile, subscriptions...)
      UIUtils.loading.hide();
      $timeout($scope.updateView, 300);
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function() {
    if (!wallet) return;

    return wallet.login()
      .then(function(walletData) {
        $scope.formData = walletData;
        $scope.loading=false; // very important, to avoid TX to be display before wallet.currentUd is loaded
        $scope.updateView();
        $scope.showQRCode();
        $scope.showHelpTip();
        $scope.addListeners();
        UIUtils.loading.hide(); // loading could have be open (e.g. new account)
      })
      .catch(function(err){
        if (err == 'CANCELLED') {
          $scope.showHome();
        }
      });
  };

  $scope.updateView = function() {
    $scope.motion.show({selector: '#wallet .item'});
    $scope.$broadcast('$$rebind::' + 'rebind'); // force rebind
  };


  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Clean controller data when logout
  $scope.onWalletLogout = function() {
    // clean QRcode
    $scope.hideQRCode();
    $scope.removeListeners();
    delete $scope.formData;
    wallet = null;
    $scope.loading = true;
  };

  $scope.addListeners = function() {
    $scope.listeners = [
      // Reset the view on logout
      wallet.api.data.on.logout($scope, $scope.onWalletLogout),

      // Listen new events (can appears from security wizard also)
      $scope.$watchCollection('formData.events', function(newEvents, oldEvents) {
        if (!oldEvents || $scope.loading || angular.equals(newEvents, oldEvents)) return;
        $scope.updateView();
      })
    ];
  };

  $scope.removeListeners = function() {
    _.forEach($scope.listeners, function(remove){
      remove();
    });
    $scope.listeners = [];
  };

  // Ask uid
  $scope.showUidPopup = function() {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          $scope.formData.newUid = (!!$scope.formData.uid ? ''+$scope.formData.uid : '');

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/wallet/popup_register.html',
            title: translations['ACCOUNT.POPUP_REGISTER.TITLE'],
            subTitle: translations['ACCOUNT.POPUP_REGISTER.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.registerForm.$submitted=true;
                  if(!$scope.registerForm.$valid || !$scope.formData.newUid) {
                    //don't allow the user to close unless he enters a uid
                    e.preventDefault();
                  } else {
                    return $scope.formData.newUid;
                  }
                }
              }
            ]
          })
          .then(function(uid) {
            if (!uid) { // user cancel
              delete $scope.formData.uid;
              UIUtils.loading.hide();
              return;
            }
            resolve(uid);
          });
        });
      });
  };

  // Send self identity
  $scope.self = function() {
    $scope.hideActionsPopover();

    return $scope.showUidPopup()
    .then(function(uid) {
      UIUtils.loading.show();

      return wallet.self(uid)
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err){
         UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
         .then(function() {
           $scope.self(); // loop
         });
      });
    });
  };

  $scope.doMembershipIn = function(retryCount) {
    return wallet.membership.inside()
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        if (err == 'CANCELLED') throw err;
        if (err && err.ucode != BMA.errorCodes.MEMBERSHIP_ALREADY_SEND) return;
        if (!retryCount || retryCount <= 2) {
          return $timeout(function() {
            $scope.doMembershipIn(retryCount ? retryCount+1 : 1);
          }, 1000);
        }
        throw err;
      });
  };


  // Send membership IN
  $scope.membershipIn = function(keepSelf) {
    $scope.hideActionsPopover();

    if (wallet.isMember()) {
      return UIUtils.alert.info("INFO.NOT_NEED_MEMBERSHIP");
    }

    // Select uid (or reuse it)
    return ((keepSelf && !!$scope.formData.blockUid) ?
        $q.when($scope.formData.uid) :
        $scope.showUidPopup())

      // Ask user confirmation
      .then(function(uid) {
        return UIUtils.alert.confirm("CONFIRM.MEMBERSHIP")
          .then(function(confirm) {
            if (!confirm) throw 'CANCELLED';
            return uid;
          });
      })

      // Send self (identity) - if need
      .then(function (uid) {
        UIUtils.loading.show();

        // If uid changed, or self blockUid not retrieve : do self() first
        if (!$scope.formData.blockUid || uid != $scope.formData.uid) {
          $scope.formData.blockUid = null;
          $scope.formData.uid = uid;

          return wallet.self(uid, false/*do NOT load membership here*/);
        }
      })

      // Send membership
      .then($scope.doMembershipIn)
      .catch(function(err) {
        if (err == 'CANCELLED') return;
        if (!wallet.data.uid) {
          UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err);
        }
        else {
          UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err);
        }
      });
  };

  // Send membership OUT
  $scope.membershipOut = function(confirm, confirmAgain) {
    $scope.hideActionsPopover();

    // Ask user confirmation
    if (!confirm) {
      return UIUtils.alert.confirm('CONFIRM.MEMBERSHIP_OUT', 'CONFIRM.POPUP_WARNING_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_YES',
        okType: 'button-assertive'
      })
      .then(function(confirm) {
        if (confirm) $scope.membershipOut(true); // loop with confirmation
      });
    }

    if (!confirmAgain) {
      return UIUtils.alert.confirm("CONFIRM.MEMBERSHIP_OUT_2", 'CONFIRM.POPUP_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_YES',
        okType: 'button-assertive'
      })
      .then(function (confirm) {
        if (confirm) $scope.membershipOut(true, true); // loop with all confirmations
      });
    }

    UIUtils.loading.show();
    return wallet.membership.out()
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.toast.show('INFO.MEMBERSHIP_OUT_SENT');
    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_OUT_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function(silent) {
    console.debug('[wallet] Refreshing data...');
    return (silent ?
        wallet.refreshData() :
        UIUtils.loading.show()
          .then(wallet.refreshData)
          .then(UIUtils.loading.hide)
      )
      .then($scope.updateView)
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  /**
   * Renew membership
   */
  $scope.renewMembership = function(confirm) {

    if (!$scope.formData.isMember && !$scope.formData.requirements.wasMember) {
      return UIUtils.alert.error("ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION");
    }
    if (!confirm && !$scope.formData.requirements.needRenew) {
      return $translate("CONFIRM.NOT_NEED_RENEW_MEMBERSHIP", {membershipExpiresIn: $scope.formData.requirements.membershipExpiresIn})
        .then(function(message) {
          return UIUtils.alert.confirm(message);
        })
        .then(function(confirm) {
          if (confirm) $scope.renewMembership(true); // loop with confirm
        });
    }

    return wallet.auth({minData: true}) // Ask user to auth, before confirmation - fix #508
      .then(function() {
        UIUtils.loading.hide();
        return UIUtils.alert.confirm("CONFIRM.RENEW_MEMBERSHIP");
      })
      .then(function(confirm) {
        if (confirm) {
          UIUtils.loading.show();
          return $scope.doMembershipIn();
        }
      })
      .catch(function(err){
        if (err == 'CANCELLED') return;
        UIUtils.loading.hide();
        UIUtils.alert.error(err);
      });
  };


  /**
   * Fix identity (e.g. when identity expired)
   */
  $scope.fixIdentity = function() {
    if (!$scope.formData.uid) return;

    return $q.all([
      wallet.auth(),
      $translate('CONFIRM.FIX_IDENTITY', {uid: $scope.formData.uid})
    ])
      .then(function(res) {
        return UIUtils.alert.confirm(res[1]);
      })
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset self data
        $scope.formData.blockUid = null;
        // Reset membership data
        $scope.formData.sigDate = null;
        return wallet.self($scope.formData.uid);
      })
      .then($scope.doMembershipIn)
      .catch(function(err){
        if (err == 'CANCELLED') return;
        UIUtils.loading.hide();
        UIUtils.alert.error(err);
      });
  };

  /**
   * Fix membership, when existing MS reference an invalid block
   */
  $scope.fixMembership = function() {
    if (!$scope.formData.uid) return;

    if (wallet.isMember()) {
      return UIUtils.alert.info("INFO.NOT_NEED_MEMBERSHIP");
    }

    return wallet.auth()
      .then(function() {
        UIUtils.alert.confirm("CONFIRM.FIX_MEMBERSHIP");
      })
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset self data
        $scope.formData.blockUid = null;
        // Reset membership data
        $scope.formData.sigDate = null;
        return wallet.self($scope.formData.uid, false/*do NOT load membership here*/);
      })
      .then($scope.doMembershipIn)
      .catch(function(err){
        if (err == 'CANCELLED') return;
        UIUtils.loading.hide();
        UIUtils.alert.error(err);
      });
  };

  /**
   * Catch click for quick fix
   * @param fix
   */
  $scope.doQuickFix = function(event) {
    if (event == 'renew') {
      $scope.renewMembership();
    }
    else if (event == 'membership') {
      $scope.membershipIn(true/*keep self*/);
    }
    else if (event == 'fixMembership') {
      $scope.fixMembership();
    }
    else if (event == 'fixIdentity') {
      $scope.fixIdentity();
    }
  };

  /* -- UI actions -- */

  $scope.startWalletTour = function() {
    $scope.hideActionsPopover();
    return csHelp.wallet.tour();
  };

  $scope.showHelpTip = function() {
    return csHelp.wallet.helptip();
  };

  $scope.showQRCode = function(timeout) {
    if (!$scope.qrcode) {
      $scope.qrcode = new QRCode(
        $scope.qrcodeId,
        {
          text: $scope.formData.pubkey,
          width: 200,
          height: 200,
          correctLevel: QRCode.CorrectLevel.L
        });
      UIUtils.motion.toggleOn({selector: '#'+$scope.qrcodeId}, timeout || 1100);
    }
    else {
      $scope.qrcode.clear();
      $scope.qrcode.makeCode($scope.formData.pubkey);
      UIUtils.motion.toggleOn({selector: '#'+$scope.qrcodeId}, timeout || 1100);
    }
  };

  $scope.hideQRCode = function() {
    if ($scope.qrcode) {
      $scope.qrcode.clear();
      UIUtils.motion.toggleOff({selector: '#'+$scope.qrcodeId});
    }
  };

  $scope.showCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if ($scope.isDefaultWallet) {
      $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert' : 'app.wallet_cert_lg', {
        type: 'received'
      });
    }
    else {
      $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert_by_id' : 'app.wallet_cert_by_id_lg', {
        id: $scope.walletId,
        type: 'received'
      });
    }
  };

  $scope.showGivenCertifications = function() {
    // Warn: do not use a simple link here (a ng-click is mandatory for help tour)
    if ($scope.isDefaultWallet) {
      $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert' : 'app.wallet_cert_lg', {
        type: 'given'
      });
    }
    else {
      $state.go(UIUtils.screen.isSmall() ? 'app.wallet_cert_by_id' : 'app.wallet_cert_by_id_lg', {
        id: $scope.walletId,
        type: 'given'
      });
    }
  };

  $scope.showTxHistory = function() {
    $state.go($scope.isDefaultWallet ? 'app.view_wallet_tx' : 'app.view_wallet_tx_by_id', {
      id: $scope.walletId
    });
  };

  /* -- modals -- */

  // Transfer
  $scope.showTransferModal = function() {
    var hasCredit = (!!$scope.formData.balance && $scope.formData.balance > 0);
    if (!hasCredit && !wallet.children.count()) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    Modals.showTransfer()
      .then(function(done){
        if (done) {
          UIUtils.toast.show('INFO.TRANSFER_SENT');
          $scope.$broadcast('$$rebind::' + 'balance'); // force rebind balance
          $scope.motion.show({selector: '.item-pending'});
        }
      });
  };

  $scope.showSecurityModal = function(){
    $scope.hideActionsPopover();
    return Modals.showAccountSecurity({wallet: wallet})
      .then(function(res) {
        if (!res) return;

        if (res === 'self') {
          return $scope.self();
        }
        else if (res === 'membershipIn') {
          return $scope.membershipIn();
        }
      });
  };

  $scope.showSelectIdentitiesModal = function(){
    $scope.hideActionsPopover();

    return Modals.showSelectPubkeyIdentity({
        identities: [$scope.formData.requirements].concat($scope.formData.requirements.alternatives)
      })
      .then(function(idty) {
        if (!idty || !idty.uid) return;

        $scope.loading = true;

        // Set self (= uid + blockUid)
        return wallet.setSelf(idty.uid, idty.blockUid)
          .then(function() {
            $scope.loading=false;
            $scope.updateView();
            UIUtils.loading.hide();
          });
      });
  };


  /* -- popovers -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wallet/popover_actions.html', {
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

  $scope.showSharePopover = function(event) {
    $scope.hideActionsPopover();

    var title = $scope.formData.name || $scope.formData.uid || $scope.formData.pubkey;
    // Use shareBasePath (fix #530) or rootPath (fix #390)
    var url = (csConfig.shareBaseUrl || $rootScope.rootPath) + $state.href('app.wot_identity', {pubkey: $scope.formData.pubkey, uid: $scope.formData.name || $scope.formData.uid});

    // Override default position, is small screen - fix #545
    if (UIUtils.screen.isSmall()) {
      event = angular.element(document.querySelector('#wallet-share-anchor')) || event;
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

  $scope.showSelectWalletPopover = function(event) {
    return csPopovers.showSelectWallet(event, {
        scope: $scope
      })
      .then(function(newWallet) {
        if (!newWallet || newWallet.id === wallet.id) return;
        if (newWallet.isDefault()) {
          return $state.go('app.view_wallet');
        }
        return $state.go('app.view_wallet_by_id', {id: newWallet.id});
      });
  };

  // remove '?refresh' from the location URI
  $scope.cleanLocationHref = function(state) {
    if (state && state.stateParams && state.stateParams.refresh) {
      $timeout(function() {
        var stateParams = angular.copy(state.stateParams);
        delete stateParams.refresh;
        delete stateParams.id;
        $location.search(stateParams).replace();
      }, 300);
    }
  };
}


function WalletTxController($scope, $ionicPopover, $state, $timeout, $location,
                            UIUtils, Modals, csPopovers, BMA, csSettings, csCurrency, csWallet, csTx) {
  'ngInject';

  $scope.loading = true;
  $scope.settings = csSettings.data;
  $scope.listeners = [];

  var wallet;

  $scope.enter = function(e, state) {
    $scope.loading = $scope.loading || (state.stateParams && state.stateParams.refresh);
    $scope.enableSelectWallet = csWallet.children.count() > 0;
    if ($scope.loading) {

      wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
      if (!wallet) {
        UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
        return $scope.showHome();
      }

      $scope.cleanLocationHref(state);

      return $scope.load();
    }
    else {
      $scope.addListeners();
      // Make sure to display new pending (e.g. sending using another screen button)
      $timeout($scope.updateView, 300);
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.leave = function() {
    $scope.removeListeners();
  };
  $scope.$on('$ionicView.leave', $scope.leave);

  $scope.load = function() {
    if (!wallet) return;

    var options = {
      minData: !wallet.isDataLoaded({minData: true}),
      sources: true,
      tx: {
        enable: true
      }
    };

    return wallet.login(options)
      .then(function(walletData) {
        $scope.formData = walletData;
        $scope.loading = false; // very important, to avoid TX to be display before wallet.currentUd is loaded
        $scope.updateView();
        $scope.showFab('fab-transfer');
        $scope.showHelpTip();
        $scope.addListeners();
        UIUtils.loading.hide(); // loading could have be open (e.g. during login phase)
      })
      .catch(function(err){
        if (err == 'CANCELLED') {
          $scope.showHome();
        }
      });
  };

  // remove '?refresh' from the location URI
  $scope.cleanLocationHref = function(state) {
    if (state && state.stateParams && state.stateParams.refresh) {
      $timeout(function() {
        var stateParams = angular.copy(state.stateParams);
        delete stateParams.refresh;
        delete stateParams.id;
        $location.search(stateParams).replace();
      }, 300);
    }
  };

  // Update view
  $scope.updateView = function() {
    if (!$scope.formData || $scope.loading) return;
    $scope.$broadcast('$$rebind::' + 'balance'); // force rebind balance
    $scope.$broadcast('$$rebind::' + 'rebind'); // force rebind
    $scope.motion.show({selector: '.view-wallet-tx .item', ink: false});
  };

  $scope.downloadHistoryFile = function(options) {
    options = options || {};
    options.fromTime = options.fromTime || -1; // default: full history
    var pubkey = $scope.formData.pubkey;
    csTx.downloadHistoryFile(pubkey, options);
  };

  // Updating wallet data
  $scope.doUpdate = function(silent) {
    console.debug('[wallet] TX history reloading...');
    var options = {
      sources: true,
      tx:  {
        enable: true
      },
      api: false
    };
    return (silent ?
        // If silent: just refresh
        wallet.refreshData(options) :
        // If not silent: show/hide loading indicator
        UIUtils.loading.show()
          .then(function() {
            return wallet.refreshData(options);
          })
          .then(UIUtils.loading.hide)
      )
      .then($scope.updateView)
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  /* -- add listeners -- */

  $scope.addListeners = function() {
    $scope.listeners = [
      // Reload if wallet balanced changed
      wallet.api.data.on.balanceChanged($scope, $scope.updateView),
      // Reload if useRelative changed
      $scope.$watch('settings.useRelative', $scope.updateView, true),
      // Reload if showUDHistory changed
      $scope.$watch('settings.showUDHistory', function(newVal, oldVal) {
        if (!$scope.formData || $scope.loading || (newVal === oldVal)) return;
        $scope.doUpdate();
      }, true)
    ];

    // Listening new block (if auto refresh enable)
    if ($scope.settings.walletHistoryAutoRefresh) {
      $scope.listeners.push(
        csCurrency.api.data.on.newBlock($scope, function(block) {
          if ($scope.loading) return;
          console.debug("[wallet] Received new block. Will reload history.");
          $timeout(function() {
            $scope.doUpdate(true);
          }, 500/*waiting for block propagation*/);
        })
      );
    }
  };

  $scope.removeListeners = function() {
    _.forEach($scope.listeners, function(remove){
      remove();
    });
    $scope.listeners = [];
  };

  /* -- popup / UI -- */

  // Transfer
  $scope.showTransferModal = function() {
    var hasCredit = (!!$scope.formData.balance && $scope.formData.balance > 0);
    if (!hasCredit && !csWallet.children.count()) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    return Modals.showTransfer();
  };

  $scope.showHelpTip = function(index, isTour) {
    // TODO
  };

  $scope.showTxErrors = function(event) {
    if (wallet.isDefault()) {
      return $scope.goState('app.view_wallet_tx_errors');
    }
    return $scope.goState('app.view_wallet_tx_errors_by_id', {id: wallet.id});
  };

  $scope.showMoreTx = function(fromTime) {

    fromTime = fromTime ||
      ($scope.formData.tx.fromTime - csSettings.data.walletHistoryTimeSecond) ||
      (Math.trunc(new Date().getTime() / 1000) - 2 * csSettings.data.walletHistoryTimeSecond);

    UIUtils.loading.show();
    return csWallet.refreshData({tx: {enable: true,fromTime: fromTime}})
      .then(function() {
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
          UIUtils.onError('ERROR.REFRESH_WALLET_DATA')(err);
        }
      });
  };

  $scope.showSelectWalletModal = function() {
    if (!$scope.enableSelectWallet) return;

    return Modals.showSelectWallet({
      showDefault: true,
      showBalance: false
    })
    .then(function(newWallet) {
      if (!newWallet || wallet && newWallet.id === wallet.id) return;
      $scope.removeListeners();
      $scope.loading = true;
      wallet = newWallet;
      console.debug("[transfer] Using {" + wallet.id + "} wallet");
      $scope.formData = {};
      return $scope.load();
    });
  };

  /* -- popover -- */

  var paddingIndent = 10;

  $scope.toUnlockUIArray = function(unlockTreeItem, leftPadding, operator) {
    leftPadding = leftPadding || 0;

    // If operator (AND, OR)
    if (unlockTreeItem.children && (unlockTreeItem.type == 'AND' || unlockTreeItem.type == 'OR')) {
      return unlockTreeItem.children.reduce(function(res, child, index){
        if (child.children && index > 0) {
          // Add space between expression block
          res = res.concat({
            style: {
              'padding-left': leftPadding + 'px',
              'padding-top': '10px',
              'padding-bottom': '10px'
            },
            operator: unlockTreeItem.type
          });

          return res.concat($scope.toUnlockUIArray(child, leftPadding + paddingIndent));
        }
        return res.concat($scope.toUnlockUIArray(child, leftPadding + paddingIndent, index && unlockTreeItem.type));
      }, []);
    }

    return {
      style: {
        'padding-left': leftPadding + 'px'
      },
      operator: operator,
      type: unlockTreeItem.type,
      value: unlockTreeItem.value
    };
  };

  $scope.showLockedOutputsPopover = function(tx, event) {
    if (!tx.lockedOutputs) return;

    // Convert condition into UI array
    $scope.popoverData = $scope.popoverData || {};
    $scope.popoverData.lockedOuputs = tx.lockedOutputs.reduce(function(res, lockedOutput){
      return res.concat({
        amount: lockedOutput.amount,
        unlockFunctions: lockedOutput.unlockFunctions,
        unlockConditions: $scope.toUnlockUIArray(lockedOutput.unlockTree)
      });
    }, []);

    // Open popover
    if (!$scope.lockedOutputsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wallet/tx_locked_outputs_popover.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.lockedOutputsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.lockedOutputsPopover.remove();
        });
        $scope.lockedOutputsPopover.show(event);
      });
    }
    else {
      $scope.lockedOutputsPopover.show(event);
    }
  };

  $scope.hideLockedOutputsPopover = function() {
    if ($scope.lockedOutputsPopover) {
      $scope.lockedOutputsPopover.hide();
      if ($scope.popoverData) {
        delete $scope.popoverData.unlockConditions;
      }
    }
  };

  $scope.showSelectWalletPopover = function(event) {
    return csPopovers.showSelectWallet(event, {
      scope: $scope
    })
      .then(function(newWallet) {
        if (!newWallet || newWallet.id === wallet.id) return;
        if (newWallet.isDefault()) {
          return $scope.goState('app.view_wallet_tx');
        }
        return $scope.goState('app.view_wallet_tx_by_id', {id: newWallet.id});
      });
  };

  $scope.goState = function(stateName, stateParams) {
    $scope.hideLockedOutputsPopover();
    return $state.go(stateName, stateParams);
  };
}

function WalletTxErrorController($scope, UIUtils, csSettings, csWallet) {
  'ngInject';

  var wallet;
  $scope.settings = csSettings.data;
  $scope.loading = true;
  $scope.formData = {};

  $scope.$on('$ionicView.enter', function(e, state) {

    wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
    if (!wallet) {
      UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
      return $scope.showHome();
    }

    return $scope.load();
  });

  $scope.load = function() {
    if (!wallet) return;

    return wallet.login()
      .then(function(walletData) {
        $scope.formData = walletData;
        $scope.loading = false;
        $scope.doMotion();
        //$scope.showFab('fab-redo-transfer');
        UIUtils.loading.hide();
      });
  };

  // Updating wallet data
  $scope.doUpdate = function(silent) {

    $scope.loading = true;
    return (silent ?
        wallet.refreshData() :
        UIUtils.loading.show()
          .then(csWallet.refreshData)
          .then(UIUtils.loading.hide)
      )
      .then(function() {
        $scope.doMotion();
        $scope.loading = false;
      })
      .catch(function(err) {
        UIUtils.onError('ERROR.REFRESH_WALLET_DATA')(err);
        $scope.loading = false;
      });
  };

  $scope.filterReceivedTx = function(tx){
    return tx.amount && tx.amount > 0;
  };

  $scope.filterSentTx = function(tx){
    return tx.amount && tx.amount < 0;
  };

  $scope.hasReceivedTx = function(){
    return $scope.formData.tx && !!_($scope.formData.tx.errors || []).find($scope.filterReceivedTx);
  };

  $scope.hasSentTx = function(){
    return $scope.formData.tx && !!_($scope.formData.tx.errors || []).find($scope.filterSentTx);
  };

}

function WalletSecurityModalController($scope, UIUtils, csWallet, $translate, parameters){

  var wallet = parameters && parameters.wallet || csWallet;

  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.isLastSlide = false;
  $scope.smallscreen = UIUtils.screen.isSmall();

  $scope.recover = {};
  $scope.isValidFile = false;


  $scope.login = wallet.isLogin();
  $scope.hasSelf = wallet.hasSelf();
  $scope.needSelf = $scope.login && wallet.data.requirements.needSelf;
  $scope.canRevoke = $scope.login && $scope.hasSelf && !wallet.data.requirements.revoked;
  $scope.needMembership = $scope.login && wallet.data.requirements.needMembership;
  $scope.option = $scope.login ? 'saveID' : 'recoverID';

  $scope.formData = {
    addQuestion: '',
    level: '4',
    questions : []
  };
  var questions = [];
  for (var i = 1; i<20; i++) {
    questions.push('ACCOUNT.SECURITY.QUESTION_' + i.toString());
  }
  $translate(questions)
    .then(function(translations){
      _.each(translations, function(translation){
        $scope.formData.questions.push({value: translation , checked: false});
      });
    });


  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = false;

  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = ($scope.slides.slider.activeIndex === 3 && ($scope.option == "saveID" || $scope.option == "recoverID")) || ($scope.slides.slider.activeIndex === 2 && $scope.option == "revocation");
  };


  $scope.doNext = function(formName) {
    if (!formName) {
      switch ($scope.slides.slider.activeIndex) {
        case 1:
          switch ($scope.option) {
            case "saveID":
              formName = "questionsForm";
              break;
            case "recoverID":
              if ($scope.isValidFile) {
                $scope.slideNext();
                $scope.hasContent = false;
                $scope.fileData = '';

              }
              else {
                UIUtils.alert.error("ERROR.NOT_VALID_SAVE_ID_FILE", "ERROR.LOAD_FILE_FAILED");
              }
              break;
          }
          break;

        case 2:
          switch ($scope.option) {
            case "recoverID":
              formName = "recoverForm";
              break;
            case "saveID":
              formName = "answersForm";
              break;
          }
      }
    }

    if (formName) {
      $scope[formName].$submitted = true;
      if (!$scope[formName].$valid) {
        return;
      }
      switch (formName) {
        case "recoverForm":
          $scope.recoverId();
          break;
        case "answersForm":
          $scope.downloadSaveIDFile();
          break;
        default:
          $scope.slideNext();
      }
    }
  };

  $scope.selectOption = function(option){
    $scope.option = option;
    $scope.slideNext();
  };

  $scope.restore = function(){
    if ($scope.slides.slider.activeIndex === 1 && $scope.option === 'saveID') {
      $scope.formData = {
        addQuestion: '',
        level: '4',
        questions: []
      };
      $translate(questions)
        .then(function (translations) {
          _.each(translations, function (translation) {
            $scope.formData.questions.push({value: translation, checked: false});
          });
        });
    }

    else if ($scope.slides.slider.activeIndex === 2 && $scope.option === 'saveID') {
      _.each($scope.formData.questions, function(question){
        question.answer = undefined;
      });
    }

    else if ($scope.slides.slider.activeIndex === 1 && $scope.option === 'recoverID'){
      $scope.hasContent = false;
      $scope.recover = {};
      $scope.fileData =  '';
      $scope.isValidFile = false;
    }

    else if ($scope.slides.slider.activeIndex === 2 && $scope.option === 'recoverID'){
      _.each($scope.recover.questions, function(element){
        element.answer = undefined;
      });
    }

    else if ($scope.slides.slider.activeIndex === 2 && $scope.option === 'revocation'){
      $scope.isValidFile = false;
      $scope.hasContent = false;
      $scope.revocation = undefined;
    }
  };

  /**
   * Recover Id
   */

  $scope.recoverContent = function(file) {
    $scope.hasContent = angular.isDefined(file) && file !== '';
    $scope.fileData = file.fileData ? file.fileData : '';
    $scope.isValidFile = $scope.fileData !== '' && $scope.fileData.type == 'text/plain';

    if ($scope.isValidFile && $scope.option === 'recoverID') {
      $scope.content = file.fileContent.split('\n');
      var indexOfQuestions = _.indexOf($scope.content, 'Questions: ');
      var LastIndexQuestions = -1;
      _.each($scope.content, function (element, index) {
        if (/^Issuer:/.test(element)) {
          LastIndexQuestions = index;
        }
        else if (/^Crypted-Nonce:/.test(element)) {
          $scope.recover.cypherNonce = element.split(' ')[1];
        }
        else if (/^Crypted-Pubkey:/.test(element)) {
          $scope.recover.cypherPubkey = element.split(' ')[1];
        }
        else if (/^Crypted-Salt:/.test(element)) {
          $scope.recover.cypherSalt = element.split(' ')[1];
        }
        else if (/^Crypted-Pwd:/.test(element)) {
          $scope.recover.cypherPwd = element.split(' ')[1];
        }
      });
      $scope.recover.questions = [];
      for (var i = indexOfQuestions + 1; i < LastIndexQuestions; i++) {
        $scope.recover.questions.push({value: $scope.content[i]});
      }
    }
    else if ($scope.isValidFile && $scope.option === "revocation"){
      $scope.revocation = file.fileContent;
    }
  };

  $scope.recoverId = function(){
    if(!$scope.recoverForm.$valid){
      return;
    }

    $scope.recover.answer = '';
    _.each($scope.recover.questions, function(element){
      $scope.recover.answer += element.answer;
    });

    return wallet.recoverId($scope.recover)
      .then(function (recover){
        if (angular.isDefined(recover)) {
          $scope.recover = recover;
          $scope.slideNext();
        }
        else {
          UIUtils.alert.error('ERROR.RECOVER_ID_FAILED');
        }
      });

  };

  /**
   * Save Id
   */
  $scope.addQuestion = function(){
    if ($scope.formData.addQuestion !== '') {
      $scope.formData.questions.push({value: $scope.formData.addQuestion, checked: true});
      $scope.formData.addQuestion = '';
    }
  };

  $scope.downloadSaveIDFile = function(){
    // Force user re-auth
    var loginData;
    return wallet.auth({
        forceAuth: true,
        expectedPubkey: $scope.pubkey,
        silent: true,
        success: function(values) {
          loginData = values;
        }
      })
      .catch(function(err) {
        if (err && err == 'CANCELLED') return;
        UIUtils.alert.error('ERROR.SALT_OR_PASSWORD_NOT_CONFIRMED', 'ERROR.LOGIN_FAILED');
        return;
      })
      .then(function(res) {
        if (!res) return;
        var file = {
          file: _.filter($scope.formData.questions, function (question) {
            return question.checked;
          })
        };
        var record = {
          salt: loginData.username,
          pwd: loginData.password,
          questions: '',
          answer: ''
        };
        _.each(file.file, function (question) {
          record.questions += question.value + '\n';
          record.answer += question.answer;
        });

        return wallet.getCryptedId(record)
          .then(function(record){
            wallet.downloadSaveId(record);
            $scope.closeModal();
          });
      })
      ;
  };

  $scope.isRequired = function(){
    var questionChecked = _.filter($scope.formData.questions, function(question) {
      return question.checked;
    });
    return questionChecked.length < $scope.formData.level;
  };

  $scope.revokeWithFile = function(){
    if ($scope.isValidFile) {
        $scope.revokeIdentity();
      }
      else {
        UIUtils.alert.error("ERROR.NOT_VALID_REVOCATION_FILE", "ERROR.LOAD_FILE_FAILED");
      }
  };

  /**
   * Download revocation file
   */
  $scope.downloadRevokeFile = function () {
    // Force re-authentication
    return wallet.auth({forceAuth: true})

      // Download file
      .then(function() {
        return wallet.downloadRevocation();
      })

      .then(function() {
        UIUtils.loading.hide();
      })

      .catch(function(err){
        if (err && err == 'CANCELLED') return;
        UIUtils.onError('ERROR.DOWNLOAD_REVOCATION_FAILED')(err);
      })
      ;

  };

  /**
   * Revoke wallet identity
   */
  $scope.revokeWalletIdentity = function () {
    if (!$scope.hasSelf) {
      return UIUtils.alert.error("ERROR.ONLY_SELF_CAN_EXECUTE_THIS_ACTION");
    }

    // Make sure user re-auth
    return wallet.auth({forceAuth: true})
      .then(function(confirm) {
        UIUtils.loading.hide();
        if (!confirm) return;
        return $scope.revokeIdentity();
      })
      .catch(function (err) {
        if (err == 'CANCELLED') return;
        UIUtils.onError('ERROR.REVOCATION_FAILED')(err);
      });
  };

  /**
   * Revoke identity
   */
  $scope.revokeIdentity = function (confirm) {

    // Make sure user re-auth + confirm
    if (!confirm) {
        return UIUtils.alert.confirm("CONFIRM.REVOKE_IDENTITY", 'CONFIRM.POPUP_WARNING_TITLE', {
          cssClass: 'warning',
          okText: 'COMMON.BTN_YES',
          okType: 'button-assertive'
        })
        .then(function (confirm) {
          if (!confirm) return;
          return UIUtils.alert.confirm("CONFIRM.REVOKE_IDENTITY_2", 'CONFIRM.POPUP_TITLE', {
            cssClass: 'warning',
            okText: 'COMMON.BTN_YES',
            okType: 'button-assertive'
          });
        })
        .then(function (confirm) {
          if (confirm) $scope.revokeIdentity(true, true); // loop with confirmation
        });
    }

    return UIUtils.loading.show()
      .then(function () {
        if (!$scope.revocation){
          return wallet.revoke();
        }
        else {
          return wallet.revokeWithFile($scope.revocation);
        }
      })
      .then(function () {
        UIUtils.toast.show("INFO.REVOCATION_SENT");
        $scope.closeModal();
        return UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('ERROR.REVOCATION_FAILED'));
  };


  /**
   * Ask self (= send identity)
   */
  $scope.self = function () {
    return $scope.closeModal('self');
  };

  /**
   * Ask membership in
   */
  $scope.membershipIn = function () {
    return $scope.closeModal('membershipIn');
  };

  /**
   * Generate keyfile
   */
  $scope.downloadKeyFile = function (format) {
    // Force re-authentication
    return wallet.auth({forceAuth: true})

    // Download file
      .then(function() {
        return wallet.downloadKeyFile(format);
      })

      .then(function() {
        UIUtils.loading.hide();
        return $scope.closeModal();
      })

      .catch(function(err){
        if (err && err == 'CANCELLED') return;
        UIUtils.onError('ERROR.DOWNLOAD_KEYFILE_FAILED')(err);
      })
      ;
  };
}

function WalletListController($scope, $controller, $state, $timeout, $q, $translate, $ionicPopover, $ionicPopup,
                              UIUtils, Modals, csCurrency, csSettings, csWallet){
  'ngInject';

  $scope.settings = csSettings.data;
  $scope.listeners = [];


  // Initialize the super class and extend it.
  angular.extend(this, $controller('WalletSelectModalCtrl', {$scope: $scope, parameters: {}}));

  // Override defaults
  $scope.formData.name = undefined;
  $scope.motion = UIUtils.motion.default;

  $scope.enter = function(e, state) {
    // First enter
    if ($scope.loading) {
      $scope.setParameters({
        showDefault: false,
        showBalance: true
      });

      return $scope.load()
        .then(function() {
          UIUtils.loading.hide();
          if (!$scope.wallets) return; // user cancel
          $scope.addListeners();
          $scope.showFab('fab-add-wallet');
        });
    }
    else {
      $scope.addListeners();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.leave = function() {
    $scope.removeListeners();
  };
  $scope.$on('$ionicView.leave', $scope.leave);

  $scope.cancel = function() {
    $scope.showHome();
  };

  $scope.select = function(event, wallet) {
    if (event.isDefaultPrevented()) return;

    $state.go('app.view_wallet_by_id', {id: wallet.id});
  };


  $scope.editWallet = function(event, wallet) {

    event.preventDefault();

    return $scope.showEditPopup(wallet)
      .then(function(newName) {
        if (!newName) return;

        // Save changes
        return csWallet.auth({minData: true})
          .then(function() {
            wallet.data.localName = newName;
            csWallet.storeData();
            UIUtils.loading.hide();
            $scope.updateView();
          })
          .catch(function(err) {
            if (err === 'CANCELLED') {
              return UIUtils.loading.hide();
            }
            UIUtils.onError('ERROR.SAVE_WALLET_LIST_FAILED')(err);
          });
      });
  };

  /* -- modals -- */

  $scope.showNewWalletModal = function() {

    var walletId = csWallet.children.count() + 1;
    var wallet = csWallet.instance(walletId);
    return wallet.login({
      showNewAccountLink: false,
      title: 'ACCOUNT.WALLET_LIST.BTN_NEW',
      okText: 'COMMON.BTN_ADD',
      // Load data options :
      minData: true,
      sources: true,
      api: false,
      success: UIUtils.loading.show
    })
    .then(function(walletData) {
      if (!walletData) return;

      // Avoid to add main wallet again
      if (walletData.pubkey === csWallet.data.pubkey) {
        UIUtils.loading.hide();
        UIUtils.alert.error('ERROR.COULD_NOT_ADD_MAIN_WALLET');
        return;
      }

      // Make sure to auth on the main wallet
      return csWallet.auth({minData: true})
        .then(function() {
          return csWallet.api.data.raisePromise.load(wallet.data)
          // continue, when plugins extension failed (just log in console)
            .catch(console.error)
            .then(function() {
              $scope.listeners.push(wallet.api.data.on.unauth($scope, $scope.updateView));
              $scope.listeners.push(wallet.api.data.on.auth($scope, $scope.updateView));
              csWallet.children.add(wallet);
              UIUtils.loading.hide();
              $scope.updateView();
            });
        })
        .catch(function(err) {
          if (err === 'CANCELLED') {
            return UIUtils.loading.hide();
          }
          UIUtils.onError('ERROR.ADD_SECONDARY_WALLET_FAILED')(err);
        });
    });
  };

  $scope.selectAndRemoveWallet = function() {
    $scope.hideActionsPopover();
    return Modals.showSelectWallet({
        wallets: $scope.wallets,
        showDefault: false
      })
      .then(function(wallet) {
        if (!wallet || !wallet.id) return;

        // Make sure to auth on the main wallet
        return csWallet.auth({minData: true})
          .then(function() {
            csWallet.children.remove(wallet.id);
            UIUtils.loading.hide();
            $scope.updateView();
          })
          .catch(function(err) {
            if (err === 'CANCELLED') {
              return UIUtils.loading.hide();
            }
            UIUtils.onError('ERROR.ADD_SECONDARY_WALLET_FAILED')(err);
          });
      });
  };

  /* -- popups -- */

  $scope.setEditForm = function(editForm) {
    $scope.editForm = editForm;
  };

  $scope.showEditPopup = function(wallet) {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.WALLET_LIST.EDIT_POPOVER.TITLE', 'ACCOUNT.WALLET_LIST.EDIT_POPOVER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          $scope.formData.name = wallet.data.name ||  wallet.data.uid || wallet.data.pubkey.substring(0, 8);

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/wallet/list/popup_edit_name.html',
            title: translations['ACCOUNT.WALLET_LIST.EDIT_POPOVER.TITLE'],
            subTitle: translations['ACCOUNT.WALLET_LIST.EDIT_POPOVER.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.editForm.$submitted=true;
                  if(!$scope.editForm.$valid || !$scope.formData.name) {
                    //don't allow the user to close unless he enters a name
                    e.preventDefault();
                  } else {
                    return $scope.formData.name;
                  }
                }
              }
            ]
          })
            .then(function(name) {
              if (!name) { // user cancel
                delete $scope.formData.name;
                UIUtils.loading.hide();
                return;
              }
              resolve(name);
            });
        });
    });
  };

  /* -- popovers -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wallet/list/popover_actions.html', {
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

  /* -- listeners -- */

  $scope.addListeners = function() {
    if (csSettings.data.walletHistoryAutoRefresh && $scope.wallets) {

      var listeners = [
        // Update on new block
        csCurrency.api.data.on.newBlock($scope, function(block) {
          if ($scope.loading) return;
          console.debug("[wallet-list] Received new block. Will reload list.");
          $timeout(function() {
            $scope.doUpdate(true);
          }, 300/*waiting for node cache propagation*/);
        })
      ];

      // Listen wallets changed
      $scope.listeners = $scope.wallets.reduce(function(res, wallet) {
        return res.concat([
          wallet.api.data.on.unauth($scope, $scope.updateView),
          wallet.api.data.on.auth($scope, $scope.updateView)
        ]);
      }, listeners);
    }
    else {
      $scope.listeners = [];
    }
  };

  $scope.removeListeners = function() {
    _.forEach($scope.listeners, function(remove){
      remove();
    });
    $scope.listeners = [];
  };

  var inheritedUpdateView = $scope.updateView;
  $scope.updateView = function() {
    inheritedUpdateView();
    $scope.$broadcast('$$rebind::' + 'rebind'); // force rebind
  };
}

function WalletSelectModalController($scope, $q, $timeout, UIUtils, filterTranslations, csSettings, csCurrency, csWallet, parameters){
  'ngInject';

  var loadWalletWaitTime = 500;
  $scope.loading = true;
  $scope.formData = {
    useRelative: csSettings.data.useRelative,
    showDefault: true,
    showBalance: false
  };
  $scope.motion = null; // no animation

  $scope.setParameters = function(parameters) {
    parameters = parameters || {};

    $scope.formData.useRelative = angular.isDefined(parameters.useRelative) ? parameters.useRelative : $scope.formData.useRelative;

    $scope.formData.showDefault = angular.isDefined(parameters.showDefault) ? parameters.showDefault : $scope.formData.showDefault;

    $scope.formData.showBalance = angular.isDefined(parameters.showBalance) ? parameters.showBalance : $scope.formData.showBalance;
  };

  $scope.load = function() {
    $scope.loading = true;

    // Load currency, and filter translations (need by 'formatAmount' filter)
    var jobs = [
      csCurrency.name()
        .then(function(name) {
          $scope.currency = name;
          return filterTranslations.ready();
        })
    ];

    // Get children wallets
    if (!$scope.wallets) {
      jobs.push(
        csWallet.children.all()
        .then(function(children) {
          $scope.wallets = $scope.formData.showDefault ? [csWallet].concat(children) : children;
        })
      );
    }

    // Prepare load options
    var options = {
      silent: true,
      minData: true,
      sources: $scope.formData.showBalance,
      tx: {
        enable: false
      },
      api: true
    };
    return $q.all(jobs)
      // Load wallet data (apply a timeout between each wallet)
      .then(function() {
        var counter = 0;
        return $q.all(
          $scope.wallets.reduce(function(res, wallet){
            return wallet.isDataLoaded(options) ?
              res : res.concat(
              $timeout(function(){
                return wallet.loadData(options);
              }, loadWalletWaitTime * counter++));
          }, [])
        );
      })
      .then(function() {
        $scope.loading = false;
        UIUtils.loading.hide();
        $scope.updateView();
      })
      .catch(function(err) {
        if (err && err === 'CANCELLED') {
          $scope.loading = true;
          $scope.cancel();
          throw err;
        }
        $scope.loading = false;
        UIUtils.onError('ERROR.LOAD_WALLET_LIST_FAILED')(err);
      });
  };
  $scope.$on('modal.shown', $scope.load);

  $scope.cancel = function() {
    $scope.closeModal();
  };

  $scope.select = function($event, wallet) {
    $scope.closeModal(wallet);
  };

  $scope.updateView = function() {
    if (!$scope.wallets.length) return;

    if ($scope.motion) {
      $scope.motion.show({selector: '.list .item.item-wallet', ink: true});
    }
    else {
      UIUtils.ink({selector: '.list .item.item-wallet'});
    }
  };

  $scope.doUpdate = function(silent) {
    if ($scope.loading || !$scope.wallets || !$scope.wallets.length) return $q.when();

    $scope.loading = !silent;

    var options = {
      silent: true,
      sources: $scope.formData.showBalance,
      tx: {
        enable: false
      },
      api: true
    };
    return $q.all($scope.wallets.reduce(function(res, wallet, counter) {
        return res.concat(
          $timeout(function(){
            return wallet.refreshData(angular.merge({
              requirements: wallet.requirements && (wallet.requirements.isMember || wallet.requirements.wasMember || wallet.requirements.pendingMembership)
            }, options));
          }, counter * loadWalletWaitTime));
      }, []))
      .then(function() {
        $scope.loading = false;
        if (silent) {
          $scope.$broadcast('$$rebind::' + 'rebind'); // force rebind
        }
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.loading = false;
        UIUtils.onError('ERROR.UPDATE_WALLET_LIST_FAILED')(err);
      });
  };

  // Default actions
  $scope.setParameters(parameters);

}

function PopoverWalletSelectModalController($scope, $controller, UIUtils) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('WalletSelectModalCtrl', {$scope: $scope, parameters: {
    showDefault: true,
    showBalance: false
  }}));

  // Disable list motion
  $scope.motion = null;

  $scope.$on('popover.shown', function() {
    if ($scope.loading) {
      $scope.load();
    }
  });

  $scope.updateView = function() {
    if (!$scope.wallets.length) return;

    UIUtils.ink({selector: '.popover-wallets .list .item'});
  };

  $scope.select = function($event, wallet) {
    if ($event.preventDefault() || !wallet) return; // no selection
    $scope.closePopover(wallet);
  };
}
