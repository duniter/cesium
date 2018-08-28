angular.module('cesium.transfer.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.new_transfer', {
        cache: false,
        url: "/transfer?amount&udAmount&comment&restPub&all&wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey_uid', {
        cache: false,
        url: "/transfer/:pubkey/:uid?amount&udAmount&comment&restPub&all&wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/new_transfer.html",
            controller: 'TransferCtrl'
          }
        }
      })

      .state('app.new_transfer_pubkey', {
        cache: false,
        url: "/transfer/:pubkey?amount&udAmount&comment&restPub&all&wallet",
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

function TransferController($scope, $controller, UIUtils) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('TransferModalCtrl', {$scope: $scope, parameters: {}}));

  $scope.enter = function(e, state) {

    // Apply state  parameters
    if (state && state.stateParams) {
      $scope.setParameters(state.stateParams);
    }

    // Load wallet
    return $scope.load()
      .then(UIUtils.loading.hide);
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

function TransferModalController($scope, $q, $translate, $timeout, $filter, $focus, Device, BMA, csWallet, UIUtils, Modals,
                                 csCurrency, csSettings, parameters) {
  'ngInject';

  var
    wallet,
    minQuantitativeAmount = 0.01;

  $scope.convertedBalance = 0;
  $scope.formData = {
    destPub: null,
    amount: null,
    comment: null,
    useRelative: csSettings.data.useRelative,
    useComment: false,
    all: false,
    restPub: null,
    restAmount: null,
    walletId: null
  };
  $scope.udAmount = null;
  $scope.minAmount = minQuantitativeAmount;
  $scope.commentPattern = BMA.regexp.COMMENT;
  $scope.currency = csCurrency.data.name;
  $scope.loading = true;
  $scope.commentInputId = 'transferComment-' + $scope.$id;
  $scope.enableSelectWallet = true;

  // Define keyboard settings, to bind with model (If small screen AND mobile devices)
  $scope.smallscreen = angular.isDefined($scope.smallscreen) ? $scope.smallscreen : UIUtils.screen.isSmall();
  if ($scope.smallscreen || Device.enable) {
    $scope.digitKeyboardSettings = $scope.digitKeyboardSettings || Device.keyboard.digit.settings.bindModel(
        $scope,
        'formData.amount',
        {
          decimal: true,
          decimalSeparator: '.',
          resizeContent: true
        });
    $scope.digitKeyboardVisible = false;
  }

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
    if (parameters.restPub || parameters.all) {
      $scope.restUid = '';
      $scope.restPub = parameters.restPub;
      $scope.formData.restPub = parameters.restPub;
      $scope.formData.all = true;
    }
    else {
      $scope.formData.all = false;
    }
    if (!parameters.wallet || parameters.wallet === "default") {
      $scope.formData.walletId = csWallet.id;
    }
    else {
      $scope.formData.walletId = parameters.wallet;
    }
  };
  // Read default parameters
  $scope.setParameters(parameters);

  $scope.load = function() {
    $scope.enableSelectWallet = csWallet.children.count() > 0;

    wallet = $scope.enableSelectWallet && ($scope.formData.walletId ? csWallet.children.get($scope.formData.walletId) : csWallet) || csWallet;
    if (!wallet.isDefault()) {
      console.debug("[transfer] Using wallet {" + wallet.id + "}");
    }
    // Make to sure to load full wallet data (balance)
    return wallet.login({sources: true, silent: true})
      .then(function(data) {
        $scope.walletData = data;
        $scope.formData.walletId = wallet.id;
        $scope.onUseRelativeChanged();
        $scope.onAmountChanged();

        $scope.$watch('walletData.balance', $scope.onAmountChanged, true);
        $scope.$watch('formData.amount', $scope.onAmountChanged, true);

        $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged, true);
        $scope.$watch('walletData.balance', $scope.onUseRelativeChanged, true);

        UIUtils.ink({selector: '.modal-transfer .ink'});

        if (!$scope.destPub || $scope.destUid) {
          $scope.loading = false;
        }
        else {
          // Fill the uid from the pubkey
          return csWot.extend({pubkey: $scope.destPub})
            .then(function(res) {
              $scope.destUid = res && (res.name || res.uid);
              if ($scope.destUid) {
                $scope.destPub = '';
              }
              $scope.loading = false;
            });
        }
      })
      .catch(function(err){
        if (err == 'CANCELLED') return $scope.cancel(); // close the modal
        UIUtils.onError('ERROR.LOGIN_FAILED')(err);
      });
  };
  $scope.$on('modal.shown', $scope.load);

  $scope.cancel = function() {
    $scope.closeModal();
  };

  // When changing use relative UD
  $scope.onUseRelativeChanged = function() {
    $scope.currency = csCurrency.data.name;
    if ($scope.formData.useRelative) {
      $scope.convertedBalance = $scope.walletData.balance / csCurrency.data.currentUD;
      $scope.minAmount = minQuantitativeAmount / (csCurrency.data.currentUD / 100);
    } else {
      $scope.convertedBalance = $scope.walletData.balance / 100;
      $scope.minAmount = minQuantitativeAmount;
    }
    if ($scope.form && !$scope.loading) {
      $scope.form.$setPristine(true);
    }
  };

  $scope.onAmountChanged = function() {

    var amount = $scope.formData.amount;
    if (amount && typeof amount === "string") {
      amount = parseFloat(amount.replace(new RegExp('[.,]'), '.'));
    }

    var valid = true;

    // Avoid amount less than the minimal - fix #373
    if (amount && amount < $scope.minAmount) {
      valid = false;
      $scope.form.amount.$error = $scope.form.amount.$error || {};
      $scope.form.amount.$error.min = true;
    }
    else if ($scope.form.amount.$error && $scope.form.amount.$error.min){
      delete $scope.form.amount.$error.min;
    }

    // Avoid amount greater than the balance
    if (amount && amount > $scope.convertedBalance){
      $scope.form.$valid = false;
      $scope.form.amount.$invalid = true;
      $scope.form.amount.$error = $scope.form.amount.$error || {};
      $scope.form.amount.$error = {max: true};
    }
    else if ($scope.form.amount.$error && $scope.form.amount.$error.max){
      delete $scope.form.amount.$error.max;
    }

    $scope.form.$valid = valid;
    $scope.form.amount.$invalid = !valid;

    if (!valid || !$scope.formData.all || !amount) {
      $scope.formData.restAmount = undefined;
    }
    else {
      if ($scope.formData.useRelative) {
        $scope.formData.restAmount = $scope.walletData.balance - amount * csCurrency.data.currentUD;
        if ($scope.formData.restAmount < minQuantitativeAmount) {
          $scope.formData.restAmount = 0;
        }
      } else {
        $scope.formData.restAmount  = $scope.walletData.balance - amount * 100;
      }
    }
  };

  $scope.doTransfer = function() {
    $scope.form.$submitted=true;

    if(!$scope.form.$valid || !$scope.formData.destPub || !$scope.formData.amount) {
      return;
    }
    var amount = $scope.formData.amount;
    if (typeof amount === "string") {
      amount = parseFloat(amount.replace(new RegExp('[.,]'), '.'));
    }

    // Avoid multiple call
    if ($scope.sending) return;
    $scope.sending = true;

    var currentUD;
    return $q.all([
        // Make sure user is auth
        wallet.auth({silent: true}),

        // Get current UD
        csCurrency.currentUD()
          .then(function(res) {
            currentUD = res;
          }),

        // Hide digit keyboard
        $scope.hideDigitKeyboard(300)
       ])
      .then($scope.askTransferConfirm)
      .then(function(confirm){
        if (!confirm) {
          $scope.sending = false;
          return;
        }

        return UIUtils.loading.show()
          .then(function(){
            // convert amount
            if ($scope.formData.useRelative) {
              amount = currentUD * amount;
            }
            else {
              amount = amount.toFixed(2) * 100; // remove 2 decimals on quantitative mode
            }

            // convert comment: trim, then null if empty
            var comment = $scope.formData.comment && $scope.formData.comment.trim();
            if (comment && !comment.length) {
              comment = null;
            }
            var hasRest = $scope.formData.all  && $scope.formData.restAmount > 0;
            if (hasRest) {
              return wallet.transferAll($scope.formData.destPub, amount, comment, $scope.formData.useRelative, $scope.formData.restPub);
            }
            else {
              return wallet.transfer($scope.formData.destPub, amount, comment, $scope.formData.useRelative);
            }
          })
          .then(function() {
            $scope.sending = false;
            UIUtils.loading.hide();
            return $scope.closeModal(true);
          })
          .then(function(res) {
            $timeout(function() {
              UIUtils.toast.show('INFO.TRANSFER_SENT');
            }, 500);
            return res;
          });
    })
    .catch(function(err) {
      $scope.sending = false;
      // Wallet auth cancelled by user
      if (err === 'CANCELLED') return;
      UIUtils.onError('ERROR.SEND_TX_FAILED')(err);
    });
  };

  $scope.askTransferConfirm = function() {
    return $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
      .then(function(translations) {
        var hasRest = $scope.formData.all  && $scope.formData.restAmount > 0;
        return $translate(hasRest ? 'CONFIRM.TRANSFER_ALL' : 'CONFIRM.TRANSFER', {
          from: $scope.walletData.isMember ? $scope.walletData.uid : $filter('formatPubkey')($scope.walletData.pubkey),
          to: $scope.destUid || $scope.destPub,
          amount: $scope.formData.amount,
          unit: $scope.formData.useRelative ? translations['COMMON.UD'] : $filter('abbreviate')($scope.currency),
          comment: (!$scope.formData.comment || $scope.formData.comment.trim().length === 0) ? translations['COMMON.EMPTY_PARENTHESIS'] : $scope.formData.comment,
          restAmount: hasRest && $filter('formatAmount')($scope.formData.restAmount, {useRelative: $scope.formData.useRelative}),
          restTo: hasRest && ($scope.restUid || $scope.restPub)
        });
      })
      .then(UIUtils.alert.confirm);
  };

  $scope.addComment = function() {
    $scope.formData.useComment = true;
    // Focus on comment field
    if ($scope.commentInputId) {
      $timeout(function() {
        $focus($scope.commentInputId);
      }, 200);
    }
  };

  /* -- modals -- */
  $scope.showWotLookupModal = function(formDataField) {

    formDataField = formDataField || 'destPub';

    // Hide numerical keyboard
    $scope.hideDigitKeyboard(0);

    return Modals.showWotLookup()
      .then(function(result){
        if (result) {
          if (formDataField == 'destPub') {
            $scope.destUid = result.uid;
            $scope.destPub = result.uid ? '' : result.pubkey;
            $scope.formData.destPub = result.pubkey;
          }
          else if (formDataField == 'restPub') {
            $scope.restUid = result.uid;
            $scope.restPub = result.uid ? '' : result.pubkey;
            $scope.formData.restPub = result.pubkey;
          }
        }
      });
  };

  $scope.showSelectWalletModal = function() {
    if (!$scope.enableSelectWallet) return;

    return Modals.showSelectWallet({
      useRelative: $scope.formData.useRelative,
      showDefault: true,
      showBalance: true
    })
      .then(function(newWallet) {
        if (!newWallet || (wallet && wallet.id === newWallet.id)) return;
        wallet = newWallet;
        $scope.walletData = wallet.data;
        console.debug("[transfer] Using wallet {" + wallet.id + "}");
        $scope.onAmountChanged();
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

  /* -- keyboard -- */
  $scope.showDigitKeyboard = function() {
    // No keyboard settings, or already visible: skip
    if (!$scope.digitKeyboardSettings || $scope.digitKeyboardVisible) return;

    // Device enable: hide OS keyboard
    if (Device.enable) {

      // Hide device keyboard
      Device.keyboard.close();

      // Open the digit keyboard (with a delay)
      return $timeout(function() {
        $scope.digitKeyboardVisible = true;
      }, 200);
    }

    // Open the digit keyboard
    $scope.digitKeyboardVisible = true;
    return $q.when();
  };

  $scope.hideDigitKeyboard = function(timeout) {
    if (!$scope.digitKeyboardVisible) return $q.when();
    $scope.digitKeyboardVisible = false;
    return $timeout(function() {}, timeout||200);
  };
}

