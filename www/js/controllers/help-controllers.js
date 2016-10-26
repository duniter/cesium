
angular.module('cesium.help.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.help_tour', {
        url: "/help/tour",
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

;


function HelpController($scope, $state, $timeout, $anchorScroll, csSettings) {
  'ngInject';

  $scope.$on('$ionicView.enter', function(e) {
    $scope.locale = csSettings.data.locale.id;
    if ($state.stateParams && $state.stateParams.anchor) {
      $timeout(function () {
        $anchorScroll($state.stateParams.anchor);
      }, 100);
    }
  });
}

function HelpModalController($scope, $timeout, $anchorScroll, csSettings, parameters) {
  'ngInject';

  $scope.locale = csSettings.data.locale.id;

  if (parameters && parameters.anchor) {
    $timeout(function() {
      $anchorScroll(parameters.anchor);
    }, 100);
  }
}


/* ----------------------------
*  Help Tip
* ---------------------------- */
function HelpTipController($scope, $rootScope, $state, $window, $ionicSideMenuDelegate, $timeout, $q, $translate, $sce,
                           UIUtils, csConfig, csSettings, csCurrency, Device, Wallet) {

  $scope.tour = false; // Is a tour or a helptip ?

  $scope.emptyPromise = function(result) {
    var defer = $q.defer();
    $timeout(function() {
      defer.resolve(result);
    });
    return defer.promise;
  };

  $scope.executeStep = function(partName, steps, index) {
    index = angular.isDefined(index) ? index : 0;

    if (index >= steps.length) {
      return $scope.emptyPromise(true); // end
    }

    var step = steps[index];
    if (typeof step !== 'function') {
      throw new Error('[helptip] Invalid step at index {0} of \'{1}\' tour: step must be a function'.format(index, partName));
    }
    var promise = step();
    if (typeof promise === 'boolean') {
      promise = $scope.emptyPromise(promise);
    }
    return promise
      .then(function(next) {
        if (angular.isUndefined(next)) {
          return index; // keep same index (no button press: popover just closed)
        }
        if (!next || index === steps.length - 1) {
          return next ? -1 : index+1; // last step OK, so mark has finished
        }
        return $scope.executeStep(partName, steps, index+1);
      })
      .catch(function(err) {
        console.error(err);
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

    // Currency tour
    return $scope.startCurrencyTour(0, true)
      .then(function(endIndex){
        if (!endIndex) return false;
        csSettings.data.helptip.currency=endIndex;
        csSettings.store();
        return true;
      })

      // Wot tour
      .then(function(next){
        if (!next) return false;
        return $scope.startWotTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wot=endIndex;
            csSettings.store();
            return true;
          });
      })

      // Identity certifications tour
      .then(function(next){
        if (!next) return false;
        return $scope.startWotCertTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wotCerts=endIndex;
            csSettings.store();
            return true;
          });
      })

      // Wallet tour (if NOT login)
      .then(function(next){
        if (!next) return false;
        return $scope.startWalletNoLoginTour(0, true);
      })

      // Wallet tour (if login)
      .then(function(next){
        if (!next) return false;
        if (!Wallet.isLogin()) return true; // not login: continue
        return $scope.startWalletTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.wallet=endIndex;
            csSettings.store();
            return true;
          });
      })

      // Wallet certifications tour
      .then(function(next){
        if (!next) return false;
        if (!Wallet.isLogin()) return true; // not login: continue
        return $scope.startWalletCertTour(0, true)
          .then(function(endIndex){
            if (!endIndex) return false;
            csSettings.data.helptip.walletCerts=endIndex;
            csSettings.store();
            return true;
          });
      })

      // Header tour
      .then(function(next){
        if (!next) return false;
        return $scope.startHeaderTour(0, true);
      })

      // Settings tour
      .then(function(next){
        if (!next) return false;
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

    var showNetworkViewIsNeed  = function() {
      if ($state.is('app.currency_view')) {
        // Select the second tabs
        $timeout(function () {
          var tabs = $window.document.querySelectorAll('ion-tabs .tabs a');
          if (tabs && tabs.length == 2) {
            angular.element(tabs[1]).triggerHandler('click');
          }
        }, 100);
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
              position: 'left'
            }
          }
        });
      },

      function () {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }
        return $state.go(UIUtils.screen.isSmall() ? 'app.currency_view' : 'app.currency_view_lg')
          .then(function () {
            return $scope.showHelpTip('helptip-currency-newcomers', {
              bindings: {
                content: 'HELP.TIP.CURRENCY_WOT',
                icon: {
                  position: 'center'
                }
              },
              timeout: 1200 // need for Firefox
            });
          });
      },

      function () {
        return $scope.showHelpTip('helptip-currency-mass-member', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_MASS',
            icon: {
              position: 'center'
            }
          }
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

      function () {
        if (!csSettings.data.useRelative) return true; //skip but continue
        return $scope.showHelpTip('helptip-currency-change-unit', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_CHANGE_UNIT',
            contentParams: contentParams,
            icon: {
              position: UIUtils.screen.isSmall() ? 'right' : 'center'
            }
          }
        });
      },

      function () {
        if (csSettings.data.useRelative) return true; //skip but continue
        return $scope.showHelpTip('helptip-currency-change-unit', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_CHANGE_UNIT_TO_RELATIVE',
            contentParams: contentParams,
            icon: {
              position: UIUtils.screen.isSmall() ? 'right' : 'center'
            }
          }
        });
      },

      function () {
        return $scope.showHelpTip('helptip-currency-rules', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_RULES',
            icon: {
              position: 'bottom-left'
            }
          }
        });
      },

      function() {
        showNetworkViewIsNeed();
        return $scope.showHelpTip('helptip-currency-peers', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_BLOCKCHAIN',
            icon: {
              position: 'center',
              glyph: 'ion-information-circled'
            }
          }
        });
      },

      function() {
        showNetworkViewIsNeed();
        return $scope.showHelpTip('helptip-currency-peer-0', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_PEERS',
            icon: {
              position: 'center'
            }
          },
          timeout: 1000,
          retry: 20
        });
      },


      function() {
        showNetworkViewIsNeed();
        return $scope.showHelpTip('helptip-currency-peer-0-block', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_PEERS_BLOCK_NUMBER',
            icon: {
              position: 'right'
            }
          }
        });
      },

      function() {
        showNetworkViewIsNeed();
        var locale = csSettings.data.locale.id;
        return $scope.showHelpTip('helptip-currency-peers', {
          bindings: {
            content: 'HELP.TIP.CURRENCY_PEERS_PARTICIPATE',
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
    return csCurrency.default().then(function(currency) {
      contentParams = currency.parameters;
      // Launch steps
      return $scope.executeStep('currency', steps, startIndex);
    });
  };

  /**
   * Features tour on WOT registry
   * @returns {*}
   */
  $scope.startWotTour = function(startIndex, hasNext) {

    var contentParams;

    var steps = [
      function() {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-wot', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_WOT',
            icon: {
              position: 'left'
            }
          },
          onError: 'continue'
        });
      },

      function() {
        if ($ionicSideMenuDelegate.isOpen()) {
          $ionicSideMenuDelegate.toggleLeft(false);
        }
        return $state.go('app.wot_lookup')
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
          }
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
            icon: {
              position: 'center'
            }
          },
          timeout: 2500
        });
      },

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
            }
          }
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.default().then(function(currency) {
      contentParams = currency.parameters;
      contentParams.currentUD = $rootScope.walletData.currentUD;
      // Launch steps
      return $scope.executeStep('wot', steps, startIndex);
    });
  };

  /**
   * Features tour on wot certifications
   * @returns {*}
   */
  $scope.startWotCertTour = function(startIndex, hasNext) {
    var steps = [

      function() {
        // If on identity: click on certifications
        if ($state.is('app.wot_view_identity')) {
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
    if (Wallet.isLogin()) return $scope.emptyPromise(true); // skip if login

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-account', {
          bindings: {
            content: $rootScope.walletData.isMember ? 'HELP.TIP.MENU_BTN_ACCOUNT_MEMBER' : 'HELP.TIP.MENU_BTN_ACCOUNT',
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
    if (!Wallet.isLogin()) return $scope.emptyPromise(true); // skip if not login

    var contentParams;

    var steps = [
      function () {
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-account', {
          bindings: {
            content: $rootScope.walletData.isMember ? 'HELP.TIP.MENU_BTN_ACCOUNT_MEMBER' : 'HELP.TIP.MENU_BTN_ACCOUNT',
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
            return $scope.showHelpTip('helptip-wallet-balance', {
              bindings: {
                content: csSettings.data.useRelative ? 'HELP.TIP.WALLET_BALANCE_RELATIVE' : 'HELP.TIP.WALLET_BALANCE',
                contentParams: contentParams,
                icon: {
                  position: 'center'
                }
              },
              retry: 10 // 10 * 500 = 5s max
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
      },

      function () {
        return $scope.showHelpTip('helptip-wallet-certifications', {
          bindings: {
            content: 'HELP.TIP.WALLET_CERTIFICATIONS',
            icon: {
              position: 'center'
            }
          },
          onError: 'continue'
        });
      },

      function () {
        return $scope.showHelpTip(UIUtils.screen.isSmall() ? 'helptip-wallet-options-xs' : 'helptip-wallet-options', {
          bindings: {
            content: 'HELP.TIP.WALLET_OPTIONS',
            icon: {
              position: UIUtils.screen.isSmall() ? 'right' : 'center'
            },
            hasNext: hasNext
          }
        });
      }
    ];

    // Get currency parameters, with currentUD
    return csCurrency.default()
      .then(function(currency) {
        contentParams = currency.parameters;
        contentParams.currentUD = $rootScope.walletData.currentUD;
        // Launch steps
        return $scope.executeStep('wallet', steps, startIndex);
      });
  };

  /**
   * Features tour on wallet certifications
   * @returns {*}
   */
  $scope.startWalletCertTour = function(startIndex, hasNext) {
    if (!Wallet.isLogin()) return $scope.emptyPromise(true);

    var contentParams;

    var steps = [

      function() {
        // If on wallet : click on certifications
        if ($state.is('app.view_wallet')) {
          var element = $window.document.getElementById('helptip-wallet-certifications');
          if (!element) return true;
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
        if ($state.is('app.wallet_view_cert')) {
          // Select the second tabs
          $timeout(function() {
            var tabs = $window.document.querySelectorAll('ion-tabs .tabs a');
            if (tabs && tabs.length == 2) {
              angular.element(tabs[1]).triggerHandler('click');
            }
          }, 100);
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
        if ($scope.tour) return true; // skip Rules if features tour (already display)
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

    return csCurrency.default().then(function(currency) {
      contentParams = currency.parameters;
      return $scope.executeStep('certs', steps, startIndex);
    });
  };

  /**
   * header tour
   * @returns {*}
   */
  $scope.startHeaderTour = function(startIndex, hasNext) {
    if (UIUtils.screen.isSmall()) return $scope.emptyPromise(true);

    var steps = [
      function () {

        if (UIUtils.screen.isSmall()) return true; // skip for small screen
        var elements = $window.document.querySelectorAll('#helptip-header-bar-btn-profile');
        if (!elements || !elements.length) return true;
        return $scope.showHelpTip(elements[elements.length -1], {
          bindings: {
            content: 'HELP.TIP.HEADER_BAR_BTN_PROFILE',
            icon: {
              position: 'right'
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
          var elements = $window.document.querySelectorAll('#helptip-header-bar-btn-profile');
          if (!elements || !elements.length) return true;
          var element = elements[elements.length -1];
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
        if (!UIUtils.screen.isSmall()) return true;
        $ionicSideMenuDelegate.toggleLeft(true);
        return $scope.showHelpTip('helptip-menu-btn-settings', {
          bindings: {
            content: 'HELP.TIP.MENU_BTN_SETTINGS',
            icon: {
              position: 'left'
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
                icon: {
                  position: 'right'
                },
                hasNext: hasNext
              },
              timeout: 1000
            });
          });
      }
    ];

    return csCurrency.default()
      .then(function(currency) {
        contentParams = currency.parameters;
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
    if (Wallet.isLogin()) {
      return $state.go('app.view_wallet')
        .then(function(){
          return $scope.showHelpTip('helptip-wallet-balance', {
            bindings: {
              content: 'HELP.TIP.END_LOGIN',
              hasNext: false
            }
          });
        });
    }

    // If not login: redirect to home
    else {
      var contentParams;
      return $q.all([
        $state.go('app.home'),

        csCurrency.default()
          .then(function(parameters) {
            contentParams = parameters;
          })
        ])
        .then(function(){
          return $scope.showHelpTip('helptip-home-logo', {
           bindings: {
             content: 'HELP.TIP.END_NOT_LOGIN',
             contentParams: contentParams,
             hasNext: false
           }
          });
        });
    }
  };
}
