angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('app.view_identity', {
        url: "/wot/:pub",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'IdentityCtrl'
          }
        }
      })
  })

  .controller('IdentityCtrl', IdentityController)

  .controller('WotLookupCtrl', WotLookupController)
;

function WotLookupController($scope, BMA, $state) {

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

  $scope.doSelectIdentity = function(pub, uid) {
    $state.go('app.view_identity', {pub: pub});
  };
}

function IdentityController($scope, $state, BMA, Wallet, UIUtils, $q) {

  $scope.identity = {};
  $scope.hasSelf = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadIdentity($state.stateParams.pub);
  });

  $scope.loadIdentity = function(pub) {
    UIUtils.loading.show();
    BMA.wot.lookup({ search: pub })
      .then(function(res){
        $scope.identity = res.results.reduce(function(idties, res) {
          return idties.concat(res.uids.reduce(function(uids, idty) {
            return uids.concat({
              uid: idty.uid,
              pub: res.pubkey,
              sigDate: idty.meta.timestamp,
              sig: idty.self
            })
          }, []));
        }, [])[0];
        $scope.hasSelf = ($scope.identity.uid && $scope.identity.sigDate && $scope.identity.sig);
        UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('Could not load identity'));
  };

  $scope.signIdentity = function(identity) {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.show();
      Wallet.sign($scope.identity.uid,
                  $scope.identity.pub,
                  $scope.identity.sigDate,
                  $scope.identity.sig)
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.alertInfo('Identity successfully signed');
      })
      .catch(UIUtils.onError('Could not certify identity'));
    })
    .catch(UIUtils.onError('Error while login'));
  };

  // Transfer click
  $scope.transfer = function() {
    $state.go('app.view_transfer', {
        pubkey: $scope.identity.pubkey,
        uid: $scope.identity.uid,
      });
  };
}