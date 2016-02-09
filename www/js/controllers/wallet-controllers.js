
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

      .state('app.view_transfer_uid', {
        url: "/transfer/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/account/view_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.view_transfer_pubkey', {
        url: "/transfer/:pubkey",
        views: {
          'menuContent': {
            templateUrl: "templates/account/view_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })
    ;
  })

  .controller('WalletCtrl', WalletController)

  .controller('TransferCtrl', TransferController)
;

function WalletController($scope, $state, $q, $ionicPopup, UIUtils, Wallet) {

  $scope.walletData = {};
  $scope.convertedBalance = 0;
  $scope.hasCredit = false;
  $scope.isMember = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
      .then(function(wallet) {
        $scope.updateWalletView(wallet);
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
    $state.go('app.view_transfer');
  };

  // Self cert
  $scope.self= function() {

    // Choose UID popup
    $ionicPopup.show({
      template: '<input type="text" ng-model="walletData.uid">',
      title: 'Enter a pseudo',
      subTitle: 'A pseudo is need to let other member find you.',
      scope: $scope,
      buttons: [
        { text: 'Cancel' },
        {
          text: '<b>Send</b>',
          type: 'button-positive',
          onTap: function(e) {
            if (!$scope.walletData.uid) {
              //don't allow the user to close unless he enters a uid
              e.preventDefault();
            } else {
              // TODO : check if not already used
              return $scope.walletData.uid;
            }
          }
        }
      ]
    })
    .then(function(uid) {
      UIUtils.loading.show();
      Wallet.self(uid)
      .then(function() {
        UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('Could not send self certification'));
    });

  };
}

function TransferController($scope, $ionicModal, $state, $ionicHistory, BMA, Wallet, UIUtils) {

  $scope.walletData = {};
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
      });
  });

  // When chaing use relative UD
  $scope.onUseRelativeChanged = function() {
    if ($scope.walletData.useRelative) {
      $scope.udAmount = $scope.amount * $scope.walletData.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.walletData.currency;
    } else {
      $scope.formData.amount = ($scope.formData.amount != "undefined" && $scope.formData.amount != null)
        ? Math.floor(parseFloat($scope.formData.amount.replace(new RegExp('[,]'), '.')))
        : null;
      $scope.udAmount = $scope.amount / $scope.walletData.currentUD;
      $scope.unit = $scope.walletData.currency;
      $scope.udUnit = '';
    }
  };
  $scope.$watch('walletData.useRelative', $scope.onUseRelativeChanged, true);

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
