// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium-api', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate', 'ngApi', 'angular-cache', 'angular.screenmatch',
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  'cesium.filters', 'cesium.config', 'cesium.platform', 'cesium.templates', 'cesium.translations', 'cesium.directives',
  // API dependencies :
  'cesium.services', 'cesium.login.controllers', 'cesium.help.controllers'
])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';
    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/api/menu.html",
        controller: 'ApiCtrl'
      })

      .state('app.home', {
        url: "/home?result&service&cancel",
        views: {
          'menuContent': {
            templateUrl: "templates/api/home.html",
            controller: 'ApiDocCtrl'
          }
        }
      })

      .state('api', {
        url: "/v1",
        abstract: true,
        templateUrl: "templates/api/menu.html",
        controller: 'ApiCtrl'
      })

      .state('api.transfer', {
        url: "/payment/:pubkey?name&amount&udAmount&comment&redirect_url&cancel_url&demo",
        views: {
          'menuContent': {
            templateUrl: "templates/api/transfer.html",
            controller: 'ApiTransferCtrl'
          }
        }
      });

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');
  })

  .controller('ApiCtrl', function ($scope, $state, Modals){
    'ngInject';


    $scope.showAboutModal = function(e) {
      e.preventDefault(); // avoid to open link href
      Modals.showAbout();
    };

    $scope.showHome = function() {
      $state.go('app.home') ;
    };
  })

  .controller('ApiDocCtrl', function ($scope, $rootScope){
    'ngInject';

    $scope.transferData = {
      demo: true,
      amount: 100,
      comment: 'REF-0111',
      name: 'mon-site.com',
      pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU',
      redirect_url: $rootScope.rootPath + '#/app/home?result={comment}&service=payment',
      cancel_url: $rootScope.rootPath + '#/app/home?cancel&service=payment'
    };
    $scope.result = {};

    $scope.enter = function(e, state) {
      $scope.result = {};
      if (state.stateParams && state.stateParams.service) {
        $scope.result.type = state.stateParams.service;
      }
      if (state.stateParams && state.stateParams.result) {
        $scope.result.content = state.stateParams.result;
      }
      if (state.stateParams && state.stateParams.cancel) {
        $scope.result.cancelled = true;
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

  })

  .controller('ApiTransferCtrl', function ($scope, $rootScope, $timeout, $controller, $state, $q, $translate, $filter,
                                           BMA, UIUtils, csCurrency, csTx, csWallet){
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('AuthCtrl', {$scope: $scope}));

    $scope.loading = true;
    $scope.transferData = {
      amount: undefined,
      comment: undefined,
      pubkey: undefined,
      name: undefined,
      redirect_url: undefined,
      cancel_url: undefined
    };

    $scope.enter = function(e, state) {
      if (state.stateParams && state.stateParams.amount) {
        $scope.transferData.amount  = parseFloat(state.stateParams.amount.replace(new RegExp('[.,]'), '.')).toFixed(2) * 100;
      }
      if (state.stateParams && state.stateParams.pubkey) {
        $scope.transferData.pubkey = state.stateParams.pubkey;
      }
      if (state.stateParams && state.stateParams.name) {
        $scope.transferData.name= state.stateParams.name;
      }
      if (state.stateParams && state.stateParams.comment) {
        $scope.transferData.comment = state.stateParams.comment;
      }
      if (state.stateParams && state.stateParams.redirect_url) {
        $scope.transferData.redirect_url = state.stateParams.redirect_url;
      }
      if (state.stateParams && state.stateParams.cancel_url) {
        $scope.transferData.cancel_url = state.stateParams.cancel_url;
      }
      if (state.stateParams && state.stateParams.demo) {
        $scope.demo = true;
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

    function createDemoWallet() {
      return {
        start: function() {
          return $q.when();
        },
        login: function() {
          return $q.when({
            uid: 'Demo',
            pubkey: 'fakeDemoPublicKey'
          });
        },
        transfer: function() {
          return $q.when();
        }
      };
    }

    function onLogin(authData) {
      if (!authData) return;

      var wallet = $scope.demo ? createDemoWallet() : csWallet.instance('api', BMA);

      UIUtils.loading.show();

      wallet.start({skipRestore: true})
        .then(function() {
          return wallet.login({auth: true, authData: authData});
        })
        .then(function(walletData) {
          $scope.login = true;

          UIUtils.loading.hide();
          return $scope.askTransferConfirm(walletData);
        })
        .then(function(confirm) {
          if (!confirm) return;
          // sent transfer
          return UIUtils.loading.show()
            .then(function(){
              var amount = parseInt($scope.transferData.amount); // remove 2 decimals on quantitative mode
              return wallet.transfer($scope.transferData.pubkey, amount, $scope.transferData.comment, false /*always quantitative mode*/);
            })
            .then(function() {
              UIUtils.loading.hide();
              return true; // sent
            })
            .catch(UIUtils.onError('API.TRANSFER.ERROR.TRANSFER_FAILED'));
        })
        .then(function(sent) {
          if (sent && $scope.transferData.redirect_url) {
            return $timeout(function () {
              // if iframe: send to parent
              if (window.top && window.top.location) {
                window.top.location.href = $scope.transferData.redirect_url;
              }
              else if (parent && parent.document && parent.document.location) {
                parent.document.location.href = $scope.transferData.redirect_url;
              }
              else {
                window.location.assign($scope.transferData.redirect_url);
              }
            }, 3000);
          }
        });
    }


    $scope.askTransferConfirm = function(walletData) {
      return $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
        .then(function(translations) {
          return $translate('CONFIRM.TRANSFER', {
            from: walletData.isMember ? walletData.uid : $filter('formatPubkey')(walletData.pubkey),
            to: $scope.transferData.name || $filter('formatPubkey')($scope.transferData.pubkey),
            amount: $scope.transferData.amount / 100,
            unit: $filter('abbreviate')($rootScope.currency.name),
            comment: (!$scope.transferData.comment || $scope.transferData.comment.trim().length === 0) ? translations['COMMON.EMPTY_PARENTHESIS'] : $scope.transferData.comment
          });
        })
        .then(UIUtils.alert.confirm);
    };

    /* -- methods need by Login controller -- */

    $scope.setForm = function(form) {
      $scope.form = form;
    };
    $scope.closeModal = onLogin;

  })

  .run(function(csPlatform) {
    'ngInject';

    csPlatform.start();
  })
;
