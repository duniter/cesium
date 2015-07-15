angular.module('cesium.controllers', ['cesium.services'])

  .controller('HomeCtrl', HomeController)

  .controller('CurrenciesCtrl', CurrenciesController)

  .controller('ExploreCtrl', ExploreController)

  .controller('AppCtrl', function($scope, $ionicModal, $timeout) {

    // With the new view caching in Ionic, Controllers are only called
    // when they are recreated or on app start, instead of every page change.
    // To listen for when this page is active (for example, to refresh data),
    // listen for the $ionicView.enter event:
    //$scope.$on('$ionicView.enter', function(e) {
    //});

    // Form data for the login modal
    $scope.loginData = {};

    // Create the login modal that we will use later
    $ionicModal.fromTemplateUrl('templates/login.html', {
      scope: $scope
    }).then(function(modal) {
      $scope.modal = modal;
    });

    // Triggered in the login modal to close it
    $scope.closeLogin = function() {
      $scope.modal.hide();
    };

    // Open the login modal
    $scope.login = function() {
      $scope.modal.show();
    };

    // Perform the login action when the user submits the login form
    $scope.doLogin = function() {
      console.log('Doing login', $scope.loginData);

      // Simulate a login delay. Remove this and replace with your login
      // code if using a login system
      $timeout(function() {
        $scope.closeLogin();
      }, 1000);
    };
  })
;

function CurrenciesController($scope) {

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $scope.$emit('currencySelected', currency);
  };
}

function ExploreController($scope, $state, BMA, $q, UIUtils) {

  CurrenciesController.call(this, $scope);
  LookupController.call(this, $scope, BMA);
  PeersController.call(this, $scope, BMA, UIUtils, $q);

  var dataDone = false;

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];
  $scope.formData = { useRelative: false };

  $scope.$on('currencySelected', function(e) {
    if (!dataDone) {
      UIUtils.loading.show();
    }
    $state.go('app.explore_tabs');
    e.stopPropagation();
  });

  $scope.$watch('formData.useRelative', function() {
    if ($scope.formData.useRelative) {
      $scope.M = $scope.M / $scope.currentUD;
      $scope.MoverN = $scope.MoverN / $scope.currentUD;
      $scope.UD = $scope.UD / $scope.currentUD;
      $scope.unit = 'universal_dividend';
      $scope.udUnit = $scope.baseUnit;
    } else {
      $scope.M = $scope.M * $scope.currentUD;
      $scope.MoverN = $scope.MoverN * $scope.currentUD;
      $scope.UD = $scope.UD * $scope.currentUD;
      $scope.unit = $scope.baseUnit;
      $scope.udUnit = '';
    }
  }, true);

  $q.all([

    // Get the currency parameters
    BMA.currency.parameters.get()

      .$promise
      .then(function(json){
        $scope.c = json.c;
        $scope.baseUnit = json.currency;
        $scope.unit = json.currency;
      }),

    // Get the current block informations
    BMA.blockchain.current.get()
      .$promise
      .then(function(block){
        $scope.M = block.monetaryMass;
        $scope.N = block.membersCount;
        $scope.time  = moment(block.medianTime*1000).format('YYYY-MM-DD HH:mm');
        $scope.difficulty  = block.powMin;
      }),

    // Get the UD informations
    BMA.blockchain.stats.ud.get()
      .$promise
      .then(function(res){
        if (res.result.blocks.length) {
          var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
          return BMA.blockchain.block.get({ block: lastBlockWithUD })
            .$promise
            .then(function(block){
              $scope.currentUD = block.dividend;
              $scope.UD = block.dividend;
              $scope.Nprev = block.membersCount;
            });
        }
      }),

    // Network
    $scope.searchPeers()
  ])

    // Done
    .then(function(){
      $scope.M = $scope.M - $scope.UD*$scope.Nprev;
      $scope.MoverN = $scope.M / $scope.Nprev;
      $scope.cactual = 100 * $scope.UD / $scope.MoverN;
      UIUtils.loading.hide();
      dataDone = true;
    })
    .catch(function() {
      UIUtils.alert.error('Could not fetch informations from remote uCoin node.');
      UIUtils.loading.hide();
    });
}

function LookupController($scope, BMA) {

  $scope.searchChanged = function() {
    $scope.search.text = $scope.search.text.toLowerCase();
    if ($scope.search.text.length > 1) {
      $scope.search.looking = true;
      return BMA.wot.lookup.get({ search: $scope.search.text })
        .$promise
        .then(function(res){
          $scope.search.looking = false;
          $scope.search.results = res.results.reduce(function(idties, res) {
            return idties.concat(res.uids.reduce(function(uids, idty) {
              return uids.concat({
                uid: idty.uid,
                pub: res.pubkey,
                sigDate: idty.meta.timestamp
              })
            }, []));
          }, []);
        });
    }
    else {
      $scope.search.results = [];
    }
  };
}

function PeersController($scope, BMA, UIUtils, $q) {

  $scope.search.lookingForPeers = false;
  $scope.search.peers = [];

  $scope.searchPeers = function() {
    $scope.search.peers = [];
    $scope.search.lookingForPeers = true;
    return BMA.network.peering.peers.get({ leaves: true })
      .$promise
      .then(function(res){
        return $q.all(res.leaves.map(function(leaf) {
          return BMA.network.peering.peers.get({ leaf: leaf })
            .$promise
            .then(function(subres){
              var peer = subres.leaf.value;
              if (peer) {
                peer = new Peer(peer);
                peer.dns = peer.getDns();
                peer.blockNumber = peer.block.replace(/-.+$/, '');
                $scope.search.peers.push(peer);
                var node = BMA.instance(peer.getURL());
                return node.blockchain.current.get()
                  .$promise
                  .then(function(block){
                    peer.current = block;
                  })
                  .catch(function() {
                  })
              }
            })
        }))
          .then(function(){
            $scope.search.lookingForPeers = false;
          })
      })
      .catch(function(err) {
        console.log(err);
        UIUtils.alert.error('Could get peers from remote uCoin node.');
        //$scope.search.lookingForPeers = false;
      });
  };
}

