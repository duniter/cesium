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

  $scope.system.camera = System;

  $scope.searchChanged = function() {
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
   if (System.camera.enable) {
     System.camera.scan()
     .then(function(result) {
       if (!result) {
        $scope.search.text = result.text;
       }
     })
     .catch(UIUtils.alert.error('ERROR.SCAN_FAILED'));
   }
 };
}

function IdentityController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, System) {

  $scope.identity = {};
  $scope.hasSelf = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadIdentity($state.stateParams.pub);
  });

  $scope.loadIdentity = function(pub) {
    UIUtils.loading.show();
    var onLoadFinish = function() {
      UIUtils.loading.hide();

      // Set Motion
      $timeout(function() {
        UIUtils.motion.fadeSlideIn({
            selector: '.item'
        });
      }, 10);
      UIUtils.ink();
    };
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
          onLoadFinish();
        })
        .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));
      })
      .catch(function(err) {
        if (!!err && err.ucode == 2001) { // Identity not found (if no self)
          $scope.hasSelf = false;
          $scope.identity = {
            uid: null,
            pub: pub
          };
          onLoadFinish(); // Continue
        }
        else {
          UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
        }
      });
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

  // Copy
  $scope.copy = function(value) {
    if (value && System.clipboard.enable) {
      System.clipboard.copy(value);
    }
  };

  $scope.selectText = function(elementId) {
    var el = document.getElementById(elementId);
    if (el) {
      UIUtils.selection.select(el);
      var sel = UIUtils.selection.get();
      alert(sel);
    }
  };

  $scope.$parent.clearFabs();
  UIUtils.ink();
}
