
angular.module('cesium.wallet.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.view_wallet', {
        url: "/wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet.html",
            controller: 'WalletCtrl'
          }
        }
      })

      .state('app.view_wallet_tx_errors', {
        url: "/wallet/tx/errors",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx_error.html",
            controller: 'WalletTxErrorCtrl'
          }
        }
      })
    ;
  })

  .controller('WalletCtrl', WalletController)

  .controller('WalletTxErrorCtrl', WalletTxErrorController)
;

function WalletController($scope, $q, $ionicPopup, $timeout, $state, $ionicHistory, screenmatch,
  UIUtils, Wallet, $translate, $ionicPopover, Modals, csSettings, BMA) {
  'ngInject';

  $scope.walletData = null;
  $scope.convertedBalance = null;
  $scope.hasCredit = false;
  $scope.showDetails = false;
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function() {
    $scope.loadWallet()
      .then(function(walletData) {
        $scope.walletData = walletData;
        $scope.updateView();
        $scope.loading=false;
        $scope.showFab('fab-transfer');
        $scope.showQRCode('qrcode', walletData.pubkey, 1100);
        UIUtils.loading.hide(); // loading could have be open (e.g. new account)
      })
      .catch(function(err){
        if ('CANCELLED' === err) {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.home');
        }
      });
  });

  $ionicPopover.fromTemplateUrl('templates/wallet/popover_actions.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.actionsPopover = popover;
  });

  //Cleanup the popover when we're done with it!
  $scope.$on('$destroy', function() {
    $scope.actionsPopover.remove();
  });

  $scope.refreshConvertedBalance = function() {
    if (!$scope.walletData) {
      return;
    }
    if (csSettings.data.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance ? ($scope.walletData.balance / $scope.walletData.currentUD) : 0;
    } else {
      var balance = $scope.walletData.balance;
      if (!balance) {
        balance = 0;
      }
      $scope.convertedBalance = balance;
    }
  };
  csSettings.api.data.on.changed($scope, $scope.refreshConvertedBalance);
  $scope.$watch('walletData.balance', $scope.refreshConvertedBalance, true);

  // Update view
  $scope.updateView = function() {
    $scope.hasCredit = (!!$scope.walletData.balance && $scope.walletData.balance > 0);
    $scope.refreshConvertedBalance();
    // Set Motion
    $timeout(function() {
      UIUtils.motion.fadeSlideInRight();
      // Set Ink
      UIUtils.ink({selector: '.item'});
    }, 10);
  };

  $scope.setShowDetails = function(show) {
    $scope.showDetails = show;
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
    // Change QRcode visibility
    var qrcode = document.getElementById('qrcode');
    qrcode.classList.toggle('visible-xs', !show);
    qrcode.classList.toggle('visible-sm', !show);
  };

  // Transfer
  $scope.showTransferModal = function() {
    if (!$scope.hasCredit) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    Modals.showTransfer()
    .then(function(done){
      if (done) {
        UIUtils.alert.info('INFO.TRANSFER_SENT');
        // Set Motion
        $timeout(function() {
          UIUtils.motion.ripple({
            selector: '.item-pending'
          });
          // Set Ink
          UIUtils.ink({selector: '.item-pending'});
        }, 10);
      }
    });
  };

  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Ask uid
  $scope.showUidPopup = function() {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          $scope.walletData.newUid = (!!$scope.walletData.uid ? ''+$scope.walletData.uid : '');

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
                  if(!$scope.registerForm.$valid || !$scope.walletData.newUid) {
                    //don't allow the user to close unless he enters a uid
                    e.preventDefault();
                  } else {
                    return $scope.walletData.newUid;
                  }
                }
              }
            ]
          })
          .then(function(uid) {
            if (!uid) { // user cancel
              $scope.walletData.uid = null;
              UIUtils.loading.hide();
              return;
            }
            resolve(uid);
          });
        });
      });
  };

  // Send self identity
  $scope.self= function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }

    $scope.showUidPopup()
    .then(function(uid) {
      UIUtils.loading.show();

      Wallet.self(uid)
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

  // Send membership IN
  $scope.membershipIn= function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }

    var doMembershipIn = function(retryCount) {
      Wallet.membership.inside()
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        if (!retryCount || retryCount <= 2) {
          $timeout(function() {
            doMembershipIn(retryCount ? retryCount+1 : 1);
          }, 1000);
        }
        else {
          UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        }
      });
    };

    $scope.showUidPopup()
    .then(function (uid) {
      UIUtils.loading.show();
      // If uid changed, or selft blockUid not retrieve : do self() first
      if (!$scope.walletData.blockUid || uid != $scope.walletData.uid) {
        $scope.walletData.blockUid = null;
        $scope.walletData.uid = uid;
        Wallet.self(uid, false/*do NOT load membership here*/)
        .then(function() {
          doMembershipIn();
        })
        .catch(function(err){
          UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        });
      }
      else {
        doMembershipIn();
      }
    })
    .catch(function(err){
       UIUtils.loading.hide();
       UIUtils.alert.info(err);
       $scope.membershipIn(); // loop
    });
    //.catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED'));
  };

  // Send membership OUT
  $scope.membershipOut = function(confirm) {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }

    // Ask user confirmation
    if (!confirm) {
      return UIUtils.alert.confirm('CONFIRM.MEMBERSHIP_OUT')
      .then(function(confirm) {
        if (confirm) $scope.membershipOut(true); // loop with confirmation
      });
    }

    UIUtils.loading.show();
    return Wallet.membership.out()
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.toast.show('INFO.MEMBERSHIP_OUT_SENT');
    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_OUT_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    UIUtils.loading.show();
    return Wallet.refreshData()
    .then(function() {
      $scope.updateView();
      UIUtils.loading.hide();
    })
    .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  $scope.showQRCode = function(id, text, timeout) {
    if (!!$scope.qrcode) {
      return;
    }
    if (!timeout) {
      timeout = 1100;
    }
    $scope.qrcode = new QRCode(id, {
      text: text,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.L
    });
    $timeout(function () {
      var qrcodes = document.getElementsByClassName('qrcode');
      _.forEach(qrcodes, function(qrcode){
        if (qrcode.id == id) {
          qrcode.classList.toggle('on', true);
        }
      });
    }, timeout);
  };

  $scope.showCertifications = function() {
    $state.go(screenmatch.is('sm, xs') ? 'app.wallet_view_cert' : 'app.wallet_view_cert_lg', {
      pubkey: $scope.walletData.pubkey,
      uid: $scope.walletData.name || $scope.walletData.uid
    });
  };

  $scope.showSharePopover = function(event) {
    var title = $scope.walletData.name || $scope.walletData.uid || $scope.walletData.pubkey;
    var url = $state.href('app.wot_view_identity', {pubkey: $scope.walletData.pubkey, uid: $scope.walletData.name || $scope.walletData.uid}, {absolute: true});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'WOT.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        postMessage: title
      }
    });
  };

  $scope.showMoreTx = function(fromTime) {

    fromTime = fromTime ||
      ($scope.walletData.tx.fromTime - csSettings.data.walletHistoryTimeSecond) ||
      (Math.trunc(new Date().getTime() / 1000) - 2 * csSettings.data.walletHistoryTimeSecond);

    UIUtils.loading.show();
    return Wallet.refreshData({tx: {enable: true,fromTime: fromTime}})
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        // If http rest limitation: wait then retry
        if (err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
          $timeout(function() {
            return $scope.showMoreTx();
          }, 2000);
        }
        else {
          UIUtils.onError('ERROR.REFRESH_WALLET_DATA')(err);
        }
      });
  };

}


function WalletTxErrorController($scope, $timeout, UIUtils, Wallet) {
  'ngInject';

  $scope.walletData = null;

  $scope.$on('$ionicView.enter', function(e) {
    $scope.loadWallet()
      .then(function(walletData) {
        $scope.walletData = walletData;
        $scope.updateView();
        $scope.showFab('fab-redo-transfer');
        UIUtils.loading.hide();
      });
  });

  // Update view
  $scope.updateView = function() {
    // Set Motion
    $timeout(function() {
      UIUtils.motion.fadeSlideInRight();
      // Set Ink
      UIUtils.ink({selector: '.item'});
    }, 10);
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    UIUtils.loading.show();
    Wallet.refreshData()
    .then(function() {
      $scope.updateView();
      UIUtils.loading.hide();
    })
    .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  $scope.filterPositive = function(prop){
    return function(item){
      return item[prop] > 0;
    };
  };

  $scope.filterNegative = function(prop){
    return function(item){
      return item[prop] < 0;
    };
  };
}
