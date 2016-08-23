
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

    .state('app.currency_view', {
      url: "/currency/view/:name",
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_currency.html",
          controller: 'CurrencyViewCtrl'
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
    })

    .state('app.view_peer', {
      url: "/currency/peer/:server",
      nativeTransitions: {
          "type": "flip",
          "direction": "right"
      },
      views: {
        'menuContent': {
          templateUrl: "templates/currency/view_peer.html",
          controller: 'PeerCtrl'
        }
      }
    });
})

.controller('CurrencyLookupCtrl', CurrencyLookupController)

.controller('CurrencyViewCtrl', CurrencyViewController)

.controller('PeerCtrl', PeerController)

;

function CurrencyLookupController($scope, $state, UIUtils) {
  'ngInject';

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = [];
  $scope.search.looking = true;

  $scope.$on('$ionicView.enter', function() {
    $scope.loadCurrencies()
    .then(function (res) {
      $scope.knownCurrencies = res;
      $scope.search.looking = false;
      if (!!res && res.length == 1) {
        $scope.selectedCurrency = res[0].id;
      }
      // Set Ink
      UIUtils.ink({selector: 'a.item'});
    });
  });

  // Called to navigate to the main app
  $scope.selectCurrency = function(id, large) {
    $scope.selectedCurrency = id;
    if (large) {
      $state.go('app.currency_view_lg', {name: id});
    }
    else {
      $state.go('app.currency_view', {name: id});
    }
  };
}

function CurrencyViewController($scope, $q, $translate, $timeout, BMA, UIUtils, csSettings, csNetwork) {

  $scope.loadingPeers = true;
  $scope.data = csNetwork.data;
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
  $scope.time  = 0;
  $scope.difficulty  = 0;
  $scope.Nprev = 0;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.closeNode();

    $translate(['COMMON.DATE_PATTERN'])
    .then(function($translations) {
      $scope.datePattern = $translations['COMMON.DATE_PATTERN'];
      if ($state.stateParams && $state.stateParams.name) { // Load by name
         $scope.load($scope.name);
      }
      else {
        $scope.loadCurrencies()
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
    $scope.closeNode();
  });

  $scope.load = function(name) {
    $scope.closeNode();

    $scope.node = BMA;
    $scope.startListeningOnSocket();
    $timeout(function() {
      if (!csNetwork.hasPeers() && $scope.loadingPeers){
        $scope.refresh();
      }
    }, 2000);
  };

  $scope.startListeningOnSocket = function() {
    if (!$scope.node) {
      return;
    }

    $scope.node.websocket.block().on('block', function(block) {
      var buid = csNetwork.buid(block);
      if (csNetwork.data.knownBlocks.indexOf(buid) === -1) {
        csNetwork.data.knownBlocks.push(buid);
        // We wait 2s when a new block is received, just to wait for network propagation
        var wait = csNetwork.data.knownBlocks.length === 1 ? 0 : 2000;
        $timeout(function() {
          $scope.refresh();
        }, wait);
      }
    });
    $scope.node.websocket.peer().on('peer', function(peer) {
      csNetwork.onNewPeer(peer);
      csNetwork.processPeers();
    });
  };

  $scope.closeNode = function() {
    if (!$scope.node) {
      return;
    }
    $scope.node.websocket.close();
    $scope.node = null;
  };

  $scope.onUseRelativeChanged = function() {
    if ($scope.loading) return;
    if ($scope.formData.useRelative) {
      $scope.M = $scope.M / $scope.currentUD;
      $scope.MoverN = $scope.MoverN / $scope.currentUD;
      $scope.UD = $scope.UD / $scope.currentUD;
    } else {
      $scope.M = $scope.M * $scope.currentUD;
      $scope.MoverN = $scope.MoverN * $scope.currentUD;
      $scope.UD = $scope.UD * $scope.currentUD;
    }
  };
  $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged, true);

  $scope.refresh = function() {
    if (!$scope.node) {
      return;
    }

    UIUtils.loading.show();

    var M;

    $q.all([

      // Get the currency parameters
      $scope.node.blockchain.parameters()
        .then(function(json){
          $scope.currency = json.currency;
          $scope.c = json.c;
          $scope.dt = json.dt;
          $scope.sigQty = json.sigQty;
        }),

      // Get the current block informations
      $scope.node.blockchain.current()
        .then(function(block){
          M = block.monetaryMass;
          $scope.N = block.membersCount;
          $scope.time  = moment(block.medianTime*1000).format($scope.datePattern);
          $scope.difficulty  = block.powMin;
        }),

      // Get the UD informations
      $scope.node.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return $scope.node.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                $scope.currentUD = (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
                $scope.Nprev = block.membersCount;
              });
          }
        })
    ])

    // Done
    .then(function(){
      var Mprev = M - $scope.currentUD * $scope.Nprev; // remove fresh money
      var MoverN = Mprev / $scope.Nprev;
      $scope.cactual = 100 * $scope.currentUD / MoverN;

      if ($scope.formData.useRelative) {
        $scope.M = Mprev / $scope.currentUD;
        $scope.MoverN = MoverN / $scope.currentUD;
        $scope.UD = 1;
      } else {
        $scope.M = Mprev;
        $scope.MoverN = MoverN;
        $scope.UD = $scope.currentUD;
      }
      // Set Ink
      UIUtils.ink({selector: '.peer-item'});

      $scope.loading = false;

      UIUtils.loading.hide();
    })
    .catch(function(err) {
      $scope.loading = false;
      UIUtils.onError('ERROR.LOAD_NODE_DATA_FAILED')(err);
    })
    .then(function(){
      // Network
      $scope.loadingPeers = true;
      csNetwork.getPeers()
      .then(function() {
        $scope.loadingPeers = false;
      })
      .catch(function(err) {
        $scope.loadingPeers = false;
      });
    });
  };
}
