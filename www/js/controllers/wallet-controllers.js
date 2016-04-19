
angular.module('cesium.wallet.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
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
    ;
  })

  .controller('WalletCtrl', WalletController)
;

function WalletController($scope, $state, $q, $ionicPopup, $ionicActionSheet, $timeout,
  ionicMaterialMotion, ionicMaterialInk,
  UIUtils, Wallet, BMA, $translate) {

  $scope.walletData = {};
  $scope.convertedBalance = 0;
  $scope.hasCredit = false;
  $scope.isMember = false;
  // Set Header
  $scope.$parent.showHeader();
  $scope.$parent.clearFabs();
  $scope.isExpanded = false;
  $scope.$parent.setExpanded(false);
  $scope.$parent.setHeaderFab(false);

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        $scope.updateWalletView(wallet);
        UIUtils.loading.hide();
      });
  });

  $scope.refreshConvertedBalance = function() {
    if ($scope.walletData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance ? ($scope.walletData.balance / $scope.walletData.currentUD) : 0;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.walletData.currency;
    } else {
      $scope.convertedBalance = $scope.walletData.balance;
      if (!$scope.convertedBalance) {
        $scope.convertedBalance = 0;
      }
      $scope.unit = $scope.walletData.currency;
      $scope.udUnit = '';
    }
  };
  $scope.$watch('walletData.useRelative', $scope.refreshConvertedBalance, true);
  $scope.$watch('walletData.balance', $scope.refreshConvertedBalance, true);

  // Update view
  $scope.updateWalletView = function(wallet) {
    $scope.walletData = wallet;
    $scope.hasCredit = (!!$scope.walletData.balance && $scope.walletData.balance > 0);
    if (!$scope.walletData.requirements || !$scope.walletData.requirements.uid) {
      $scope.needSelf = true;
      $scope.needMembership = true;
      $scope.needMembershipOut = false;
      $scope.needRenew = false;
    }
    else {
      $scope.needSelf = false;
      $scope.needMembership = ($scope.walletData.requirements.membershipExpiresIn === 0 &&
        $scope.walletData.requirements.membershipPendingExpiresIn <= 0 );
      $scope.needRenew = !$scope.needMembership && ($scope.walletData.requirements.membershipExpiresIn < 129600 &&
        $scope.walletData.requirements.membershipPendingExpiresIn <= 0 );
      $scope.needMembershipOut = ($scope.walletData.requirements.membershipExpiresIn > 0);
    }
    $scope.isMember = !$scope.needSelf && !$scope.needMembership;
    // Set Motion
    $timeout(function() {
        ionicMaterialMotion.fadeSlideInRight({
          startVelocity: 3000
        });
        // Set Ink
        ionicMaterialInk.displayEffect({selector: '.item'});
    }, 10);
  };

  // Transfer click
  $scope.openTransfer = function() {
    if (!$scope.hasCredit) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    $scope.transfer(null,null, function() {
      UIUtils.loading.hide();
      UIUtils.alert.info('INFO.TRANSFER_SENT');
    });
  };

  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Ask uid
  $scope.showUidPopup = function() {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_ADD_ACCOUNT', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/wallet/popup_register.html',
            title: translations['ACCOUNT.POPUP_REGISTER.TITLE'],
            subTitle: translations['ACCOUNT.POPUP_REGISTER.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_ADD_ACCOUNT'] /*'<b>Send</b>'*/,
                type: 'button-positive',
                onTap: function(e) {
                  $scope.registerForm.$submitted=true;
                  if(!$scope.registerForm.$valid || !$scope.walletData.uid) {
                    //don't allow the user to close unless he enters a uid
                    e.preventDefault();
                  } else {
                    return $scope.walletData.uid;
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
            UIUtils.loading.show();
            BMA.wot.lookup({ search: uid })
            .then(function(res) {
              var found = res.results &&
                  res.results.length > 0 &&
                  res.results.some(function(pub){
                    return pub.pubkey !== $scope.walletData.pubkey &&
                        pub.uids && pub.uids.length > 0 &&
                        pub.uids.some(function(idty){
                          return (idty.uid === uid);
                        });
                  });
              if (found) { // uid is already used : display a message and reopen the popup
                UIUtils.loading.hide();
                UIUtils.alert.info('ACCOUNT.NEW.MSG_UID_ALREADY_USED')
                .then(function(){
                  $scope.showUidPopup(); // loop
                });
              }
              else {
                resolve(uid);
              }
            })
            .catch(function() {
               resolve(uid);
            });
          });
        });
      });
  };

  // Send self identity
  $scope.self= function() {
    $scope.showUidPopup()
    .then(function(uid) {
      Wallet.self(uid)
      .then(function() {
        $scope.doUpdate();
      })
      .catch(UIUtils.onError('ERROR.SEND_IDENTITY_FAILED'));
    });
  };

  // Send membership IN
  $scope.membershipIn= function() {
    var doMembershipIn = function() {
    Wallet.membership(true)
    .then(function() {
        $scope.doUpdate();
      })
      .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED'));
    };

    $scope.showUidPopup()
    .then(function (uid) {
      UIUtils.loading.show();
      if (!$scope.walletData.blockUid) {
        Wallet.self(uid, false/*do NOT load membership here*/)
        .then(function() {
          doMembershipIn();
        })
        .catch(UIUtils.onError('ERROR.SEND_IDENTITY_FAILED'));
      }
      else {
        doMembershipIn();
      }

    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED'));
  };

  // Send membership IN
  $scope.membershipOut = function() {
    UIUtils.loading.show();
    Wallet.membership(false)
    .then(function() {
      $scope.doUpdate();
    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_OUT_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    UIUtils.loading.show();
    Wallet.refreshData()
    .then(function(wallet) {
      $scope.updateWalletView(wallet);
      UIUtils.loading.hide();
    })
    .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  // Triggered on a button click, or some other target
 $scope.showActionsheet = function() {

  $translate(['ACCOUNT.MENU_TITLE', 'ACCOUNT.BTN_MEMBERSHIP_OUT', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_ADD_ACCOUNT', 'COMMON.BTN_CANCEL'])
    .then(function (translations) {

      // Show the action sheet
      var hideMenu = $ionicActionSheet.show({
        buttons: [
          { text: translations['ACCOUNT.BTN_MEMBERSHIP_OUT'] }
        ],
        titleText: translations['ACCOUNT.MENU_TITLE'],
        cancelText: translations['COMMON.BTN_CANCEL'],
        cancel: function() {
            // add cancel code..
          },
        buttonClicked: function(index) {
          if (index === 0) {
            $scope.membershipOut();
          }
          return true;
        }
      });

      // For example's sake, hide the sheet after two seconds
      $timeout(function() {
        hideMenu();
      }, 2000);
    });
 };
}


