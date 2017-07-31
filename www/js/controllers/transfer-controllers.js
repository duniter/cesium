angular.module('cesium.transfer.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.new_transfer', {
        cache: false,
        url: "/transfer?amount&udAmount&comment",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey_uid', {
        cache: false,
        url: "/transfer/:pubkey/:uid?amount&udAmount&comment",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey', {
        cache: false,
        url: "/transfer/:pubkey?amount&udAmount&comment",
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

function TransferController($scope, $controller, UIUtils, csWot, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('TransferModalCtrl', {$scope: $scope, parameters: {}}));

  $scope.enter = function(e, state) {

    // Compute parameters
    var parameters = {};
    if (state && state.stateParams) {
      if (state.stateParams.pubkey) {
        parameters.pubkey = state.stateParams.pubkey;
      }
      if (state.stateParams.amount) {
        parameters.useRelative = false;
        parameters.amount = state.stateParams.amount;
      }
      else if (state.stateParams.udAmount) {
        parameters.useRelative = true;
        parameters.udAmount = state.stateParams.udAmount;
      }
      if (state.stateParams.comment) {
        parameters.comment = state.stateParams.comment;
      }
    }

    // Make sure wallet is loaded
    csWallet.login({sources: true})

      // If pubkey, get the uid (+ name, avatar)
      .then(function(data) {
        $scope.walletData = data;
        if (parameters.pubkey) {
          return csWot.extend({pubkey: parameters.pubkey})
            .then(function(dest) {
              if (dest && dest.uid) {
                parameters.uid = dest.name || dest.uid;
              }
            });
        }
      })

      // Apply parameters, then recompute relative amount
      .then(function() {
        $scope.setParameters(parameters);
        $scope.onUseRelativeChanged();
        UIUtils.loading.hide();
        $scope.loading = false;
        UIUtils.ink({selector: '.modal-transfer .ink'});
      });
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  // override modal close
  $scope.closeModal = function() {
    return $scope.showHome();
  };
}

function TransferModalController($scope, $q, $translate, $filter, BMA, csWallet, UIUtils, Modals,
                                 csCurrency, csSettings, parameters) {
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
  $scope.currency = csCurrency.data.name;
  $scope.loading = true;

  $scope.setParameters = function(parameters) {
    if (!parameters) return;
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
      $scope.formData.useRelative=false;
    }
    else if (parameters.udAmount) {
      $scope.formData.amount = parameters.udAmount;
      $scope.formData.useRelative=true;
    }
    if (parameters.comment) {
      $scope.formData.useComment=true;
      $scope.formData.comment = parameters.comment;
    }
  };
  // Read default parameters
  $scope.setParameters(parameters);

  $scope.enter = function() {
    UIUtils.ink({selector: '.modal-transfer .ink'});

    // Make to sure to load full wallet data (balance)
    return csWallet.login({sources: true, silent: true})
      .then(function(data) {
          $scope.walletData = data;
          $scope.onUseRelativeChanged();
          $scope.loading = false;
          UIUtils.ink({selector: '.modal-transfer .ink'});
        })
        .catch(function(err){
          if (err == 'CANCELLED') return $scope.cancel(); // close the modal
          UIUtils.onError('ERROR.LOGIN_FAILED')(err);
        });
  };
  $scope.$on('modal.shown', $scope.enter);

  $scope.cancel = function() {
    $scope.closeModal();
  };

  // When changing use relative UD
  $scope.onUseRelativeChanged = function() {
    $scope.currency = csCurrency.data.name;
    if ($scope.formData.useRelative) {
      $scope.convertedBalance = csWallet.data.balance / csCurrency.data.currentUD;
      $scope.udAmount = $scope.amount * csCurrency.data.currentUD;
    } else {
      $scope.convertedBalance = csWallet.data.balance;
      // Convert to number
      $scope.formData.amount = (!!$scope.formData.amount && typeof $scope.formData.amount == "string") ?
          Math.floor(parseFloat($scope.formData.amount.replace(new RegExp('[,]'), '.'))) :
          $scope.formData.amount;
      // Compute UD
      $scope.udAmount = (!!$scope.formData.amount &&
        typeof $scope.formData.amount == "number" &&
        !!csCurrency.data.currentUD &&
        typeof csCurrency.data.currentUD == "number") ?
          $scope.formData.amount / csCurrency.data.currentUD :null;
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

    var currentUD;
    return $q.all([
        // Make sure user is auth
        csWallet.auth({silent: true}),

        // Get current UD
        csCurrency.currentUD()
          .then(function(res) {
            currentUD = res;
          })
       ])
      .then($scope.askTransferConfirm)
      .then(function(confirm){
        if (!confirm) return;

        return UIUtils.loading.show()
          .then(function(){
            var amount = $scope.formData.amount;
            if (typeof amount === "string") {
              amount = parseFloat(amount.replace(new RegExp('[.,]'), '.'));
            }
            if ($scope.formData.useRelative) {
              amount = currentUD * amount;
            }
            else {
              amount = amount.toFixed(2) * 100; // remove 2 decimals on quantitative mode
            }

            return csWallet.transfer($scope.formData.destPub, amount, $scope.formData.comment, $scope.formData.useRelative);
          })
          .then(function() {
            return $scope.closeModal(true);
          })
          .then(UIUtils.loading.hide)
          .then(function() {
            UIUtils.toast.show('INFO.TRANSFER_SENT');
          })
          .catch(UIUtils.onError('ERROR.SEND_TX_FAILED'));
    });
  };

  $scope.askTransferConfirm = function() {
    return $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
      .then(function(translations) {
        return $translate('CONFIRM.TRANSFER', {
          from: csWallet.data.isMember ? csWallet.data.uid : $filter('formatPubkey')(csWallet.data.pubkey),
          to: $scope.destUid ? $scope.destUid : $scope.destPub,
          amount: $scope.formData.amount,
          unit: $scope.formData.useRelative ? translations['COMMON.UD'] : $filter('abbreviate')($scope.currency),
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

