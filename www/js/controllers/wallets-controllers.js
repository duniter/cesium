angular.module('cesium.wallets.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

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


  .controller('WalletListCtrl', WalletListController)

  .controller('WalletSelectModalCtrl', WalletSelectModalController)

  .controller('PopoverWalletSelectModalCtrl', PopoverWalletSelectModalController)
;

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
      //$scope.addListeners();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.leave = function() {
    //$scope.removeListeners();
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
              $scope.addListenersOnWallet(wallet);
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
          $scope.formData.name = wallet.data.localName || wallet.data.name || wallet.data.uid || wallet.data.pubkey.substring(0, 8);

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

    $scope.listeners =[];

    // Auto-update on new block
    if (csSettings.data.walletHistoryAutoRefresh) {
      $scope.listeners.push(
        csCurrency.api.data.on.newBlock($scope, function (block) {
          if ($scope.loading) return;
          console.debug("[wallet-list] Received new block. Will reload list.");
          $timeout(function () {
            $scope.doUpdate(true);
          }, 300/*waiting for node cache propagation*/);
        }));
    }

    // Listen auth events on each wallet
    _.forEach($scope.wallets||[], $scope.addListenersOnWallet);
  };

  $scope.addListenersOnWallet = function(wallet) {
    if (!wallet) return;
    $scope.listeners.push(wallet.api.data.on.unauth($scope, $scope.updateView));
    $scope.listeners.push(wallet.api.data.on.auth($scope, function (data, deferred) {
      $timeout($scope.updateView);
      return deferred ? deferred.resolve() : $q.when();
    }));
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

  // Detect changes in settings useRelative
  $scope.$watch('settings.useRelative', function(newVal, oldVal) {
    if (!$scope.formData || $scope.loading || (newVal === oldVal)) return;
    $scope.formData.useRelative = $scope.settings.useRelative;
    $scope.updateView();
  }, true);
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
