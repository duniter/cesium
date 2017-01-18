
angular.module('cesium.currency.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

    .state('app.currency_lookup', {
      url: "/currencies",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/lookup.html",
          controller: 'CurrencyLookupCtrl'
        }
      }
    })

    .state('app.currency', {
      url: "/currency/view/:name",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency.html",
          controller: 'CurrencyViewCtrl',
        }
      },
      data: {
        large: 'app.currency_view_lg'
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

    .state('app.currency.tab_network', {
      url: "/network",
      views: {
        'tab-network': {
          templateUrl: "templates/currency/tabs/tab_network.html"
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

    .state('app.currency_view_lg', {
      url: "/currency/view/lg/:name",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency_lg.html",
          controller: 'CurrencyViewCtrl'
        }
      }
    });

})

.controller('CurrencyLookupCtrl', CurrencyLookupController)

.controller('CurrencyViewCtrl', CurrencyViewController)
;

function CurrencyLookupController($scope, $state, UIUtils, csCurrency) {
  'ngInject';

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = [];
  $scope.search.looking = true;

  $scope.$on('$ionicView.enter', function() {
    csCurrency.all()
    .then(function (currencies) {
      $scope.knownCurrencies = currencies;
      $scope.search.looking = false;
      if (!!res && res.length == 1) {
        $scope.selectedCurrency = currencies[0].id;
      }
      // Set Ink
      UIUtils.ink({selector: 'a.item'});
    });
  });

  // Called to navigate to the main app
  $scope.selectCurrency = function(id) {
    $scope.selectedCurrency = id;
    $state.go('app.currency_view', {name: id});
  };
}

function CurrencyViewController($scope, $q, $translate, $timeout, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  $scope.formData = {
    useRelative: csSettings.data.useRelative
  };
  $scope.node = null;
  $scope.loading = true;

  $scope.currency = '';
  $scope.M = 0;
  $scope.MoverN = 0;
  $scope.UD = 0;
  $scope.cactual = 0;
  $scope.c = 0;
  $scope.dt = 0;
  $scope.sigQty = 0;
  $scope.sigStock = 0;
  $scope.sigWindow = 0;
  $scope.sigPeriod = 0;
  $scope.medianTime  = 0;
  $scope.difficulty  = 0;
  $scope.Nprev = 0;
  $scope.screen = UIUtils.screen;
  $scope.stepMax = 0;
  $scope.xpercent = 0;

  $scope.$on('$ionicView.enter', function(e, state) {
    $translate('COMMON.DATE_PATTERN')
    .then(function(datePattern) {
      $scope.datePattern = datePattern;
      if (state.stateParams && state.stateParams.name) { // Load by name
        csCurrency.searchByName(state.stateParams.name)
        .then(function(currency){
          $scope.load(currency);
        });
      }
      else {
        csCurrency.all()
        .then(function (currencies) {
          if (currencies && currencies.length > 0) {
            $scope.load(currencies[0]);
          }
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
      }
    });
  });

  $scope.$on('$ionicView.beforeLeave', function(){
    csNetwork.close();
  });

  $scope.load = function(currency) {
    $scope.name = currency.name;
    $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
      BMA.instance(currency.peer.host, currency.peer.port) : BMA;
    UIUtils.loading.show();

    // Load currency parameters
    $scope.loadParameter();

    // Show help tip
    $scope.showHelpTip();
  };

  $scope.loadParameter = function() {
    if (!$scope.node) {
      return;
    }
    // Load data from node
    var M;
    return $q.all([

      // Get the currency parameters
      $scope.node.blockchain.parameters()
        .then(function(json){
          $scope.currency = json.currency;
          $scope.c = json.c;
          $scope.dt = json.dt;
          $scope.sigQty = json.sigQty;
          $scope.sigStock = json.sigStock;
          $scope.sigWindow = json.sigWindow;
          $scope.sigPeriod = json.sigPeriod;
          $scope.stepMax = json.stepMax;
          $scope.xpercent = json.xpercent;
        }),

      // Get the current block informations
      $scope.node.blockchain.current()
        .then(function(block){
          M = block.monetaryMass;
          $scope.N = block.membersCount;
          $scope.medianTime  = block.medianTime;
          $scope.difficulty  = block.powMin;
        })
        .catch(function(err){
          // Special case for currency init (root block not exists): use fixed values
          if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
            $scope.N = 0;
            $scope.medianTime = Math.trunc(new Date().getTime() / 1000);
            $scope.difficulty  = 0;
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
                $scope.currentUD = (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
                console.log("Get block last UD: " + $scope.currentUD);
                $scope.formData.currentUD = $scope.currentUD;
                $scope.Nprev = block.membersCount;
              });
          }
          // block #0
          else {
            $scope.Nprev=0;
            return $scope.node.blockchain.parameters()
              .then(function(json){
                $scope.currentUD = json.ud0;
                $scope.formData.currentUD = $scope.currentUD;
              });
          }
        })
    ])

    // Process loaded data
    .then(function(){
      var Mprev = M - $scope.currentUD * $scope.Nprev; // remove fresh money
      var MoverN = Mprev / $scope.Nprev;
      $scope.cactual = MoverN ? 100 * $scope.currentUD / MoverN : 0;
      $scope.M = Mprev;
      $scope.MoverN = MoverN;
      $scope.UD = $scope.currentUD;
      $scope.loading = false;
      $scope.$broadcast('$$rebind::' + 'rebind'); // force bind of currency name
      UIUtils.loading.hide();
    })
    .catch(function(err) {
      $scope.loading = false;
      UIUtils.onError('ERROR.LOAD_NODE_DATA_FAILED')(err);
    });
  };

  // Show help tip
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    index = csSettings.data.helptip.currency;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startCurrencyTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.currency = endIndex;
        csSettings.store();
      });
  };
}
