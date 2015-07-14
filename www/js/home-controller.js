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

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  CurrenciesController.call(this, $scope);

  var dataDone = false;

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];
  $scope.formData = { useRelative: false };

  // Called to navigate to the main app
  $scope.startApp = function() {
    $scope.modal.hide();
  };

  $scope.$on('currencySelected', function() {
    if (!dataDone) {
      UIUtils.loading.show();
    }
    $state.go('app.explore_tabs');
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
      })
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

function HomeController($scope, $ionicSlideBoxDelegate, $ionicModal, BMA) {

  // With the new view caching in Ionic, Controllers are only called
  // when they are recreated or on app start, instead of every page change.
  // To listen for when this page is active (for example, to refresh data),
  // listen for the $ionicView.enter event:
  //$scope.$on('$ionicView.enter', function(e) {
  //});

  CurrenciesController.call(this, $scope);

  $scope.accountTypeMember = null;
  $scope.accounts = [];
  $scope.search = { text: '', results: {} };
  $scope.knownCurrencies = ['meta_brouzouf'];

  // Called to navigate to the main app
  $scope.startApp = function() {
    $scope.modal.hide();
  };

  $scope.$on('currencySelected', function() {
    $ionicSlideBoxDelegate.slide(1);
  });

  $scope.selectAccountTypeMember = function(bool) {
    $scope.accountTypeMember = bool;
    $ionicSlideBoxDelegate.slide(2);
  };

  $scope.searchChanged = function() {
    console.log('Search %s', $scope.search.text);
    if ($scope.search.text.length > 2) {
      BMA.wot.lookup.get({ search: $scope.search.text })
        .$promise
        .then(function(res){
          $scope.search.results = res.results.reduce(function(idties, res) {
            return idties.concat([res.pubkey]);
          }, []);
        });
    }
  };

  $scope.next = function() {
    $ionicSlideBoxDelegate.next();
  };
  $scope.previous = function() {
    $ionicSlideBoxDelegate.previous();
  };

  // Called each time the slide changes
  $scope.slideChanged = function(index) {
    console.log('Changed to %s', index);
    $scope.slideIndex = index;
    $scope.nextStep = $scope.slideIndex == 2 ? 'Start using MyApp' : 'Next';
  };

  $scope.addAccount = function() {
    $scope.modal.show();
    $scope.slideChanged(0);
    $ionicSlideBoxDelegate.slide(0);
    // TODO: remove default
    //$scope.selectedCurrency = $scope.knownCurrencies[0];
    //$scope.accountTypeMember = true;
    //$timeout(function() {
    //  $ionicSlideBoxDelegate.next();
    //  $ionicSlideBoxDelegate.next();
    //}, 10);
  };

  // Create the account modal that we will use later
  $ionicModal.fromTemplateUrl('templates/account/new_account.html', {
    scope: $scope
  }).then(function(modal) {
    $scope.modal = modal;
    $scope.modal.hide();
    //$scope.addAccount();
  });

  //// Form data for the login modal
  //$scope.loginData = {};
  //
  //
  //// Triggered in the login modal to close it
  //$scope.closeLogin = function() {
  //  $scope.modal.hide();
  //};
  //
  //// Open the login modal
  //$scope.login = function() {
  //  $scope.modal.show();
  //};
  //
  //// Perform the login action when the user submits the login form
  //$scope.doLogin = function() {
  //  console.log('Doing login', $scope.loginData);
  //
  //  // Simulate a login delay. Remove this and replace with your login
  //  // code if using a login system
  //  $timeout(function() {
  //    $scope.closeLogin();
  //  }, 1000);
  //};
}