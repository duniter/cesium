
angular.module('cesium.settings.controllers', ['cesium.services', 'cesium.currency.controllers'])
  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.settings', {
        url: "/settings",
        views: {
          'menuContent': {
            templateUrl: "templates/settings/settings.html",
            controller: 'SettingsCtrl'
          }
        }
      })
    ;
  })

  .controller('SettingsCtrl', SettingsController)
;

function SettingsController($scope, $q, $window, $ionicHistory, $ionicPopup, $timeout, $translate, $ionicPopover, $ionicScrollDelegate,
                            UIUtils, Modals, BMA, csHttp, csConfig, csCurrency, csSettings, csPlatform) {
  'ngInject';

  $scope.formData = angular.copy(csSettings.data);
  $scope.popupData = {}; // need for the node popup
  $scope.loading = true;
  $scope.nodePopup = {};
  $scope.bma = BMA;
  $scope.listeners = [];
  $scope.platform = {
    loading: !csPlatform.isStarted(),
    loadingMessage: 'COMMON.LOADING'
  };
  $scope.timeouts = csSettings.timeouts;
  $scope.keepAuthIdleLabels = {
    /*0: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.NEVER'
    },*/
    10: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.SECONDS',
      labelParams: {value: 10}
    },
    30: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.SECONDS',
      labelParams: {value: 30}
    },
    60: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.MINUTE',
      labelParams: {value: 1}
    },
    600: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.MINUTES',
      labelParams: {value: 10}
    },
    3600: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.HOUR',
      labelParams: {value: 1}
    },
    9999: {
      labelKey: 'SETTINGS.KEEP_AUTH_OPTION.ALWAYS'
    }
  };
  $scope.keepAuthIdles = _.keys($scope.keepAuthIdleLabels);

  $scope.blockValidityWindowLabels = {
    0: {
      labelKey: 'SETTINGS.BLOCK_VALIDITY_OPTION.NONE'
    },
    6: {
      labelKey: 'SETTINGS.BLOCK_VALIDITY_OPTION.N',
      labelParams: {count: 6, time: undefined /*defined in enter*/}
    },
    12: {
      labelKey: 'SETTINGS.BLOCK_VALIDITY_OPTION.N',
      labelParams: {count: 12, time: undefined /*defined in enter*/}
    },
    24: {
      labelKey: 'SETTINGS.BLOCK_VALIDITY_OPTION.N',
      labelParams: {count: 24, time: undefined /*defined in enter*/}
    }
  };
  $scope.blockValidityWindows = _.keys($scope.blockValidityWindowLabels);

  $scope.enter = function() {
    $scope.addListeners();

    $q.all([
      csSettings.ready(),
      csCurrency.parameters()
        .catch(function(err) {
          // Continue (will use default value)
          // Make sure to continue even if node is down - Fix #788
        })
        .then(function(parameters) {
          var avgGenTime = parameters && parameters.avgGenTime;
          if (!avgGenTime || avgGenTime < 0) {
            console.warn('[settings] Could not not currency parameters. Using default G1 \'avgGenTime\' (300s)');
            avgGenTime = 300; /* = G1 value = 5min */
          }
          _.each($scope.blockValidityWindows, function(blockCount) {
            if (blockCount > 0) {
              $scope.blockValidityWindowLabels[blockCount].labelParams.time = avgGenTime * blockCount;
            }
          });
        })
    ])
    .then($scope.load);
  };

  $scope.setPopupForm = function(popupForm) {
    $scope.popupForm = popupForm;
  };

  $scope.load = function() {
    $scope.loading = true; // to avoid the call of csWallet.store()

    $scope.platform.loading = !csPlatform.isStarted();

    // Fill locales
    $scope.locales = angular.copy(csSettings.locales);



    // Apply settings
    angular.merge($scope.formData, csSettings.data);

    // Make sure to use full locale object (id+name)
    $scope.formData.locale = (csSettings.data.locale && csSettings.data.locale.id && _.findWhere($scope.locales, {id: csSettings.data.locale.id})) ||
      _.findWhere($scope.locales, {id: csSettings.defaultSettings.locale.id});


    return $timeout(function() {
      $scope.loading = false;
      // Set Ink
      UIUtils.ink({selector: '.item'});
      $scope.showHelpTip();
    }, 100);
  };


  $scope.addListeners = function() {
    $scope.listeners = [
      // Listen platform start message
      csPlatform.api.start.on.message($scope, function(message) {
        $scope.platform.loading = !csPlatform.isStarted();
        $scope.platform.loadingMessage = message;
      })
    ];
  };

  $scope.leave = function() {
    console.debug('[settings] Leaving page');
    $scope.removeListeners();
  };

  $scope.reset = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
    $scope.pendingSaving = true;
    csSettings.reset()
      .then(csPlatform.restart)
      .then(function() {
        // reload
        $scope.load();
        $scope.pendingSaving = false;
      });
  };

  $scope.changeLanguage = function(langKey) {
    $translate.use(langKey);
  };

  $scope.changeExpertMode = function(expertMode) {
    // Restart platform, to auto select node
    if (!expertMode) {
      csPlatform.restart();
    }
  };

  // Change node
  $scope.changeNode = function(node, confirm) {

    // If platform not stared yet: wait then loop
    if (!csPlatform.isStarted()) {
      UIUtils.loading.update({template: this.loadingMessage});
      return csPlatform.ready()
        .then(function() {
          return $scope.changeNode(node, confirm); // Loop
        });
    }

    // Ask user to confirm, before allow to change the node
    if (!confirm && !$scope.formData.expertMode) {
      return UIUtils.alert.confirm('CONFIRM.ENABLE_EXPERT_MODE_TO_CHANGE_NODE', 'CONFIRM.POPUP_WARNING_TITLE', {
        cssClass: 'warning',
        cancelText: 'COMMON.BTN_NO',
        okText: 'COMMON.BTN_YES_CONTINUE',
        okType: 'button-assertive'
      })
      .then(function(confirm) {
        if (!confirm) return;
        $scope.changeNode(node, true);
      });
    }

    // If not given, get node from settings data
    if (!node || !node.host) {
      var host = $scope.formData.node.host;
      if (!host) return; // Should never occur

      var useSsl = angular.isDefined($scope.formData.node.useSsl) ?
        $scope.formData.node.useSsl :
        ($scope.formData.node.port == 443);
      var port = !!$scope.formData.node.port && $scope.formData.node.port != 80 && $scope.formData.node.port != 443 ? $scope.formData.node.port : undefined;
      var path = $scope.formData.node.path || (host.indexOf('/') !== -1 ? host.substring(host.indexOf('/')) : '');
      if (path.endsWith('/')) path = path.substring(0, path.length - 1); // Remove trailing slash
      host = host.indexOf('/') !== -1 ? host.substring(0, host.indexOf('/')) : host; // Remove path from host
      node = {
        host: host,
        port: port,
        path: path,
        useSsl: useSsl
      };
    }

    $scope.showNodePopup(node)
      .then(function(newNode) {
        if (newNode.host === $scope.formData.node.host &&
          newNode.port == $scope.formData.node.port &&
          newNode.path === $scope.formData.node.path &&
          newNode.useSsl === $scope.formData.node.useSsl &&
          !$scope.formData.node.temporary) {
          return; // same node = nothing to do
        }

        // Change to expert mode
        $scope.formData.expertMode = true;

        UIUtils.loading.show();

        BMA.isAlive(newNode)
          .then(function(alive) {
            if (!alive) {
              UIUtils.loading.hide();
              return UIUtils.alert.error('ERROR.INVALID_NODE_SUMMARY')
                .then(function(){
                  $scope.changeNode(newNode, true); // loop
                });
            }
            UIUtils.loading.hide();
            angular.merge($scope.formData.node, newNode);
            delete $scope.formData.node.temporary;
            BMA.stop();
            BMA.copy(newNode);
            $scope.bma = BMA;

            // Restart platform (or start if not already started)
            csPlatform.restart();

            // Reset history cache
            return $ionicHistory.clearCache();
          });
      });
  };

  $scope.showNodeList = function() {
    // Check if need a filter on SSL node
    var forceUseSsl = (csConfig.httpsMode === 'true' || csConfig.httpsMode === true || csConfig.httpsMode === 'force') ||
    ($window.location && $window.location.protocol === 'https:') ? true : false;

    $ionicPopup._popupStack[0].responseDeferred.promise.close();
    return Modals.showNetworkLookup({
      enableFilter: true, // enable filter button
      bma: true, // only BMA node
      ssl: forceUseSsl ? true : undefined
    })
      .then(function (peer) {
        if (peer) {
          var bma = peer.getBMA();
          var host = (bma.dns ? bma.dns :
            (peer.hasValid4(bma) ? bma.ipv4 : bma.ipv6));
          var useSsl = bma.useSsl || bma.port == 443;
          var port = bma.port || (useSsl ? 443 : 80);
          return {
            host: host,
            port: port,
            path: bma.path || '',
            useSsl: useSsl
          };
        }
      })
      .then(function(newNode) {
        $scope.changeNode(newNode, true);
      });
  };

  // Show node popup
  $scope.showNodePopup = function(node) {
    return $q(function(resolve, reject) {
      var useSsl = node.useSsl || node.port == 443;
      var host = (node.port && node.port != 80 && node.port != 443) ? [node.host, node.port].join(':') : node.host;
      if (node.path && node.path.length && node.path !== '/') host += node.path;
      $scope.popupData.newNode = host;
      $scope.popupData.useSsl = useSsl;
      if (!!$scope.popupForm) {
        $scope.popupForm.$setPristine();
      }
      $translate(['SETTINGS.POPUP_PEER.TITLE', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/settings/popup_node.html',
            title: translations['SETTINGS.POPUP_PEER.TITLE'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.popupForm.$submitted=true;
                  if(!$scope.popupForm.$valid || !$scope.popupForm.newNode) {
                    //don't allow the user to close unless he enters a node
                    e.preventDefault();
                  } else {
                    return {
                      host: $scope.popupData.newNode,
                      useSsl: $scope.popupData.useSsl
                    };
                  }
                }
              }
            ]
          })
          .then(function(res) {
            if (!res || !res.host) { // user cancel
              UIUtils.loading.hide();
              reject('CANCELLED');
              return;
            }
            var host = res.host;
            var path = host.indexOf('/') !== -1 ? host.substring(host.indexOf('/')) : '';
            host = host.indexOf('/') !== -1 ? host.substring(0, host.indexOf('/')) : host;
            var parts = host.split(':', 2);
            host = parts[0];
            var port = parts[1] ? parts[1] : (res.useSsl ? 443 : 80);
            var useSsl = res.useSsl || port == 443;
            resolve({
              host: host,
              port: port,
              path: path,
              useSsl: useSsl
            });
          });
        });
      });
    };

  $scope.save = function() {
    if ($scope.loading || $scope.pendingSaving) return $q.when();
    if ($scope.saving) {
      $scope.pendingSaving = true;
      // Retry later
      return $timeout(function() {
        $scope.pendingSaving = false;
        return $scope.save();
      }, 500);
    }
    $scope.saving = true;

    var now = Date.now();

    // Async - to avoid UI lock
    return $timeout(function() {
      console.debug('[settings] Saving...');

      // Make sure to format helptip
      $scope.cleanupHelpTip();

      // Applying
      csSettings.apply($scope.formData);

      // Applying UI effect
      UIUtils.setEffects($scope.formData.uiEffects);

      // Store
      return csSettings.store();

    }, 100)
    .then(function() {
      //return $timeout(function() {
      $scope.saving = false;
      console.debug('[settings] Saving [OK] in {0}ms'.format(Date.now() - now));
      //}, 100);
    });
  };

  $scope.onDataChanged = function(oldValue, newValue, scope) {
    if ($scope.loading || $scope.pendingSaving) return $q.when();
    if ($scope.saving) {
      $scope.pendingSaving = true;
      // Retry later
      return $timeout(function() {
        $scope.pendingSaving = false;
        return $scope.onDataChanged(oldValue, newValue, scope);
      }, 500);
    }

    // Changes from the current scope: save changes
    if ((scope === $scope) && !angular.equals(oldValue, newValue)) {
      $scope.save();
    }
  };
  $scope.$watch('formData', $scope.onDataChanged, true);

  // Detected changes from outside (e.g. enabling encryption on wallet can be rollback if user cancel auth)
  csSettings.api.data.on.changed($scope, function(data) {
    if ($scope.loading || $scope.saving || $scope.pendingSaving) return;

    var updated = !angular.equals(data.useLocalStorageEncryption, $scope.formData.useLocalStorageEncryption);
    if (updated) {
      console.debug('[settings] Settings changed (outside the settings page). Reloading...');
      $scope.load();
    }
  });

  $scope.getServer = function() {
    if (!$scope.formData.node || !$scope.formData.node.host) return '';
    return csHttp.getServer($scope.formData.node.host, $scope.formData.node.port);
  };

  $scope.cleanupHelpTip = function() {
    var helptipChanged = $scope.formData.helptip.enable !== csSettings.data.helptip.enable;
    if (helptipChanged) {
      var enable = $scope.formData.helptip.enable;
      // Apply default values
      $scope.formData.helptip = angular.merge({}, csSettings.defaultSettings.helptip);
      // Then restore the enable flag
      $scope.formData.helptip.enable = enable;
    }
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'templates/settings/popover_actions.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
  };

  $scope.startSettingsTour = function() {
    $scope.hideActionsPopover();

    return $scope.showHelpTip(0, true);
  };

  // Show help tip (show only not already shown)
  $scope.showHelpTip = function(index, tour) {
    if (!$scope.isLogin() && !tour) return;
    index = angular.isDefined(index) ? index : csSettings.data.helptip.settings;
    if (index < 0) return;
    if (index === 0) index = 1; // skip first step

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(tour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    $ionicScrollDelegate.scrollTop(true);
    return helptipScope.startSettingsTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.settings = endIndex;
        csSettings.store();
      });
  };

  $scope.removeListeners = function() {
    if ($scope.listeners.length) {
      console.debug('[settings] Closing listeners');
      _.forEach($scope.listeners, function(remove){
        remove();
      });
      $scope.listeners = [];
    }
  };

  $scope.$on('$ionicView.enter', $scope.enter);
  $scope.$on('$ionicView.beforeLeave', $scope.leave);

}
