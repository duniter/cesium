angular.module('cesium.controllers', ['cesium.services'])

  .config(function($httpProvider) {
    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;

    //Remove the header used to identify ajax call  that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })

  .controller('HomeCtrl', HomeController)

  .controller('CurrenciesCtrl', CurrenciesController)

  .controller('ExploreCtrl', ExploreController)

  .controller('IdentityCtrl', IdentityController)

  .controller('PeerCtrl', PeerController)

  .controller('WalletCtrl', WalletController)
;

function WalletController($scope, $rootScope, $ionicModal, Wallet, UIUtils, $q, $state) {

  LoginController.call(this, $scope, $rootScope, $ionicModal, Wallet, UIUtils, $q, $state);

  $scope.wallet = Wallet.data;

  $scope.$on('$ionicView.enter', function(e, $state, $rootScope) {
    if (!Wallet.isLogin()) {
       // TODO: Open login UI
       //$scope.login();
    }
    else {
      $scope.loadBalance();
    }
  });

  // Load balance
  $scope.loadBalance= function() {

    UIUtils.loading.show();
    Wallet.loadBalance()
      .then(function(balance){
        $scope.wallet.balance = balance;
        UIUtils.loading.hide();
    });
  };

  // Login form submit
  $scope.transfer= function() {
    alert('transfer');
  };
}


function LoginController($scope, $rootScope, $ionicModal, Wallet, UIUtils, $q, $state) {
  // Form data for the login modal
  $scope.loginData = {};

  // Login modal
  $scope.loginModal = null;

  // Create the login modal that we will use later
  $ionicModal.fromTemplateUrl('templates/login.html', {
    scope: $scope
  }).then(function(modal) {
    $scope.loginModal = modal;
    $scope.loginModal.hide();
  });

  // Login form submit
  $scope.login = function() {
    $scope.loginModal.show();
  }

  // Triggered in the login modal to close it
  $scope.closeLogin = function() {
    $scope.loginModal.hide();
  };

  // Login form submit
  $scope.doLogin = function() {

    UIUtils.loading.show();

    // Call wallet login
    Wallet.login($scope.loginData.username, $scope.loginData.password)

    // Login succeed
    .then(function(){
        //$scope.wallet = wallet;
        $scope.loginData = {}; // Reset login data
        UIUtils.loading.hide();
        $scope.closeLogin();
    })

    .catch(function(err) {
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('Your browser is not compatible with cryptographic libraries.');
      UIUtils.loading.hide();
    })

    // Redirect to wallet
    .then(function(){
        $state.go('app.view_wallet');
    })
    ;
  };

  // Logout
  $scope.logout = function() {
    UIUtils.loading.show();
    Wallet.logout().then(
        function() {
            UIUtils.loading.hide();
        }
    );
  };

  // Is connected
  $scope.isConnected = function() {
      return Wallet.isLogin();
  };

  // Is not connected
  $scope.isNotConnected = function() {
    return !Wallet.isLogin();
  };
}

function CurrenciesController($scope, $state) {

  $scope.selectedCurrency = '';
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $state.go('app.explore_tabs');
  };
}

function ExploreController($scope, $rootScope, $state, BMA, $q, UIUtils, $interval, $timeout) {

  var USE_RELATIVE_DEFAULT = true;

  CurrenciesController.call(this, $scope, $state);
  LookupController.call(this, $scope, BMA);
  PeersController.call(this, $scope, $rootScope, BMA, UIUtils, $q, $interval, $timeout);

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];
  $scope.formData = { useRelative: false };
  $scope.knownBlocks = [];
  $scope.entered = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered) {
      $scope.entered = true;
      $scope.startListeningOnSocket();
    }
    $timeout(function() {
      if ((!$scope.search.peers || $scope.search.peers.length == 0) && $scope.search.lookingForPeers){
        $scope.updateExploreView();
      }
    }, 2000);
  });

  $scope.startListeningOnSocket = function() {

    // Currency OK
    BMA.websocket.block().on('block', function(block) {
      var theFPR = fpr(block);
      if ($scope.knownBlocks.indexOf(theFPR) === -1) {
        $scope.knownBlocks.push(theFPR);
        // We wait 2s when a new block is received, just to wait for network propagation
        var wait = $scope.knownBlocks.length === 1 ? 0 : 2000;
        $timeout(function() {
          $scope.updateExploreView();
        }, wait);
      }
    });
  };

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

  $scope.doUpdate = function() {
    $scope.updateExploreView();
  };

  $scope.updateExploreView = function() {

    UIUtils.loading.show();
    $scope.formData.useRelative = false;

    $q.all([

      // Get the currency parameters
      BMA.currency.parameters()
        .then(function(json){
          $scope.c = json.c;
          $scope.baseUnit = json.currency;
          $scope.unit = json.currency;
        }),

      // Get the current block informations
      BMA.blockchain.current()
        .then(function(block){
          $scope.M = block.monetaryMass;
          $scope.N = block.membersCount;
          $scope.time  = moment(block.medianTime*1000).format('YYYY-MM-DD HH:mm');
          $scope.difficulty  = block.powMin;
        }),

      // Get the UD informations
      BMA.blockchain.stats.ud()
        .then(function(res){
          if (res.result.blocks.length) {
            var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
            return BMA.blockchain.block({ block: lastBlockWithUD })
              .then(function(block){
                $scope.currentUD = block.dividend;
                $scope.UD = block.dividend;
                $scope.Nprev = block.membersCount;
              });
          }
        })
    ])

      // Done
      .then(function(){
        $scope.M = $scope.M - $scope.UD*$scope.Nprev;
        $scope.MoverN = $scope.M / $scope.Nprev;
        $scope.cactual = 100 * $scope.UD / $scope.MoverN;
        $scope.formData.useRelative = USE_RELATIVE_DEFAULT;
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        console.error('>>>>>>>' , err);
        UIUtils.alert.error('Could not fetch informations from remote uCoin node.');
        UIUtils.loading.hide();
      })
      .then(function(){
        // Network
        $scope.searchPeers();
      });
  };
}

