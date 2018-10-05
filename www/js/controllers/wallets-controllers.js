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

  .controller('WalletListImportModalCtrl', WalletListImportModalController)

  .controller('PopoverWalletSelectModalCtrl', PopoverWalletSelectModalController)
;

function WalletListController($scope, $controller, $state, $timeout, $q, $translate, $ionicPopover, $ionicPopup,
                              ModalUtils,
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
  };
  $scope.$on('$ionicView.enter', $scope.enter);

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

  $scope.downloadAsFile = function() {
    if (!$scope.wallets) return; // user cancel
    return csWallet.children.downloadFile();
  };

  $scope.addNewWallet = function(wallet) {

    if (!wallet) return $q.reject("Missing 'wallet' argument");

    // Make sure auth on the main wallet
    if (!csWallet.isAuth()) {
      return csWallet.auth({minData: true})
        .then(function() {
          return $scope.addNewWallet(wallet); // loop
        })
        .catch(function(err) {
          if (err === 'CANCELLED') {
            return UIUtils.loading.hide();
          }
          UIUtils.onError('ERROR.ADD_SECONDARY_WALLET_FAILED')(err);
        });
    }

    // Call API extension on child wallet
    return csWallet.api.data.raisePromise.load(wallet.data)
      // continue, when plugins extension failed (just log in console)
      .catch(console.error)
      .then(function() {
        $scope.addListenersOnWallet(wallet);
        csWallet.children.add(wallet);
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

        console.debug("[wallet] Adding secondary wallet {"+walletData.pubkey.substring(0,8)+"} with id=" + walletId);

        // Add the child wallet
        return $scope.addNewWallet(wallet)
          .then(function() {
            UIUtils.loading.hide();
            $scope.updateView();
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

  $scope.showImportFileModal = function() {
    $scope.hideActionsPopover();

    var loginAndAddWallet = function(authData) {
      var walletId = csWallet.children.count() + 1;

      console.debug("[wallet] Adding secondary wallet {"+authData.pubkey.substring(0,8)+"} with id=" + walletId);

      var wallet = csWallet.instance(walletId);
      return wallet.login({
          authData: authData,
          // Load data options :
          minData: true,
          sources: true,
          api: false,
          success: UIUtils.loading.show
        })
        .then(function(walletData) {
          walletData.localName = authData.localName;
          return $scope.addNewWallet(wallet);
        });
    };

    return ModalUtils.show(
        'templates/wallet/list/modal_import_file.html',
        'WalletListImportModalCtrl'
    )
      .then(function(items){
        if (!items || !items.length) return; // User cancel

        UIUtils.loading.show();
        // Make sure to auth on the main wallet
        return csWallet.auth({minData: true})
          .then(function() {
            // Add wallet one after one
            return items.reduce(function(promise, authData){
              return promise.then(function() {
                return loginAndAddWallet(authData);
              });
            }, $q.when());
          })
          .then(function() {
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

  // Clean controller data when logout
  $scope.onWalletLogout = function() {
    console.warn("wallet LOGOUT !!!");
    $scope.resetData();
    $scope.removeListeners();
  };

  $scope.addListeners = function() {

    $scope.listeners = [
      csWallet.api.data.on.logout($scope, $scope.onWalletLogout)
    ];

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
  $scope.wallets = null;
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
        $scope.wallets = [];
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

  // Clean controller data
  $scope.resetData = function() {
    $scope.wallets = null;
    $scope.loading = true;
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

function WalletListImportModalController($scope, $timeout, BMA, csWallet) {
  'ngInject';

  $scope.hasContent = false;
  $scope.content = null;
  $scope.fileData =  '';
  $scope.isValidFile = false;
  $scope.validatingFile = false;

  $scope.importFromFile = function(file) {
    $scope.validatingFile = true;

    $scope.hasContent = angular.isDefined(file) && file !== '';
    $scope.fileData = file.fileData ? file.fileData : '';
    var isValidFile = $scope.fileData !== '' && ($scope.fileData.type == 'text/csv' || $scope.fileData.type == 'text/plain');

    // Bad file type: invalid file
    if (!isValidFile) {
      console.error("[wallet] Import failed. Invalid file type: " + $scope.fileData.type);
      $scope.isValidFile = false;
      $scope.validatingFile = false;
      return;
    }

    // Parse file
    console.debug("[wallet] Parsing file to import...");
    var rows = file.fileContent.split('\n');
    $scope.content = rows.reduce(function(res, row) {
      // Skip empty row
      if (!row || !row.trim().length) return res;

      // Split
      var cols = row.split('\t', 3) || undefined;

      // Invalid column count: mark file as invalid
      if (cols && cols.length != 3) {
        console.debug("[wallet] Import: skip invalid row: " + row);
        isValidFile = false;
        return res;
      }

      var item = {
        pubkey: cols[0],
        uid: cols[1],
        localName: cols[2]
      };

      // Check pubkey validity
      if (!BMA.regexp.PUBKEY.test(item.pubkey)) {
        console.debug("[wallet] Invalid pubkey, found in this row: ", row);
        isValidFile = false;
        return res;
      }

      // Ignore if same as current wallet
      if (csWallet.isUserPubkey(item.pubkey)) {
        console.debug("[wallet] Pubkey equals to main wallet. Skip this row: ", row);
        return res;
      }

      // Ignore if already in children wallet
      if (csWallet.children.hasPubkey(item.pubkey)) {
        console.debug("[wallet] Pubkey already in wallet list. Skip this row", row);
        return res;
      }

      // OK: add it to result
      return res.concat(item);
    }, []);

    $scope.isValidFile = isValidFile;

    $timeout(function() {
      $scope.validatingFile = false;
    }, 250); // need to have a loading effect
  };

  $scope.removeFile = function() {
    $scope.hasContent = false;
    $scope.content = null;
    $scope.fileData =  '';
    $scope.isValidFile = false;
    $scope.validatingFile = false;
  };
}
