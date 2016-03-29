
angular.module('cesium.wallet.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('app.view_wallet', {
        url: "/wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/account/view_wallet.html",
            controller: 'WalletCtrl'
          }
        }
      })

      .state('app.new_transfer', {
        url: "/transfer/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/account/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey', {
        url: "/transfer/:pubkey",
        views: {
          'menuContent': {
            templateUrl: "templates/account/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })
    ;
  })

  .controller('WalletCtrl', WalletController)

  .controller('TransferCtrl', TransferController)
;

function WalletController($scope, $state, $q, $ionicPopup, UIUtils, Wallet, BMA, $translate) {

  $scope.walletData = {};
  $scope.convertedBalance = 0;
  $scope.hasCredit = false;
  $scope.isMember = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        $scope.updateWalletView(wallet);
        UIUtils.loading.hide();
      });
  });

  $scope.refreshConvertedBalance = function() {
    if ($scope.walletData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance / $scope.walletData.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.walletData.currency;
    } else {
      $scope.convertedBalance = $scope.walletData.balance;
      $scope.unit = $scope.walletData.currency;
      $scope.udUnit = '';
    }
  };
  $scope.$watch('walletData.useRelative', $scope.refreshConvertedBalance, true);
  $scope.$watch('walletData.balance', $scope.refreshConvertedBalance, true);

  // Update view
  $scope.updateWalletView = function(wallet) {
    $scope.walletData = wallet;
    $scope.hasCredit = ($scope.walletData.balance != "undefined" && $scope.walletData.balance > 0);
    $scope.isMember = ($scope.walletData.requirements != "undefined" && $scope.walletData.requirements != null
                      && $scope.walletData.requirements.uid != "undefined" && $scope.walletData.requirements.uid != null);
  };

  // Has credit
  $scope.hasCredit= function() {
    return $scope.balance > 0;
  };

  // Transfer click
  $scope.transfer= function() {
    $state.go('app.new_transfer');
  };

  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Self cert
  $scope.self= function() {

    $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_ADD_ACCOUNT', 'COMMON.BTN_CANCEL'])
      .then(function (translations) {

        // Choose UID popup
        $ionicPopup.show({
          templateUrl: 'templates/account/popup_register.html',
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
          var doSendSelf = function() {
            Wallet.self(uid)
              .then(function() {
                UIUtils.loading.hide();
              })
              .catch(UIUtils.onError('ERROR.SEND_SELF_REGISTRATION'));
          };
          // Check uid is not used by another member
          UIUtils.loading.show();
          BMA.wot.lookup({ search: uid })
          .then(function(res) {
            var found = typeof res.results != "undefined" && res.results != null && res.results.length > 0
                && res.results.some(function(pub){
                  return typeof pub.uids != "undefined" && pub.uids != null && pub.uids.length > 0
                      && pub.uids.some(function(idty){
                        return (idty.uid == uid);
                      });
                });
            if (found) { // uid is already used : display a message and reopen the popup
              UIUtils.loading.hide();
              UIUtils.alert.info('ACCOUNT.NEW.MSG_UID_ALREADY_USED')
              .then(function(){
                $scope.self();
              });
            }
            else {
              doSendSelf();
            }
          })
          .catch(function() {
             doSendSelf();
          });
        });
      });
  };
}

function TransferController($scope, $ionicModal, $state, $ionicHistory, BMA, Wallet, UIUtils) {

  $scope.walletData = {};
  $scope.convertedBalance = 0;
  $scope.formData = {
    destPub: null,
    amount: null,
    comments: null
  };
  $scope.dest = null;
  $scope.udAmount = null;

  WotLookupController.call(this, $scope, BMA, $state);

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams != null 
        && $state.stateParams.pubkey != null
        && $state.stateParams.pubkey != "undefined") {
      $scope.destPub = $state.stateParams.pubkey;
      if ($state.stateParams.uid != null
        && $state.stateParams.uid != "undefined") {
        $scope.dest = $state.stateParams.uid;
      }
      else {
        $scope.dest = $scope.destPub; 
      }
    }

    // Login and load wallet
    $scope.loadWallet()
      .then(function(walletData) {
        $scope.walletData = walletData;
        $scope.onUseRelativeChanged();
        UIUtils.loading.hide();
      });
  });

  // When chaing use relative UD
  $scope.onUseRelativeChanged = function() {
    if ($scope.walletData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance / $scope.walletData.currentUD;
      $scope.udAmount = $scope.amount * $scope.walletData.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.walletData.currency;
    } else {
      $scope.convertedBalance = $scope.walletData.balance;
      $scope.formData.amount = ($scope.formData.amount != "undefined" && $scope.formData.amount != null)
        ? Math.floor(parseFloat($scope.formData.amount.replace(new RegExp('[,]'), '.')))
        : null;
      $scope.udAmount = $scope.amount / $scope.walletData.currentUD;
      $scope.unit = $scope.walletData.currency;
      $scope.udUnit = '';
    }
  };
  $scope.$watch('walletData.useRelative', $scope.onUseRelativeChanged, true);
  $scope.$watch('walletData.balance', $scope.onUseRelativeChanged, true);

  $ionicModal.fromTemplateUrl('templates/wot/modal_lookup.html', {
      scope: $scope,
      focusFirstInput: true
  }).then(function(modal) {
    $scope.lookupModal = modal;
    $scope.lookupModal.hide();
  });

  $scope.openSearch = function() {
    $scope.lookupModal.show();
  }

  $scope.doTransfer = function() {
    UIUtils.loading.show();

    var amount = $scope.formData.amount;
    if ($scope.walletData.useRelative 
      && amount != "undefined" 
      && amount != null) {
      amount = $scope.walletData.currentUD 
               * amount.replace(new RegExp('[.,]'), '.');
    }

    Wallet.transfer($scope.formData.destPub, amount, $scope.formData.comments)
    .then(function() {
      UIUtils.loading.hide();
      $ionicHistory.goBack()
    })
    .catch(UIUtils.onError('Could not send transaction'));
  };

  $scope.closeLookup = function() {
    $scope.lookupModal.hide();
  }

  $scope.doSelectIdentity = function(pub, uid) {
    if (uid != "undefined" && uid != null) {
        $scope.dest = uid;
    }
    else {
        $scope.dest = uid;
    }
    $scope.formData.destPub = pub;
    $scope.lookupModal.hide();
  }
}
