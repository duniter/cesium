
angular.module('cesium.currency.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.currency_lookup', {
      url: "/currencies?q",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/lookup.html",
          controller: 'CurrencyLookupCtrl'
        }
      }
    })

    .state('app.currency_name', {
      url: "/currencies/:currency",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency.html",
          controller: 'CurrencyViewCtrl'
        }
      },
      data: {
        large: 'app.currency_name_lg'
      }
    })

    .state('app.currency', {
      url: "/currency",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency.html",
          controller: 'CurrencyViewCtrl'
        }
      },
      data: {
        large: 'app.currency_lg'
      }
    })

    .state('app.currency.tab_parameters', {
      url: "/parameters",
      views: {
        'tab-parameters': {
          templateUrl: "templates/currency/tabs/tab_parameters.html"
        }
      }
    })

    .state('app.currency.tab_wot', {
      url: "/community",
      views: {
        'tab-wot': {
          templateUrl: "templates/currency/tabs/tab_wot.html"
        }
      }
    })

    .state('app.currency.tab_network', {
      url: "/network",
      views: {
        'tab-network': {
          templateUrl: "templates/currency/tabs/tab_network.html",
          controller: 'NetworkLookupCtrl'
        }
      }
    })

    .state('app.currency.tab_blocks', {
      url: "/blocks",
      views: {
        'tab-blocks': {
          templateUrl: "templates/currency/tabs/tab_blocks.html",
          controller: 'BlockLookupCtrl'
        }
      }
    })

    .state('app.currency_name_lg', {
      url: "/currency/lg/:name",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency_lg.html",
          controller: 'CurrencyViewCtrl'
        }
      }
    })

    .state('app.currency_lg', {
      url: "/currency/lg",
      cache: false,
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency_lg.html",
          controller: 'CurrencyViewCtrl'
        }
      }
    })
  ;

})

.controller('CurrencyLookupCtrl', CurrencyLookupController)

.controller('CurrencyViewCtrl', CurrencyViewController)

  .controller('CurrencyLicenseModalCtrl', CurrencyLicenseModalController)
;

function CurrencyLookupController($scope, $state, $q, UIUtils, BMA, csCurrency) {
  'ngInject';

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = [];
  $scope.search = {
    loading: true,
    results: []
  };
  $scope.entered = false;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!$scope.entered) {
      if (state && state.stateParams && state.stateParams.q) {
        $scope.search.text = state.stateParams.q;
      }

      csCurrency.all()
        .then(function (currencies) {

          $q.all(currencies.map(function(currency) {
            var bma = BMA.lightInstance(currency.peer.host,currency.peer.port);
            return bma.blockchain.current()
              .then(function(block) {
                currency.membersCount = block.membersCount;
              });
          }))
          .then(function() {
            $scope.search.results = currencies;
            $scope.search.loading = false;
            if (!!currencies && currencies.length == 1) {
              $scope.selectedCurrency = currencies[0].id;
            }
            // Set Ink
            UIUtils.ink({selector: 'a.item'});
          });


        });
    }
  });

  // Called to navigate to the main app
  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $state.go('app.currency_name', {currency: currency.name});
  };
}

