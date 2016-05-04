angular.module('cesium.transfer.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('app.new_transfer', {
        url: "/transfer",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey_uid', {
        url: "/transfer/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey', {
        url: "/transfer/:pubkey",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })
    ;
  })

  .controller('TransferCtrl', TransferController)
;

function TransferController($scope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, System) {

  TransferModalController.call(this, $scope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, System);

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!!$state.stateParams && !!$state.stateParams.pubkey) {
      $scope.formData.destPub = $state.stateParams.pubkey;
      if (!!$state.stateParams.uid) {
        $scope.dest = $state.stateParams.uid;
      }
      else {
        $scope.dest = $scope.destPub;
      }
    }

    $scope.loadWallet()
    .then(function(walletData) {
      $scope.walletData = walletData;
      $scope.formData.useRelative = walletData.settings.useRelative;
      $scope.onUseRelativeChanged();
      UIUtils.loading.hide();
    });
  });
}

function TransferModalController($scope, $ionicModal, $state, BMA, Wallet, UIUtils, $timeout, System) {

  $scope.walletData = {};
  $scope.transferForm = {};
  $scope.convertedBalance = 0;
  $scope.formData = {
    destPub: null,
    amount: null,
    comments: null,
    useRelative: Wallet.defaultSettings.useRelative
  };
  $scope.dest = null;
  $scope.udAmount = null;

  WotLookupController.call(this, $scope, BMA, $state, UIUtils, $timeout, System);

  // Create the login modal that we will use later
  $ionicModal.fromTemplateUrl('templates/wallet/modal_transfer.html', {
    scope: $scope,
    focusFirstInput: true
  }).then(function(modal) {
    $scope.transferModal = modal;
    $scope.transferModal.hide();

    UIUtils.ink({selector: '.ink'});
  });

  $ionicModal.fromTemplateUrl('templates/wot/modal_lookup.html', {
      scope: $scope,
      focusFirstInput: true
  }).then(function(modal) {
    $scope.lookupModal = modal;
    $scope.lookupModal.hide();
  });

  //Cleanup the modal when we're done with it!
  $scope.$on('$destroy', function() {
    if (!!$scope.transferModal) {
      $scope.transferModal.remove();
    }
    if (!!$scope.lookupModal) {
      $scope.lookupModal.remove();
    }
  });

  $scope.setTransferForm = function(transferForm) {
    $scope.transferForm = transferForm;
  };

  // Open transfer modal
  $scope.transfer = function(destPub, dest, amount, callback) {
    UIUtils.loading.show();
    if (!!$scope.transferModal) {
      $scope.formData.destPub = destPub;
      if(dest) {
        $scope.dest = dest;
      }
      else {
        $scope.dest = destPub;
      }
      if (amount && typeof amount === "function") {
        callback = amount;
      }
      else {
        $scope.formData.amount = amount;
      }
      $scope.formData.callback = callback;
      $scope.loadWallet()
        .then(function(walletData) {
          UIUtils.loading.hide();
          $scope.walletData = walletData;
          $scope.formData.useRelative = walletData.settings.useRelative;
          $scope.transferModal.show();
        });
    }
    else{
      $timeout($scope.transfer, 2000);
    }
  };

  // Triggered in the login modal to close it
  $scope.closeTransfer = function() {
    $scope.formData = {}; // Reset login data
    $scope.transferForm.$setPristine(); // Reset form
    $scope.transferModal.hide();
  };

  // When changing use relative UD
  $scope.onUseRelativeChanged = function() {
    if ($scope.formData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance / $scope.walletData.currentUD;
      $scope.udAmount = $scope.amount * $scope.walletData.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.walletData.currency;
    } else {
      $scope.convertedBalance = $scope.walletData.balance;
      // Convert to number
      $scope.formData.amount = (!!$scope.formData.amount && typeof $scope.formData.amount == "string") ?
          Math.floor(parseFloat($scope.formData.amount.replace(new RegExp('[,]'), '.'))) :
          $scope.formData.amount;
      // Compute UD
      $scope.udAmount = (!!$scope.formData.amount &&
        typeof $scope.formData.amount == "number" &&
        !!$scope.walletData.currentUD &&
        typeof $scope.walletData.currentUD == "number") ?
          $scope.formData.amount / $scope.walletData.currentUD :null;
      $scope.unit = $scope.walletData.currency;
      $scope.udUnit = '';
    }
  };
  $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged, true);
  $scope.$watch('walletData.balance', $scope.onUseRelativeChanged, true);

  $scope.openWotLookup = function() {
    $scope.lookupModal.show();
  };

  $scope.doTransfer = function() {
    UIUtils.loading.show();

    var amount = $scope.formData.amount;
    if ($scope.formData.useRelative && !!amount &&
        typeof amount == "string") {
      amount = $scope.walletData.currentUD *
               amount.replace(new RegExp('[.,]'), '.');
    }

    Wallet.transfer($scope.formData.destPub, amount, $scope.formData.comments)
    .then(function() {
       var callback = $scope.formData.callback;
        $scope.formData = {}; // Reset form data
        $scope.transferForm.$setPristine(); // Reset form
        $scope.closeTransfer();
        if (!!callback) {
          callback();
        }
        // Default: redirect to wallet view
        else {
          UIUtils.loading.hide();
          UIUtils.alert.info('INFO.TRANSFER_SENT');
          $state.go('app.view_wallet');
        }
    })
    .catch(UIUtils.onError('ERROR.SEND_TX_FAILED'));
  };

  $scope.closeLookup = function() {
    $scope.lookupModal.hide();
  };

  $scope.doSelectIdentity = function(pub, uid) {
    if (uid) {
        $scope.dest = uid;
    }
    else {
        $scope.dest = pub;
    }
    $scope.formData.destPub = pub;
    $scope.lookupModal.hide();
  };
}

