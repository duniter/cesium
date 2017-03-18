angular.module('cesium.transfer.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.new_transfer', {
        cache: false,
        url: "/transfer?uid&pubkey",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey_uid', {
        cache: false,
        url: "/transfer/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey', {
        cache: false,
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

function TransferController($scope, $controller, UIUtils, csSettings) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('TransferModalLookupCtrl', {$scope: $scope}));

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!!state.stateParams && !!state.stateParams.pubkey) {
      $scope.formData.destPub = state.stateParams.pubkey;
      if (!!state.stateParams.uid) {
        $scope.destUid = state.stateParams.uid;
        $scope.destPub = '';
      }
      else {
        $scope.destUid = '';
        $scope.destPub = $scope.formData.destPub;
      }
    }

    $scope.loadWallet()
    .then(function() {
      $scope.formData.useRelative = csSettings.data.useRelative;
      $scope.onUseRelativeChanged();
      UIUtils.loading.hide();
    });
  });

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  // override modal close
  $scope.closeModal = function() {
    return $scope.showHome();
  };
}

function TransferModalController($scope, $rootScope, $translate, $filter, BMA, csWallet, UIUtils, Modals,
                                 csSettings, parameters) {
  'ngInject';

  $scope.convertedBalance = 0;
  $scope.formData = {
    destPub: null,
    amount: null,
    comment: null,
    useRelative: csSettings.data.useRelative,
    useComment: false
  };
  $scope.udAmount = null;
  $scope.commentPattern = BMA.regexp.COMMENT;

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

  $scope.cancel = function() {
    $scope.closeModal();
  };

  // When changing use relative UD
  $scope.onUseRelativeChanged = function() {
    $scope.currency = $rootScope.walletData.currency;
    if ($scope.formData.useRelative) {
      $scope.convertedBalance = $rootScope.walletData.balance / $rootScope.walletData.currentUD;
      $scope.udAmount = $scope.amount * $rootScope.walletData.currentUD;
    } else {
      $scope.convertedBalance = $rootScope.walletData.balance;
      // Convert to number
      $scope.formData.amount = (!!$scope.formData.amount && typeof $scope.formData.amount == "string") ?
          Math.floor(parseFloat($scope.formData.amount.replace(new RegExp('[,]'), '.'))) :
          $scope.formData.amount;
      // Compute UD
      $scope.udAmount = (!!$scope.formData.amount &&
        typeof $scope.formData.amount == "number" &&
        !!$rootScope.walletData.currentUD &&
        typeof $rootScope.walletData.currentUD == "number") ?
          $scope.formData.amount / $rootScope.walletData.currentUD :null;
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

  $scope.doTransfer = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid || !$scope.formData.destPub || !$scope.formData.amount) {
      return;
    }

    return $scope.askTransferConfirm()
      .then(function(confirm){
        if (!confirm) return;

        return UIUtils.loading.show()
          .then(function(){
            var amount = $scope.formData.amount;
            if (typeof amount === "string") {
              amount = parseFloat(amount.replace(new RegExp('[.,]'), '.'));
            }
            if ($scope.formData.useRelative) {
              amount = $rootScope.walletData.currentUD * amount;
            }
            else {
              amount = amount * 100; // remove 2 decimals of quantitative mode
            }

            return csWallet.transfer($scope.formData.destPub, amount, $scope.formData.comment, $scope.formData.useRelative);
          })
          .then(function() {
            return $scope.closeModal(true);
          })
          .then(UIUtils.loading.hide)
          .catch(UIUtils.onError('ERROR.SEND_TX_FAILED'));
    });
  };

  $scope.askTransferConfirm = function() {
    return $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
      .then(function(translations) {
        return $translate('CONFIRM.TRANSFER', {
          from: $rootScope.walletData.isMember ? $rootScope.walletData.uid : $filter('formatPubkey')($rootScope.walletData.pubkey),
          to: $scope.destUid ? $scope.destUid : $scope.destPub,
          amount: $scope.formData.amount,
          unit: $scope.formData.useRelative ? translations['COMMON.UD'] : $filter('abbreviate')($rootScope.walletData.parameters.currency),
          comment: (!$scope.formData.comment || $scope.formData.comment.trim().length === 0) ? translations['COMMON.EMPTY_PARENTHESIS'] : $scope.formData.comment
        });
      })
      .then(UIUtils.alert.confirm);
  };

  /* -- modals -- */
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

  /* -- popover -- */

  $scope.showUnitPopover = function($event) {
    UIUtils.popover.show($event, {
      templateUrl: 'templates/wallet/popover_unit.html',
      scope: $scope
    })
    .then(function(useRelative) {
      $scope.formData.useRelative = useRelative;
    });
  };


}

