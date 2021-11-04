
angular.module('cesium.help.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider


      .state('app.help_tour', {
        url: "/tour",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'HelpTourCtrl'
          }
        }
      })

      .state('app.help', {
        url: "/help?anchor",
        views: {
          'menuContent': {
            templateUrl: "templates/help/view_help.html",
            controller: 'HelpCtrl'
          }
        }
      })

      .state('app.help_anchor', {
        url: "/help/:anchor",
        views: {
          'menuContent': {
            templateUrl: "templates/help/view_help.html",
            controller: 'HelpCtrl'
          }
        }
      })

    ;


  })

  .controller('HelpCtrl', HelpController)

  .controller('HelpModalCtrl', HelpModalController)

  .controller('HelpTipCtrl', HelpTipController)

  .controller('HelpTourCtrl', HelpTourController)


;


function HelpController($scope, $state, $timeout, $anchorScroll, csSettings) {
  'ngInject';

  $scope.$on('$ionicView.enter', function(e) {
    $scope.locale = csSettings.data.locale.id;
    if ($state.stateParams && $state.stateParams.anchor) {
      $scope.anchor = $state.stateParams.anchor;
      $timeout(function () {
        $anchorScroll($state.stateParams.anchor);
      }, 100);
    }
  });
}

function HelpModalController($scope, $timeout, $anchorScroll, csSettings, parameters) {
  'ngInject';

  $scope.itemsClass = {};
  $scope.locale = csSettings.data.locale.id;

  parameters = parameters || {};
  if (parameters && typeof parameters == "string") {
    parameters = {anchor: parameters};
  }

  if (parameters.anchor) {

    $timeout(function() {
      $anchorScroll(parameters.anchor);
    }, 100);

    // Change CSS classes
    $scope.itemsClass = {};
    $scope.itemsClass[parameters.anchor] = 'selected';
    $scope.listClass = 'selection';
  }

}


