
angular.module('cesium.currency.controllers', ['ngFileSaver', 'cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

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

  .controller('CurrencyViewCtrl', CurrencyViewController)

  .controller('CurrencyLicenseModalCtrl', CurrencyLicenseModalController)
;

function CurrencyViewController($scope, $q, $timeout, $ionicPopover, Modals, BMA, UIUtils, csSettings, csCurrency, csNetwork, ModalUtils) {

  $scope.formData = {
    useRelative: false, // Override in enter()
    currency: '',
    M: 0,
    MoverN: 0,
    UD: 0,
    cactual: 0,
    c: 0,
    dt: 0,
    sigQty: 0,
    sigStock: 0,
    msWindow: 0,
    msValidity: 0,
    sigWindow: 0,
    sigValidity: 0,
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
  $scope.loading = true;
  $scope.screen = UIUtils.screen;

  $scope.enter = function(e, state) {
    if ($scope.loading) { // run only once (first enter)
      $scope.formData.useRelative = csSettings.data.useRelative;
      csCurrency.get()
        .then($scope.load)
        .then(function() {
          // Show help tip, if login
          if ($scope.isLogin()) {
            $scope.showHelpTip();
          }
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));

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

  $scope.load = function() {
    // Load data from node
    var data = {}, M, lastUDTime, now = Date.now();
    return $q.all([

      // Get the currency parameters
      BMA.blockchain.parameters()
        .then(function(json){
          data.currency = json.currency;
          data.c = json.c;
          data.dt = json.dt;
          data.sigQty = json.sigQty;
          data.sigStock = json.sigStock;
          data.msWindow = json.msWindow;
          data.msValidity = json.msValidity;
          data.sigWindow = json.sigWindow;
          data.sigValidity = json.sigValidity;
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
      BMA.blockchain.current()
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
            M = 0;
            data.N = 0;
            data.medianTime = moment().utc().unix();
            data.difficulty  = 0;
            data.blockUid = null;
            return;
          }
          throw err;
        }),

      // Get the UD informations
      BMA.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return BMA.blockchain.block({ block: lastBlockWithUD })
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
            return BMA.blockchain.parameters()
              .then(function(json){
                data.currentUD = json.ud0;
              });
          }
        })
    ])

    // Process loaded data
    .then(function(){
      var Mprev = M - data.currentUD * data.Nprev; // remove fresh money
      var MoverNprev = data.Nprev ? (Mprev / data.Nprev) : 0;
      data.cactual = MoverNprev ? 100 * data.currentUD / MoverNprev : 0;
      data.M = M;
      data.MoverN = data.Nprev ? ((Mprev ? Mprev : M/*need at currency start only*/) / data.Nprev) : 0;
      data.UD = data.currentUD;
      data.durationFromLastUD = lastUDTime ? data.medianTime - lastUDTime : 0;
      data.sentries = Math.ceil(Math.pow(data.N, 1/ data.stepMax));

      // Apply to formData
      angular.extend($scope.formData, data);

      console.debug("[currency] Parameters loaded in " + (Date.now() - now) + 'ms' );
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
    return $scope.load()
      .then(function() {
        // Notify extensions
        $scope.$broadcast('csView.action.refresh', 'currency');
      });
  };

  $scope.refreshPeers = function() {
    $scope.$broadcast('csView.action.refresh', 'peers');
    return $q.when(); // need by 'ion-refresher'
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
  $scope.$watch('formData.allRules', $scope.onAllRulesChange);

  $scope.onAllWotRulesChange = function() {
    csSettings.data.currency = csSettings.data.currency || {};
    if (csSettings.data.currency.allWotRules !== $scope.formData.allWotRules) {
      csSettings.data.currency.allWotRules = $scope.formData.allWotRules;
      csSettings.store();
    }
  };
  $scope.$watch('formData.allWotRules', $scope.onAllWotRulesChange);

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

  $scope.showHelpModal = function(helpAnchor) {
    Modals.showHelp({anchor: helpAnchor});
  };

  /* -- popover -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'templates/currency/popover_actions.html',
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
}


function CurrencyLicenseModalController($scope, $http, UIUtils, csSettings, FileSaver) {
  'ngInject';

  $scope.loading = true;

  $scope.load = function() {
    if ($scope.loading) {
      $scope.licenseUrl = csSettings.getLicenseUrl();
      // Use HTML in iframe, when original file is markdown (fix #538)
      if ($scope.licenseUrl && $scope.licenseUrl.substring($scope.licenseUrl.length - 3) != '.txt') {
        $scope.licenseUrlHtml = $scope.licenseUrl + '.html';
        $scope.licenseUrl = $scope.licenseUrl +'.txt';
      }
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
      }).error(function(){
        UIUtils.onError('ERROR.GET_LICENSE_FILE_FAILED')();
      });

  };
}