function CurrencyViewController($scope, $q, $timeout, $ionicPopover, BMA, UIUtils, csSettings, csCurrency, csNetwork, ModalUtils) {

  $scope.formData = {
    useRelative: csSettings.data.useRelative,
    currency: '',
    M: 0,
    MoverN: 0,
    UD: 0,
    cactual: 0,
    c: 0,
    dt: 0,
    sigQty: 0,
    sigStock: 0,
    sigWindow: 0,
    sigPeriod: 0,
    medianTime : 0,
    difficulty : 0,
    Nprev: 0,
    stepMax: 0,
    sentries: 0,
    xpercent: 0,
    durationFromLastUD: 0,
    blockUid: null,
    dtReeval: 0,
    udReevalTime0: 0,
    allRules: angular.isDefined(csSettings.data.currency && csSettings.data.currency.allRules) ?
      csSettings.data.currency.allRules :
      csSettings.data.expertMode,
    allWotRules: angular.isDefined(csSettings.data.currency && csSettings.data.currency.allWotRules) ?
      csSettings.data.currency.allWotRules :
      csSettings.data.expertMode,
    licenseUrl: csSettings.getLicenseUrl()
  };
  $scope.node = null;
  $scope.loading = true;
  $scope.screen = UIUtils.screen;

  $scope.enter = function(e, state) {
    if ($scope.loading) { // run only once (first enter)
      if (state.stateParams && state.stateParams.currency) { // Load by name
        csCurrency.searchByName(state.stateParams.currency)
        .then(function(currency){
          $scope.init(currency);
        });
      }
      else {
        csCurrency.default()
        .then(function (currency) {
          $scope.init(currency);
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
      }

      csNetwork.api.data.on.mainBlockChanged($scope, function(mainBlock) {
        if ($scope.loading) return;
        if ($scope.formData.blockUid !== mainBlock.buid) {
          console.debug("[currency] Updating parameters UI (new main block detected)");
          $timeout($scope.load, 1000 /*waiting propagation to requested node*/);
        }
      });
    }
    // Notify extensions
    $scope.$broadcast('$csExtension.enter', state);
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.init = function(currency) {
    $scope.formData.currency = currency.name;
    $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
      BMA.instance(currency.peer.host, currency.peer.port) : BMA;

    UIUtils.loading.show();

    // Load data
    $scope.load()
      .then(function() {
        // Show help tip, if login
        if ($scope.isLogin()) {
          $scope.showHelpTip();
        }
      });
  };

  $scope.load = function() {
    if (!$scope.node) {
      return;
    }

    // Load data from node
    var data = {}, M, lastUDTime, now = new Date().getTime();
    return $q.all([

      // Get the currency parameters
      $scope.node.blockchain.parameters()
        .then(function(json){
          data.currency = json.currency;
          data.c = json.c;
          data.dt = json.dt;
          data.sigQty = json.sigQty;
          data.sigStock = json.sigStock;
          data.sigWindow = json.sigWindow;
          data.sigPeriod = json.sigPeriod;
          data.stepMax = json.stepMax;
          data.xpercent = json.xpercent;
          data.avgGenTime = json.avgGenTime;
          data.dtReeval = json.dtReeval;
          data.udTime0 = json.udTime0;
          data.udReevalTime0 = json.udReevalTime0;

          // Compat with Duniter < 1.0
          if (!data.dtReeval) {
            data.dtReeval = data.dt;
          }
        }),

      // Get the current block informations
      $scope.node.blockchain.current()
        .then(function(block){
          M = block.monetaryMass;
          data.N = block.membersCount;
          data.medianTime  = block.medianTime;
          data.difficulty  = block.powMin;
          data.blockUid = [block.number, block.hash].join('-');
        })
        .catch(function(err){
          // Special case for currency init (root block not exists): use fixed values
          if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
            data.N = 0;
            data.medianTime = Math.trunc(new Date().getTime() / 1000);
            data.difficulty  = 0;
            return;
          }
          throw err;
        }),

      // Get the UD informations
      $scope.node.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return $scope.node.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                data.currentUD = (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
                lastUDTime = block.medianTime;
                data.Nprev = block.membersCount;
              });
          }
          // block #0
          else {
            lastUDTime=0;
            data.Nprev=0;
            return $scope.node.blockchain.parameters()
              .then(function(json){
                data.currentUD = json.ud0;
              });
          }
        })
    ])

    // Process loaded data
    .then(function(){
      var Mprev = M - data.currentUD * data.Nprev; // remove fresh money
      var MoverNprev = Mprev / data.Nprev;
      data.cactual = MoverNprev ? 100 * data.currentUD / MoverNprev : 0;
      data.M = M;
      data.MoverN = (Mprev ? Mprev : M/*need at currency start only*/) / data.Nprev;
      data.UD = data.currentUD;
      data.durationFromLastUD = lastUDTime ? data.medianTime - lastUDTime : 0;
      data.sentries = Math.ceil(Math.pow(data.N, 1/ data.stepMax));

      // Apply to formData
      angular.extend($scope.formData, data);

      console.debug("[currency] Parameters loaded in " + (new Date().getTime() - now) + 'ms' );
      $scope.loading = false;
      $scope.$broadcast('$$rebind::' + 'rebind'); // force bind of currency name

      // Set Ink
      UIUtils.ink();

      return UIUtils.loading.hide();
    })
    .catch(function(err) {
      $scope.loading = false;
      UIUtils.onError('ERROR.LOAD_PEER_DATA_FAILED')(err);
    });
  };

  $scope.refresh = function() {
    if ($scope.loading) return;

    $scope.loading= true;
    UIUtils.loading.show();

    // Load data
    $scope.load()
      .then(function() {
        // Notify extensions
        $scope.$broadcast('csView.action.refresh', 'currency');
      });
  };

  $scope.refreshPeers = function() {
    $scope.$broadcast('csView.action.refresh', 'peers');
  };

  $scope.showExtendActionsPopover = function(event) {
    $scope.$broadcast('csView.action.showActionsPopover', event);
  };

  $scope.onAllRulesChange = function() {
    csSettings.data.currency = csSettings.data.currency || {};
    if (csSettings.data.currency.allRules !== $scope.formData.allRules) {
      csSettings.data.currency.allRules = $scope.formData.allRules;
      csSettings.store();
    }
  };
  $scope.$watch('formData.allRules', $scope.onAllRulesChange, true);

  $scope.onAllWotRulesChange = function() {
    csSettings.data.currency = csSettings.data.currency || {};
    if (csSettings.data.currency.allWotRules !== $scope.formData.allWotRules) {
      csSettings.data.currency.allWotRules = $scope.formData.allWotRules;
      csSettings.store();
    }
  };
  $scope.$watch('formData.allWotRules', $scope.onAllWotRulesChange, true);

  /* -- help tip -- */


  $scope.startCurrencyTour = function() {
    $scope.hideActionsPopover();
    return $scope.showHelpTip(0, true);
  };

  $scope.showHelpTip = function(index, isTour) {
    index = angular.isDefined(index) ? index : csSettings.data.helptip.currency;
    isTour = angular.isDefined(isTour) ? isTour : false;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(isTour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started
    helptipScope.tour = isTour;

    return helptipScope.startCurrencyTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.currency = endIndex;
        csSettings.store();
      });
  };

  /* -- modals -- */

  $scope.showLicenseModal = function() {
    return ModalUtils.show('templates/currency/modal_license.html','CurrencyLicenseModalCtrl');
  };

  /* -- popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/currency/popover_actions.html', {
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
}


function CurrencyLicenseModalController($scope, $http, UIUtils, csSettings, FileSaver) {
  'ngInject';

  $scope.loading = true;

  $scope.load = function() {
    if ($scope.loading) {
      $scope.licenseUrl = csSettings.getLicenseUrl();
      $scope.loading = false;
    }
  };
  $scope.$on('modal.shown', $scope.load);

  $scope.downloadFile = function() {
    if (!$scope.licenseUrl) return;
    return $http.get($scope.licenseUrl)
      .success(function(data){
        var file = new Blob([data], {type: 'text/plain; charset=utf-8'});
        FileSaver.saveAs(file, 'license.txt');
      }).error(function(data){
        UIUtils.onError('ERROR.GET_LICENSE_FILE_FAILED')();
      });

  };
}
