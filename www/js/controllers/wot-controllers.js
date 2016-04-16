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
      ;
  })

  .controller('IdentityCtrl', IdentityController)

  .controller('WotLookupCtrl', WotLookupController)
;

function WotLookupController($scope, BMA, $state, UIUtils, $timeout, System) {

  $scope.system = System;

  $scope.searchChanged = function() {
    $scope.search.typing = $scope.search.text;
    $scope.search.looking = true;
    $timeout(
      function() {
        if ($scope.search.typing === $scope.search.text) {
          $scope.search.typing = null;
          $scope.doSearch();
        }
      },
      1000);
  };

  $scope.doSearch = function() {
    $scope.search.looking = true;
    var text = $scope.search.text.toLowerCase().trim();
    if (text.length === 0) {
      $scope.search.results = [];
      $scope.search.looking = false;
    }
    else {
      return BMA.wot.lookup({ search: text })
        .then(function(res){
          var idties = res.results.reduce(function(idties, res) {
            return idties.concat(res.uids.reduce(function(uids, idty) {
              var blocUid = idty.meta.timestamp.split('-', 2);
              return uids.concat({
                uid: idty.uid,
                pub: res.pubkey,
                number: blocUid[0],
                hash: blocUid[1]
              });
            }, []));
          }, []);
          $scope.search.results = idties;
          $scope.search.looking = false;
        })
        .catch(function() {
          $scope.search.results = [];
          $scope.search.looking = false;
        });
    }
  };

  $scope.doSelectIdentity = function(pub, uid) {
    $state.go('app.view_identity', {pub: pub});
  };

  $scope.scanQrCode = function(){
   if ($scope.system.camera.enable) {
     $scope.system.camera.scan()
     .then(function(result) {
       if (!result) {
        $scope.search.text = result.text;
       }
     })
     .catch(UIUtils.alert.error('ERROR.SCAN_FAILED'));
   }
 };
}

function IdentityController($scope, $state, BMA, Wallet, UIUtils, $q, ionicMaterialMotion, $timeout, ionicMaterialInk) {

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
            var blocUid = idty.meta.timestamp.split('-', 2);
            return uids.concat({
              uid: idty.uid,
              pub: res.pubkey,
              number: blocUid[0],
              hash: blocUid[1],
              revoked: idty.revoked,
              revokedSig: idty.revocation_sig,
              sig: idty.self
            });
          }, []));
        }, [])[0];
        $scope.hasSelf = ($scope.identity.uid && $scope.identity.sigDate && $scope.identity.sig);
        BMA.blockchain.block({block: $scope.identity.number})
        .then(function(block) {
          $scope.identity.sigDate = block.time;
          UIUtils.loading.hide();

          // Set Motion
          $timeout(function() {
            ionicMaterialMotion.fadeSlideIn({
                selector: '.item'
            });
          }, 10);
        })
        .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));
      })
      .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));
  };

  // Sign click
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
        UIUtils.alertInfo('INFO.CERTIFICATION_DONE');
      })
      .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

  $scope.$parent.clearFabs();

  ionicMaterialInk.displayEffect();

}