/* ----------------------------
*  Help Tip
* ---------------------------- */
function HelpTipController($scope, $state, $window, $ionicSideMenuDelegate, $timeout, $q, $anchorScroll,
                           UIUtils, csConfig, csSettings, csCurrency, csHelpConstants, Device, csWallet) {

  $scope.tour = false; // Is a tour or a helptip ?
  $scope.continue = true;

  $scope.executeStep = function(partName, steps, index) {
    index = angular.isDefined(index) ? index : 0;

    if (index >= steps.length) {
      return $q.when(true); // end
    }

    var step = steps[index];
    if (typeof step !== 'function') {
      throw new Error('[helptip] Invalid step at index {0} of \'{1}\' tour: step must be a function'.format(index, partName));
    }
    var promise = step();
    if (typeof promise === 'boolean') {
      promise = $q.when(promise);
    }
    return promise
      .then(function(next) {
        if (angular.isUndefined(next)) {
          $scope.continue = false;
          return index; // keep same index (no button press: popover just closed)
        }
        if (!next || index === steps.length - 1) {
          return next ? -1 : index+1; // last step OK, so mark has finished
        }
        return $scope.executeStep(partName, steps, index+1);
      })
      .catch(function(err) {
        if (err && err.message === 'transition prevented') {
          console.error('ERROR: in help tour [{0}], in step [{1}] -> use large if exists, to prevent [transition prevented] error'.format(partName, index));
        }
        else {
          console.error('ERROR: in help tour  [{0}], in step [{1}] : {2}'.format(partName, index, err));
        }
        $scope.continue = false;
        return index;
      });
  };

  $scope.showHelpTip = function(id, options) {
    options = options || {};
    options.bindings = options.bindings || {};
    options.bindings.value =options.bindings.value || '';
    options.bindings.hasNext = angular.isDefined(options.bindings.hasNext) ? options.bindings.hasNext : true;
    options.timeout = options.timeout || (Device.enable ? 900 : 500);
    options.autoremove = true; // avoid memory leak
    options.bindings.tour = $scope.tour;
    options.backdropClickToClose = !$scope.tour;
    return UIUtils.popover.helptip(id, options);
  };

  $scope.showHelpModal = function(helpAnchor) {
    Modals.showHelp({anchor: helpAnchor});
  };

  $scope.startHelpTour = function() {
    $scope.tour = true;
    $scope.continue = true;

    console.debug("[help] Starting help tour... {demo: {0}, readonly: {1}, isLogin: {2}}".format(
      csConfig.demo, csConfig.readonly, csWallet.isLogin()));

    // Wallet (if NOT readonly and NOT login)
    return ((!csConfig.readonly && csWallet.isLogin()) ? $scope.startWalletNoLoginTour(0, true) : $q.when(true))

      // Wallet (if login)
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly || !csWallet.isLogin()) return true; // not login or readonly: continue
        return $scope.startWalletTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wallet=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Wallet certifications
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly || !csWallet.isLogin()) return true; // not login or readonly: continue
        return $scope.startWalletCertTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.walletCerts=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // My operations (if login)
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly || !csWallet.isLogin()) return true; // not login or readonly: continue
        return $scope.startTxTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.tx=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // My wallets (if login)
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly || !csWallet.isLogin()) return true; // not login or readonly: continue
        return $scope.startWalletsTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wallets=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Header tour
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly) return true; // readonly: continue
        return $scope.startHeaderTour(0, true);
      })

      // Settings tour (if not readonly mode)
      .then(function(next){
        if (!next) return false;
        if (csConfig.readonly) return true; // Skip if readonly mode (will be play later)
        return $scope.startSettingsTour(0, true);
      })

      // Wot lookup tour
      .then(function(next){
        if (!next) return false;
        return $scope.startWotLookupTour(0, true)
          .then(function(endIndex){
            if (!endIndex || $scope.cancelled) return false;
            csSettings.data.helptip.wotLookup=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Wot identity
      .then(function(next){
        if (!next) return false;
        return $scope.startWotTour(0, true)
          .then(function(endIndex){
            if (!endIndex || $scope.cancelled) return false;
            csSettings.data.helptip.wot=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Identity certifications
      .then(function(next){
        if (!next) return false;
        return $scope.startWotCertTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wotCerts=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Currency tour
      .then(function(next){
        if (!next) return false;

        return $scope.startCurrencyTour(0, true)
          .then(function(endIndex){
            if (!endIndex || $scope.cancelled) return false;
            csSettings.data.helptip.currency=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Network tour
      .then(function(next){
        if (!next) return false;
        return $scope.startNetworkTour(0, true)
          .then(function(endIndex){
            if (!endIndex || $scope.cancelled) return false;
            csSettings.data.helptip.network=endIndex;
            csSettings.store();
            return $scope.continue;
          });
      })

      // Settings tour (if readonly mode)
      .then(function(next){
        if (!next) return false;
        if (!csConfig.readonly) return true; // Skip if NOT readonly
        return $scope.startSettingsTour(0, true);
      })

      // Finish tour
      .then(function(next){
        if (!next) return false;
        return $scope.finishTour();
      });
  };

  /**
   * Features tour on currency
   * @returns {*}
   */
  $scope.startCurrencyTour = function(startIndex, hasNext) {

    var showWotTabIfNeed  = function() {
      if ($state.is('app.currency.tab_parameters')) {
        $state.go('app.currency.tab_wot');
      }
    };

    var contentParams;

    var steps = [

      function(){
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-currency', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_CURRENCY',
            icon: {
              position: UIUtils.screen.isSmall() || csConfig.readonly ? 'left' : 'bottom-left'
            }
          }
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }
        return $state.go(UIUtils.screen.isSmall() ? 'app.currency' : 'app.currency_lg')
          .then(function () {
            return $scope.showHelpTip('helptip-currency-mass-member', {
              bindings: {
                content: 'HELP.TIP.CURRENCY_MASS',
                icon: {
                  position: 'center'
                }
              }
            });
          });
      },

      function () {
        if (!csSettings.data.useRelative) return true; //skip but continue
        return $scope.showHelpTip('helptip-currency-mass-member-unit', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_UNIT_RELATIVE',
            contentParams: contentParams,
            icon: {
              position: UIUtils.screen.isSmall() ? 'right' : 'center'
            }
          }
        });
      },

      // function () {
      //   if (!csSettings.data.useRelative) return true; //skip but continue
      //   $anchorScroll('helptip-currency-change-unit');
      //   return $scope.showHelpTip('helptip-currency-change-unit', {
      //     bindings: {
      //       content: 'HELP.TIP.CURRENCY_CHANGE_UNIT',
      //       contentParams: contentParams,
      //       icon: {
      //         position: UIUtils.screen.isSmall() ? 'right' : undefined
      //       }
      //     }
      //   });
      // },
      //
      // function () {
      //   if (csSettings.data.useRelative) return true; //skip but continue
      //   $anchorScroll('helptip-currency-change-unit');
      //   return $scope.showHelpTip('helptip-currency-change-unit', {
      //     bindings: {
      //       content: 'HELP.TIP.CURRENCY_CHANGE_UNIT_TO_RELATIVE',
      //       contentParams: contentParams,
      //       icon: {
      //         position: UIUtils.screen.isSmall() ? 'right' : undefined
      //       }
      //     }
      //   });
      // },

      function () {
        $anchorScroll('helptip-currency-rules-anchor');
        return $scope.showHelpTip('helptip-currency-rules', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_RULES',
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            }
          }
        });
      },

      function () {
        showWotTabIfNeed();
        $anchorScroll('helptip-currency-newcomers-anchor');
        return $scope.showHelpTip('helptip-currency-newcomers', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_WOT',
            icon: {
              position: 'center'
            },
            hasNext: hasNext
          },
          timeout: 1200, // need for Firefox
          retry: 2
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.get().then(function(currency) {
      contentParams = currency.parameters;
      // Launch steps
      return $scope.executeStep('currency', steps, startIndex);
    });
  };

  /**
   * Features tour on network
   * @returns {*}
   */
  $scope.startNetworkTour = function(startIndex, hasNext) {

    var showNetworkTabIfNeed  = function() {
      if ($state.is('app.currency')) {
        // Select the second tabs
        $timeout(function () {
          var tabs = $window.document.querySelectorAll('ion-tabs .tabs a');
          if (tabs && tabs.length === 3) {
            angular.element(tabs[2]).triggerHandler('click');
          }
        }, 100);
      }
    };

    var contentParams;

    var steps = [

      function(){
        if (UIUtils.screen.isSmall()) return true; // skip but continue
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-network', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_NETWORK',
            icon: {
              position: UIUtils.screen.isSmall() || csConfig.readonly ? 'left' : 'bottom-left'
            }
          }
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }
        return $state.go(UIUtils.screen.isSmall() ? 'app.currency.tab_network' : 'app.network')
          .then(function () {
            showNetworkTabIfNeed();
            return $scope.showHelpTip('helptip-network-peers', {
              bindings: {
                content: 'HELP.TIP.NETWORK_BLOCKCHAIN',
                icon: {
                  position: 'center',
                  glyph: 'ion-information-circled'
                }
              },
              timeout: 1200 // need for Firefox
            });
          });
      },

      function() {
        showNetworkTabIfNeed();
        return $scope.showHelpTip('helptip-network-peer-0', {
          bindings: {
            content: 'HELP.TIP.NETWORK_PEERS',
            icon: {
              position: UIUtils.screen.isSmall() ? undefined : 'center'
            }
          },
          timeout: 1000,
          retry: 20
        });
      },


      function() {
        showNetworkTabIfNeed();
        return $scope.showHelpTip('helptip-network-peer-0-block', {
          bindings: {
            content: 'HELP.TIP.NETWORK_PEERS_BLOCK_NUMBER',
            icon: {
              position: UIUtils.screen.isSmall() ? undefined : 'center'
            }
          }
        });
      },

      function() {
        showNetworkTabIfNeed();
        var locale = csSettings.data.locale.id;
        return $scope.showHelpTip('helptip-network-peers', {
          bindings: {
            content: 'HELP.TIP.NETWORK_PEERS_PARTICIPATE',
            contentParams: {
              installDocUrl: (csConfig.helptip && csConfig.helptip.installDocUrl) ?
                (csConfig.helptip.installDocUrl[locale] ? csConfig.helptip.installDocUrl[locale] : csConfig.helptip.installDocUrl) :
                'http://duniter.org'
            },
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.parameters().then(function(parameters) {
      contentParams = parameters;
      // Launch steps
      return $scope.executeStep('network', steps, startIndex);
    });
  };

  /**
   * Features tour on WOT lookup
   * @returns {*}
   */
  $scope.startWotLookupTour = function(startIndex, hasNext) {

    var steps = [
      function() {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-wot', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_WOT',
            icon: {
              position: UIUtils.screen.isSmall() || csConfig.readonly ? 'left' : 'bottom-left'
            }
          },
          onError: 'continue'
        });
      },

      function() {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }
        return $state.go(UIUtils.screen.isSmall() ? 'app.wot_lookup.tab_search' : 'app.wot_lookup_lg')
          .then(function(){
            return $scope.showHelpTip('helptip-wot-search-text', {
              bindings: {
                content: UIUtils.screen.isSmall() ? 'HELP.TIP.WOT_SEARCH_TEXT_XS' : 'HELP.TIP.WOT_SEARCH_TEXT',
                icon: {
                  position: 'center'
                }
              }
            });
          });
      },

      function() {
        return $scope.showHelpTip('helptip-wot-search-result-0', {
          bindings: {
            content: 'HELP.TIP.WOT_SEARCH_RESULT',
            icon: {
              position: 'center'
            }
          },
          timeout: 700,
          retry: 15
        });
      },

      function() {
        var element = $window.document.getElementById('helptip-wot-search-result-0');
        if (!element) return true;
        $timeout(function() {
          angular.element(element).triggerHandler('click');
        });
        return $scope.showHelpTip('helptip-wot-view-certifications', {
          bindings: {
            content: 'HELP.TIP.WOT_VIEW_CERTIFICATIONS',
            hasNext: hasNext
          },
          timeout: 2500
        });
      }
    ];

    // Launch steps
    return $scope.executeStep('wotLookup', steps, startIndex);
  };

  /**
   * Features tour on WOT identity
   * @returns {*}
   */
  $scope.startWotTour = function(startIndex, hasNext) {
    var contentParams;

    var steps = [
      function() {
        return $scope.showHelpTip('helptip-wot-view-certifications', {
          bindings: {
            content: 'HELP.TIP.WOT_VIEW_CERTIFICATIONS_COUNT',
            contentParams: contentParams,
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            }
          }
        });
      },

      function() {
        return $scope.showHelpTip('helptip-wot-view-certifications-count', {
          bindings: {
            content: 'HELP.TIP.WOT_VIEW_CERTIFICATIONS_CLICK',
            icon: {
              position: 'center'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.get().then(function(currency) {
      contentParams = currency.parameters;
      contentParams.currentUD = currency.currentUD;
      // Launch steps
      return $scope.executeStep('wot', steps, startIndex);
    });
  };

  /**
   * Features tour on wot certifications
   * @returns {*}
   */
  $scope.startWotCertTour = function(startIndex, hasNext) {
    if (csConfig.readonly) return $q.when(true);

    var steps = [

      function() {
        // If on identity: click on certifications
        if ($state.is('app.wot_identity')) {
          var element = $window.document.getElementById('helptip-wot-view-certifications');
          if (!element) return true;
          $timeout(function() {
            angular.element(element).triggerHandler('click');
          });
        }
        return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'fab-certify': 'helptip-certs-certify', {
          bindings: {
            content: 'HELP.TIP.WOT_VIEW_CERTIFY',
            icon: {
              position: UIUtils.screen.isSmall() ? 'bottom-right' : 'center'
            }
          },
          timeout: UIUtils.screen.isSmall() ? 2000 : 1000,
          retry: 10
        });
      },

      function() {
        return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'fab-certify': 'helptip-certs-certify', {
          bindings: {
            content: 'HELP.TIP.CERTIFY_RULES',
            icon: {
              position: 'center',
              glyph: 'ion-alert-circled'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    return $scope.executeStep('certs', steps, startIndex);
  };

  /**
   * Features tour on wallet (if not login)
   * @returns {*}
   */
  $scope.startWalletNoLoginTour = function(startIndex, hasNext) {
    if (csWallet.isLogin()) return $q.when(true); // skip if login

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-account', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_ACCOUNT',
            icon: {
              position: 'left'
            },
            hasNext: hasNext
          }
        });
      },

      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-tx', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_TX',
            icon: {
              position: 'left'
            },
            hasNext: hasNext
          }
        });
      },

      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-wallets', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_WALLETS',
            icon: {
              position: 'left'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    return $scope.executeStep('wallet-no-login', steps, startIndex);
  };

  /**
   * Features tour on wallet screens
   * @returns {*}
   */
  $scope.startWalletTour = function(startIndex, hasNext) {
    if (!csWallet.isLogin()) return $q.when(true); // skip if not login

    var hasCertificationsItem = csWallet.data.isMember||(csWallet.data.requirements && csWallet.data.requirements.pendingMembership);
    var contentParams;

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-account', {
          bindings: {
            content: csWallet.data.isMember ? 'HELP.TIP.MENU_BTN_ACCOUNT_MEMBER' : 'HELP.TIP.MENU_BTN_ACCOUNT',
            icon: {
              position: 'left'
            }
          }
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }

        // Go to wallet
        return $state.go('app.view_wallet')
          .then(function () {
            return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'helptip-wallet-options-xs' : 'helptip-wallet-options', {
              bindings: {
                content: 'HELP.TIP.WALLET_OPTIONS',
                icon: {
                  position: UIUtils.screen.isSmall() ? 'right' : 'center'
                }
              },
              timeout: UIUtils.screen.isSmall() ? 2000 : 1000,
              retry: 10
            });
          });
      },

      // Wallet pubkey
      function () {
        $anchorScroll('helptip-wallet-pubkey');
        return $scope.showHelpTip('helptip-wallet-pubkey', {
          bindings: {
            content: 'HELP.TIP.WALLET_PUBKEY',
            icon: {
              position: 'center'
            },
            hasNext: !hasCertificationsItem && hasNext
          },
          timeout: UIUtils.screen.isSmall() ? 2000 : 500,
          retry: 10
        });
      },

      function () {
        if (!hasCertificationsItem) return hasNext;
        $anchorScroll('helptip-wallet-certifications');
        return $scope.showHelpTip('helptip-wallet-certifications', {
          bindings: {
            content: UIUtils.screen.isSmall() ? 'HELP.TIP.WALLET_RECEIVED_CERTIFICATIONS': 'HELP.TIP.WALLET_CERTIFICATIONS',
            icon: {
              position: 'center'
            },
            hasNext: hasNext
          },
          timeout: 500,
          onError: 'continue' // if simple wallet: no certification item, so continue
        });
      }
    ];

    // Check that constants are well configured
    if (steps.length != csHelpConstants.wallet.stepCount) {
      console.error("[help] Invalid value of 'csHelpConstants.wallet.stepCount'. Please update to {0}".format(steps.length));
    }

    // Get currency parameters, with currentUD
    return csCurrency.get()
      .then(function(currency) {
        contentParams = currency.parameters;
        contentParams.currentUD = currency.currentUD;
        // Launch steps
        return $scope.executeStep('wallet', steps, startIndex);
      });
  };

  /**
   * Features tour on wallet certifications
   * @returns {*}
   */
  $scope.startWalletCertTour = function(startIndex, hasNext) {
    if (!csWallet.isLogin()) return $q.when(true);

    var contentParams;
    var skipAll = false;

    var steps = [

      function() {
        // If on wallet : click on certifications
        if ($state.is('app.view_wallet')) {
          var element = $window.document.getElementById('helptip-wallet-certifications');
          if (!element) {
            skipAll = true;
            return true;
          }
          $timeout(function() {
            angular.element(element).triggerHandler('click');
          });
        }
        if (!UIUtils.screen.isSmall()) return true; // skip this helptip if not in tabs mode
        return $scope.showHelpTip('helptip-received-certs', {
          bindings: {
            content: 'HELP.TIP.WALLET_RECEIVED_CERTS'
          }
        });
      },

      function() {
        if (skipAll || !UIUtils.screen.isSmall()) return true;
        return $state.go('app.view_wallet') // go back to wallet (small device only)
          .then(function() {
            return $scope.showHelpTip('helptip-wallet-given-certifications', {
              bindings: {
                content: 'HELP.TIP.WALLET_GIVEN_CERTIFICATIONS',
                icon: {
                  position: 'center'
                }
              },
              timeout: 500
            });
        });
      },

      function() {
        if (skipAll) return true;

        // Click on given cert link (small device only)
        if ($state.is('app.view_wallet')) {
          var element = $window.document.getElementById('helptip-wallet-given-certifications');
          if (!element) {
            skipAll = true;
            return true;
          }
          $timeout(function() {
            angular.element(element).triggerHandler('click');
          }, 500);
        }
        return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'fab-select-certify': 'helptip-certs-select-certify', {
          bindings: {
            content: 'HELP.TIP.WALLET_CERTIFY',
            icon: {
              position: UIUtils.screen.isSmall() ? 'bottom-right' : 'center'
            }
          },
          timeout: UIUtils.screen.isSmall() ? 2000 : 500,
          retry: 10
        });
      },

      function() {
        if ($scope.tour || skipAll) return hasNext; // skip Rules if features tour (already display)
        return $scope.showHelpTip('helptip-certs-stock', {
          bindings: {
            content: 'HELP.TIP.CERTIFY_RULES',
            icon: {
              position: 'center',
              glyph: 'ion-alert-circled'
            },
            hasNext: hasNext
          }
        });
      }

      /* FIXME : how to select the left tab ?
      ,function() {
        return $scope.showHelpTip('helptip-certs-stock', {
          bindings: {
            content: 'HELP.TIP.WALLET_CERT_STOCK',
            contentParams: contentParams,
            icon: {
              position: 'center'
            },
            hasNext: hasNext
          }
        });
      }*/
    ];

    return csCurrency.parameters().then(function(parameters) {
      contentParams = parameters;
      return $scope.executeStep('certs', steps, startIndex);
    });
  };

  /**
   * Features tour on TX screen
   * @returns {*}
   */
  $scope.startTxTour = function(startIndex, hasNext) {
    if (!csWallet.isLogin()) return $q.when(true); // skip if not login

    var contentParams;

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-tx', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_TX',
            icon: {
              position: 'left'
            }
          }
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }

        // Go to wallet
        return $state.go('app.view_wallet_tx')
          .then(function () {
            return $scope.showHelpTip('helptip-wallet-balance', {
              bindings: {
                content: csSettings.data.useRelative ? 'HELP.TIP.WALLET_BALANCE_RELATIVE' : 'HELP.TIP.WALLET_BALANCE',
                contentParams: contentParams,
                icon: {
                  position: 'center'
                }
              },
              retry: 20 // 10 * 500 = 5s max
            });
          });
      },

      function () {
        return $scope.showHelpTip('helptip-wallet-balance', {
          bindings: {
            content: 'HELP.TIP.WALLET_BALANCE_CHANGE_UNIT',
            contentParams: contentParams,
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            }
          }
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.get()
      .then(function(currency) {
        contentParams = currency.parameters;
        contentParams.currentUD = currency.currentUD;
        // Launch steps
        return $scope.executeStep('tx', steps, startIndex);
      });
  };

  /**
   * Features tour on My wallets
   * @returns {*}
   */
  $scope.startWalletsTour = function(startIndex, hasNext) {

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-wallets', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_WALLETS',
            icon: {
              position: 'left'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    return $scope.executeStep('my-wallets', steps, startIndex);
  };

  /**
   * header tour
   * @returns {*}
   */
  $scope.startHeaderTour = function(startIndex, hasNext) {
    if (UIUtils.screen.isSmall() || csConfig.readonly) return $q.when(true);

    function _getProfilBtnElement() {
      var elements = $window.document.querySelectorAll('#helptip-header-bar-btn-profile');
      if (!elements || !elements.length) return null;
      return _.find(elements, function(el) {return el.offsetWidth > 0;});
    }

    var steps = [
      function () {

        if (UIUtils.screen.isSmall()) return true; // skip for small screen
        var element = _getProfilBtnElement();
        if (!element) return true;

        return $scope.showHelpTip(element, {
          bindings: {
            content: 'HELP.TIP.HEADER_BAR_BTN_PROFILE',
            icon: {
              position: 'right',
              // If home; add offset because of locales button
              style: $state.is('app.home') ? 'margin-right: 60px' : undefined
            }
          }
        });
      },

      function () {
        // small screens
        if (UIUtils.screen.isSmall()) {
          $ionicSideMenuDelegate.toggleLeft(true);
          return $scope.showHelpTip('helptip-menu-btn-settings', {
            bindings: {
              content: 'HELP.TIP.MENU_BTN_SETTINGS',
              icon: {
                position: 'left'
              },
              hasNext: hasNext
            },
            timeout: 1000
          });
        }
        // wide screens
        else {
          var element = _getProfilBtnElement();
          if (!element) return true;
          $timeout(function() {
            angular.element(element).triggerHandler('click');
          });
          return $scope.showHelpTip('helptip-popover-profile-btn-settings', {
            bindings: {
              content: 'HELP.TIP.MENU_BTN_SETTINGS',
              icon: {
                position: 'center'
              },
              hasNext: hasNext
            },
            timeout: 1000
          })
            .then(function(res) {
              // close profile popover
              $scope.closeProfilePopover();
              return res;
            });
        }
      }
    ];

    return $scope.executeStep('header', steps, startIndex);
  };

  /**
   * Settings tour
   * @returns {*}
   */
  $scope.startSettingsTour = function(startIndex, hasNext) {
    var contentParams;
    var steps = [

      function () {
        if (!UIUtils.screen.isSmall() && !csConfig.readonly) return true;
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'helptip-menu-btn-settings' : 'menu-btn-settings', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_SETTINGS',
            icon: {
              position: UIUtils.screen.isSmall() ? 'left' : 'bottom-left'
            }
          },
          timeout: 1000
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }

        // Go to settings
        return $state.go('app.settings')
          .then(function () {
            return $scope.showHelpTip('helptip-settings-btn-unit-relative', {
              bindings: {
                content: 'HELP.TIP.SETTINGS_CHANGE_UNIT',
                contentParams: contentParams,
                icon: UIUtils.screen.isSmall() ? {
                  position: 'right',
                  style: 'margin-right: 60px'
                } : {position: 'center'},
                hasNext: hasNext
              },
              timeout: 1000
            });
          });
      }
    ];

    return csCurrency.parameters()
      .then(function(parameters) {
        contentParams = parameters;
        return $scope.executeStep('settings', steps, startIndex);
      });
  };


  /**
   * Finish the features tour (last step)
   * @returns {*}
   */
  $scope.finishTour = function() {
    if ($ionicSideMenuDelegate.isOpen()) {
      $ionicSideMenuDelegate.toggleLeft(false);
    }

    // If login: redirect to wallet
    if (csWallet.isLogin()) {
      return $state.go('app.view_wallet')
        .then(function(){
          return $scope.showHelpTip('helptip-wallet-pubkey', {
            bindings: {
              content: 'HELP.TIP.END_LOGIN',
              hasNext: false
            },
            timeout: 1200
          });
        });
    }

    // If not login: redirect to home
    else {
      var contentParams;
      return $q.all([
        $scope.showHome(),

        csCurrency.parameters()
          .then(function(parameters) {
            contentParams = parameters;
          })
        ])
        .then(function(){
          return $scope.showHelpTip('helptip-home-logo', {
           bindings: {
             content: !csConfig.readonly ? 'HELP.TIP.END_NOT_LOGIN' : 'HELP.TIP.END_READONLY',
             contentParams: contentParams,
             hasNext: false
           }
          });
        });
    }
  };
}

/* ----------------------------
 *  Help tour (auto start from home page)
 * ---------------------------- */
function HelpTourController($scope) {

  $scope.$on('$ionicView.enter', function(e, state) {
    $scope.startHelpTour();
  });

}
