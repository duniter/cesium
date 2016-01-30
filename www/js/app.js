// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium', ['ionic', 'cesium.controllers'])

  .filter('formatInteger', function() {
    return function(input) {
      return input ? numeral(input).format('0,0') : '';
    }
  })

  .filter('formatDate', function() {
    return function(input) {
      return input ? moment(parseInt(input)*1000).format('YYYY-MM-DD HH:mm') : '';
    }
  })

  .filter('abbreviate', function() {
    return function(input) {
      var unit = '', sepChars = ['-', '_', ' '], currency = input || '';
      for (var i = 0; i < currency.length; i++) {
        var c = currency[i];
        if (i == 0 || (i > 0 && sepChars.indexOf(currency[i-1]) != -1)) {
          unit += c;
        }
      }
      return unit.toUpperCase();
    }
  })

  .filter('formatPubkey', function() {
    return function(input) {
      return input ? input.substr(0,8) : '';
    }
  })

.run(function($ionicPlatform) {
  $ionicPlatform.ready(function() {
    // Hide the accessory bar by default (remove this to show the accessory bar above the keyboard
    // for form inputs)
    if (window.cordova && window.cordova.plugins.Keyboard) {
      cordova.plugins.Keyboard.hideKeyboardAccessoryBar(true);
    }
    if (window.StatusBar) {
      // org.apache.cordova.statusbar required
      StatusBar.styleDefault();
    }
  });
})

.config(function($stateProvider, $urlRouterProvider) {
  $stateProvider

    .state('app', {
      url: "/app",
      abstract: true,
      templateUrl: "templates/menu.html",
      controller: 'HomeCtrl'
    })

    .state('app.home', {
      url: "/home",
      views: {
        'menuContent': {
          templateUrl: "templates/home.html",
          controller: 'HomeCtrl'
        }
      }
    })

    .state('app.explore_currency', {
      url: "/home/explore",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/explore_currency.html",
          controller: 'CurrenciesCtrl'
        }
      }
    })

    .state('app.explore_tabs', {
      url: "/currency",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/explore_tabs.html",
          controller: 'ExploreCtrl'
        }
      }
    })

    .state('app.view_peer', {
      url: "/peer/:server",
      views: {
        'menuContent': {
          templateUrl: "templates/explore/view_peer.html",
          controller: 'PeerCtrl'
        }
      }
    })

    .state('app.view_identity', {
      url: "/wot/:pub",
      views: {
        'menuContent': {
          templateUrl: "templates/wot/view_identity.html",
          controller: 'IdentityCtrl'
        }
      }
    })

    .state('app.view_wallet', {
          url: "/wallet",
          views: {
            'menuContent': {
              templateUrl: "templates/account/view_wallet.html",
              controller: 'WalletCtrl'
            }
          }
     })

     .state('app.view_transfer', {
            url: "/transfer/:pubkey/:uid",
            /*params: [
               'uid', 'pubkey'
            ],*/
            views: {
              'menuContent': {
                templateUrl: "templates/account/view_transfer.html",
                controller: 'TransferCtrl'
              }
            }
       })
    ;
  // if none of the above states are matched, use this as the fallback
  $urlRouterProvider.otherwise('/app/home');
});
