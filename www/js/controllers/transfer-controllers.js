angular.module('cesium.transfer.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';
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

  .controller('TransferModalCtrl', TransferModalController)
;

function TransferController($scope, $rootScope, $state, BMA, Wallet, UIUtils, $timeout, Device, $ionicPopover, $translate, $filter, $q, Modals) {
  'ngInject';

  TransferModalController.call(this, $scope, $rootScope, $state, BMA, Wallet, UIUtils, $timeout, Device, $ionicPopover, $translate, $filter, $q, Modals);

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!!$state.stateParams && !!$state.stateParams.pubkey) {
      $scope.formData.destPub = $state.stateParams.pubkey;
      if (!!$state.stateParams.uid) {
        $scope.destUid = $state.stateParams.uid;
        $scope.destPub = '';
      }
      else {
        $scope.destUid = '';
        $scope.destPub = $scope.formData.destPub;
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

  $scope.cancel = function() {
    //TODO : go back ?
    alert('TODO : go back ?')
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

}

function TransferModalController($scope, $rootScope, $state, BMA, Wallet, UIUtils, $timeout, Device, $ionicPopover, $translate, $filter, $q, Modals, parameters) {
  'ngInject';

  $scope.walletData = $rootScope.walletData;
  $scope.convertedBalance = 0;
  $scope.formData = {
    destPub: null,
    amount: null,
    comment: null,
    useRelative: Wallet.defaultSettings.useRelative,
    useComment: false
  };
  $scope.udAmount = null;
  $scope.commentPattern = BMA.regex.COMMENT;

  if (parameters) {
    if (parameters.pubkey) {
      $scope.formData.destPub = parameters.pubkey;
    }
    if (parameters.uid) {
        $scope.destUid = parameters.uid;
        $scope.destPub = '';
    }
    else {
      $scope.destUid = '';
      $scope.destPub = parameters.pubkey;
    }
    if (parameters.amount) {
      $scope.formData.amount = parameters.amount;
    }
    if (parameters.comment) {
      $scope.formData.useComment=true;
      $scope.formData.comment = parameters.comment;
    }
  }

  $ionicPopover.fromTemplateUrl('templates/wallet/popover_unit.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.unitPopover = popover;
  });

  //Cleanup the modal when we're done with it!
  $scope.$on('$destroy', function() {
    if (!!$scope.unitPopover) {
      $scope.unitPopover.remove();
    }
  });


  $scope.cancel = function() {
    $scope.closeModal();
  };

  // When changing use relative UD
  $scope.onUseRelativeChanged = function() {
    $scope.unit = $scope.walletData.currency;
    if ($scope.formData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance / $scope.walletData.currentUD;
      $scope.udAmount = $scope.amount * $scope.walletData.currentUD;
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
    }
  };
  $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged, true);
  $scope.$watch('walletData.balance', $scope.onUseRelativeChanged, true);

  // When changing use comment
  $scope.onUseCommentChanged = function() {
    if (!$scope.formData.useComment) {
      $scope.formData.comment = null; // reset comment only when disable
    }
  };
  $scope.$watch('formData.useComment', $scope.onUseCommentChanged, true);

  $scope.showWotLookupModal = function() {
    Modals.showWotLookup()
    .then(function(result){
      if (result) {
        if (result.uid) {
            $scope.destUid = result.uid;
            $scope.destPub = '';
        }
        else {
            $scope.destUid = '';
            $scope.destPub = result.pubkey;
        }
        $scope.formData.destPub = result.pubkey;
      }
    });
  };

  $scope.doTransfer = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid || !$scope.formData.destPub) {
      return;
    }

    $scope.askTransferConfirm()
    .then(function(){
      UIUtils.loading.show();

      var amount = $scope.formData.amount;
      if ($scope.formData.useRelative && !!amount &&
          typeof amount == "string") {
        amount = $scope.walletData.currentUD *
                 amount.replace(new RegExp('[.,]'), '.');
      }

      Wallet.transfer($scope.formData.destPub, amount, $scope.formData.comment, $scope.formData.useRelative)
      .then(function() {
        UIUtils.loading.hide();
        $scope.closeModal(true);
      })
      .catch(UIUtils.onError('ERROR.SEND_TX_FAILED'));
    });
  };

  $scope.askTransferConfirm = function() {
    return $q(function(resolve, reject) {
      $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
      .then(function(translations){
        $translate('CONFIRM.TRANSFER', {
          from: $scope.walletData.isMember ? $scope.walletData.uid : $filter('formatPubkey')($scope.walletData.pubkey),
          to: $scope.destUid ? $scope.destUid : $scope.destPub,
          amount: $scope.formData.amount,
          unit: $scope.formData.useRelative ? translations['COMMON.UD'] : $filter('abbreviate')($scope.walletData.parameters.currency),
          comment: (!$scope.formData.comment || $scope.formData.comment.trim().length === 0) ? translations['COMMON.EMPTY_PARENTHESIS'] : $scope.formData.comment
        })
        .then(function(confirmMsg) {
          UIUtils.alert.confirm(confirmMsg)
          .then(function(confirm){
            if (confirm) {
              resolve();
            }
          });
        });
      });
    });
  };

  $scope.setUseRelative = function(useRelative) {
    $scope.formData.useRelative = useRelative;
    $scope.unitPopover.hide();
  };

}