function HomeController($scope, $ionicSlideBoxDelegate, $ionicModal, BMA, $timeout) {

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  CurrenciesController.call(this, $scope);
  LookupController.call(this, $scope, BMA);

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.cancel = function() {
    $scope.modal.hide();
    $timeout(function(){
      $scope.selectedCurrency = '';
      $scope.accountTypeMember = null;
      $scope.search.text = '';
      $scope.search.results = [];
    }, 200);
  };

  $scope.$on('currencySelected', function() {
    $ionicSlideBoxDelegate.slide(1);
  });

  $scope.selectAccountTypeMember = function(bool) {
    $scope.accountTypeMember = bool;
    $ionicSlideBoxDelegate.slide(2);
  };

  $scope.next = function() {
    $ionicSlideBoxDelegate.next();
  };
  $scope.previous = function() {
    $ionicSlideBoxDelegate.previous();
  };

  // Called each time the slide changes
  $scope.slideChanged = function(index) {
    $scope.slideIndex = index;
    $scope.nextStep = $scope.slideIndex == 2 ? 'Start using MyApp' : 'Next';
  };

  $scope.addAccount = function() {
    $scope.modal.show();
    $scope.slideChanged(0);
    $ionicSlideBoxDelegate.slide(0);
    $ionicSlideBoxDelegate.enableSlide(false);
    // TODO: remove default
    //$timeout(function() {
    //  $scope.selectedCurrency = $scope.knownCurrencies[0];
    //  $scope.accountTypeMember = true;
    //  $scope.searchChanged();
    //  $scope.search.text = 'cgeek';
    //  $ionicSlideBoxDelegate.next();
    //  $ionicSlideBoxDelegate.next();
    //}, 300);
  };

  // Create the account modal that we will use later
  $ionicModal.fromTemplateUrl('templates/account/new_account.html', {
    scope: $scope
  }).then(function(modal) {
    $scope.modal = modal;
    $scope.modal.hide();
    // TODO: remove auto add account when done
    //$timeout(function() {
    //  $scope.addAccount();
    //}, 400);
  });
}

function Peer(json) {

  var that = this;

  var BMA_REGEXP = /^BASIC_MERKLED_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))$/;

  Object.keys(json).forEach(function(key) {
    that[key] = json[key];
  });

  that.endpoints = that.endpoints || [];
  that.statusTS = that.statusTS || 0;

  that.keyID = function () {
    return that.pubkey && that.pubkey.length > 10 ? that.pubkey.substring(0, 10) : "Unknown";
  };

  that.copyValues = function(to) {
    var obj = that;
    ["version", "currency", "pub", "endpoints", "hash", "status", "statusTS", "block", "signature"].forEach(function (key) {
      to[key] = obj[key];
    });
  };

  that.copyValuesFrom = function(from) {
    var obj = that;
    ["version", "currency", "pub", "endpoints", "block", "signature"].forEach(function (key) {
      obj[key] = from[key];
    });
  };

  that.json = function() {
    var obj = that;
    var json = {};
    ["version", "currency", "endpoints", "status", "block", "signature"].forEach(function (key) {
      json[key] = obj[key];
    });
    json.raw = that.getRaw();
    json.pubkey = that.pubkey;
    return json;
  };

  that.getBMA = function() {
    var bma = null;
    that.endpoints.forEach(function(ep){
      var matches = !bma && ep.match(BMA_REGEXP);
      if (matches) {
        bma = {
          "dns": matches[2] || '',
          "ipv4": matches[4] || '',
          "ipv6": matches[6] || '',
          "port": matches[8] || 9101
        };
      }
    });
    return bma || {};
  };

  that.getDns = function() {
    var bma = that.getBMA();
    return bma.dns ? bma.dns : null;
  };

  that.getIPv4 = function() {
    var bma = that.getBMA();
    return bma.ipv4 ? bma.ipv4 : null;
  };

  that.getIPv6 = function() {
    var bma = that.getBMA();
    return bma.ipv6 ? bma.ipv6 : null;
  };

  that.getPort = function() {
    var bma = that.getBMA();
    return bma.port ? bma.port : null;
  };

  that.getHost = function() {
    var bma = that.getBMA();
    var host =
      (bma.ipv6 ? bma.ipv6 :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    return host;
  };

  that.getURL = function() {
    var bma = that.getBMA();
    var base =
      (bma.ipv6 ? '[' + bma.ipv6 + ']' :
        (bma.ipv4 ? bma.ipv4 :
          (bma.dns ? bma.dns : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  that.getNamedURL = function() {
    var bma = that.getBMA();
    var base =
      (bma.dns ? bma.dns :
        (bma.ipv4 ? bma.ipv4 :
          (bma.ipv6 ? '[' + bma.ipv6 + ']' : '')));
    if(bma.port)
      base += ':' + bma.port;
    return base;
  };

  that.isReachable = function () {
    return that.getURL() ? true : false;
  };
}