function LookupController($scope, BMA) {

  $scope.searchChanged = function() {
    $scope.search.text = $scope.search.text.toLowerCase();
    if ($scope.search.text.length > 1) {
      $scope.search.looking = true;
      return BMA.wot.lookup({ search: $scope.search.text })
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
        })
        .catch(function() {
          $scope.search.looking = false;
          $scope.search.results = [];
        });
    }
    else {
      $scope.search.results = [];
    }
  };
}

function IdentityController($scope, $state, BMA) {

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.showIdentity($state.stateParams.pub);
  });

  $scope.identity = {};

  $scope.showIdentity = function(pub) {

     BMA.wot.lookup({ search: pub })
        .then(function(res){
          $scope.identity = res.results.reduce(function(idties, res) {
            return idties.concat(res.uids.reduce(function(uids, idty) {
              return uids.concat({
                uid: idty.uid,
                pub: res.pubkey,
                sigDate: idty.meta.timestamp
              })
            }, []));
          }, [])[0];
        })
  };

  $scope.signIdentity = function() {
    alert('signIdentity');
  };
}

function PeersController($scope, $rootScope, BMA, UIUtils, $q, $interval, $timeout) {

  var newPeers = [], interval, lookingForPeers;
  $scope.search.lookingForPeers = false;
  $scope.search.peers = [];

  $scope.overviewPeers = function() {
    var currents = {}, block;
    for (var i = 0, len = $scope.search.peers.length; i < len; i++) {
      block = $scope.search.peers[i].current;
      if (block) {
        var bid = fpr(block);
        currents[bid] = currents[bid] || 0;
        currents[bid]++;
      }
    }
    var fprs = _.keys(currents).map(function(key) {
      return { fpr: key, qty: currents[key] };
    });
    var best = _.max(fprs, function(obj) {
      return obj.qty;
    });
    var p;
    for (var j = 0, len2 = $scope.search.peers.length; j < len2; j++) {
      p = $scope.search.peers[j];
      p.hasMainConsensusBlock = fpr(p.current) == best.fpr;
      p.hasConsensusBlock = !p.hasMainConsensusBlock && currents[fpr(p.current)] > 1;
    }
    $scope.search.peers = _.uniq($scope.search.peers, false, function(peer) {
      return peer.pubkey;
    });
    $scope.search.peers = _.sortBy($scope.search.peers, function(p) {
      var score = 1
        + 10000 * (p.online ? 1 : 0)
        + 1000  * (p.hasMainConsensusBlock ? 1 : 0) +
        + 100   * (p.uid ? 1 : 0);
      return -score;
    });
  };

  $scope.searchPeers = function() {

    if (interval) {
      $interval.cancel(interval);
    }

    interval = $interval(function() {
      if (newPeers.length) {
        $scope.search.peers = $scope.search.peers.concat(newPeers.splice(0));
        $scope.overviewPeers();
      } else if (lookingForPeers && !$scope.search.lookingForPeers) {
        // The peer lookup endend, we can make a clean final report
        $timeout(function(){
          lookingForPeers = false;
          $scope.overviewPeers();
        }, 1000);
      }
    }, 1000);

    var known = {};
    $rootScope.members = [];
    $scope.search.peers = [];
    $scope.search.lookingForPeers = true;
    lookingForPeers = true;
    return BMA.network.peering.peers({ leaves: true })
      .then(function(res){
        return BMA.wot.members()
          .then(function(json){
            $rootScope.members = json.results;
            return res;
          });
      })
      .then(function(res){
        return $q.all(res.leaves.map(function(leaf) {
          return BMA.network.peering.peers({ leaf: leaf })
            .then(function(subres){
              var peer = subres.leaf.value;
              if (peer) {
                peer = new Peer(peer);
                // Test each peer only once
                if (!known[peer.getURL()]) {
                  peer.dns = peer.getDns();
                  peer.blockNumber = peer.block.replace(/-.+$/, '');
                  var member = _.findWhere($rootScope.members, { pubkey: peer.pubkey });
                  peer.uid = member && member.uid;
                  newPeers.push(peer);
                  var node = BMA.instance(peer.getURL());
                  return node.blockchain.current()
                    .then(function(block){
                      peer.current = block;
                      peer.online = true;
                      peer.server = peer.getURL();
                      if ($scope.knownBlocks.indexOf(fpr(block)) === -1) {
                        $scope.knownBlocks.push(fpr(block));
                      }
                    })
                    .catch(function(err) {
                    })
                }
              }
            })
        }))
          .then(function(){
            $scope.search.lookingForPeers = false;
          })
      })
      .catch(function(err) {
        //console.log(err);
        //UIUtils.alert.error('Could get peers from remote uCoin node.');
        //$scope.search.lookingForPeers = false;
      });
  };

  $scope.viewPeer = function() {

  };
}

function fpr(block) {
  return block && [block.number, block.hash].join('-');
}

function HomeController($scope, $rootScope, $ionicSlideBoxDelegate, $ionicModal, $state, BMA, UIUtils, $q, $timeout, Wallet) {

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  CurrenciesController.call(this, $scope, $state);
  LookupController.call(this, $scope, BMA);
  LoginController.call(this, $scope, $rootScope, $ionicModal, Wallet, UIUtils, $q, $state);

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

  $scope.selectCurrency = function(currency) {
    $scope.selectedCurrency = currency;
    $scope.next();
  }
}
