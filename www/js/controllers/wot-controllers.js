angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot?q",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html",
            controller: 'WotLookupCtrl'
          }
        }
      })

      .state('app.wot_view_identity', {
        url: "/wot/:pubkey/:uid",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.wot_view_cert', {
        url: "/wot/cert/:pubkey/:uid",
        nativeTransitions: {
            "type": "flip",
            "direction": "right"
        },
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_certifications.html",
            controller: 'WotCertificationsViewCtrl'
          }
        }
      })
      ;
  })

  .controller('WotLookupCtrl', WotLookupController)

  .controller('WotLookupModalCtrl', WotLookupModalController)

  .controller('WotIdentityViewCtrl', WotIdentityViewController)

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)
;

function WotLookupController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $filter) {
  'ngInject';

  $scope.search = {
    text: '',
    looking: false,
    results: []
  };
  $scope.entered = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered && $state.stateParams && $state.stateParams.q) { // Query parameter
      $scope.search.text=$state.stateParams.q;
      $timeout(function() {
        $scope.doSearch();
      }, 100);
    }
    $scope.entered = true;
  });

  $scope.doSearch = function() {
    $scope.search.looking = true;
    var text = $scope.search.text.toLowerCase().trim();
    if (text.length < 3) {
      $scope.search.results = [];
      $scope.search.looking = false;
    }
    else {
      WotService.search(text)
      .then(function(idties){
        if ($scope.search.text.toLowerCase().trim() !== text) return; // search text has changed
        $scope.search.results = idties;
        $scope.search.looking = false;

        $timeout(function() {
          UIUtils.ink();
        }, 10);
      })
      .catch(UIUtils.onError('ERROR.WOT_LOOKUP_FAILED'));
    }
  };

  $scope.resetWotSearch = function() {
    $scope.search = {
      text: null,
      looking: false,
      results: []
    };
  };

  $scope.select = function(identity) {
    // identity = self -> open the user wallet
    if (Wallet.isUserPubkey(identity.pubkey)) {
      $state.go('app.view_wallet');
    }
    // Open identity view
    else {
      $state.go('app.wot_view_identity', {
        pubkey: identity.pubkey,
        uid: identity.uid
      });
    }
  };

  $scope.scanQrCode = function(){
    if (!Device.isEnable()) {
      return;
    }
    Device.camera.scan()
    .then(function(result) {
      if (!result) {
        return;
      }
      BMA.uri.parse(result)
      .then(function(obj){
        if (obj.pubkey) {
          $scope.search.text = obj.pubkey;
        }
        else if (result.uid) {
          $scope.search.text = obj.uid;
        }
        else {
          $scope.search.text = result;
        }
        $scope.doSearch();
      });
    })
    .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
  };
}

function WotLookupModalController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $filter){
  'ngInject';

  WotLookupController.call(this, $scope, BMA, $state, UIUtils, $timeout, Device, Wallet, WotService, $filter);

  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.select = function(identity){
    $scope.closeModal({
      pubkey: identity.pubkey,
      uid: identity.uid
    });
  };

}

function WotIdentityViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, Device, WotService) {
  'ngInject';

  $scope.formData = {};
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams &&
        $state.stateParams.pubkey &&
        $state.stateParams.pubkey.trim().length > 0) {
      if ($scope.loading) {
        $scope.load(
          $state.stateParams.pubkey.trim(),
          $state.stateParams.uid.trim()
        );
      }
    }
    else {
      // Redirect to home
      $state.go('app.home');
    }
  });

  $scope.load = function(pubkey) {
    WotService.load(pubkey)
    .then(function(identity){
      $scope.formData = identity;
      $scope.loading = false;
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight();
        UIUtils.ink();
      }, 10);
    })
    .catch(function(err) {
      $scope.loading = false;
      UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
    });
  };

  // Copy
  $scope.copy = function(value) {
    if (value && Device.isEnable()) {
      Device.clipboard.copy(value);
    }
  };

  $scope.showFab('fab-transfer');
}

function WotCertificationsViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, Device, $ionicPopup, WotService) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.pubkey &&
        $state.stateParams.pubkey.trim().length >  0) {
      if ($scope.loading) {
        $scope.load($state.stateParams.pubkey.trim());
      }
    }
    // Redirect o home
    else {
      $timeout(function() {
        $state.go('app.home', null);
      }, 10);
    }
  });

  $scope.load = function(pubkey, force) {
    WotService.load(pubkey)
    .then(function(identity){
      $scope.formData = identity;
      $scope.canCertify = Wallet.isLogin() && !Wallet.isUserPubkey(pubkey) && Wallet.data.isMember;
      $scope.alreadyCertified = $scope.canCertify ? !!_.findWhere(identity.certifications, { uid: Wallet.data.uid, valid: true }) : false;

      $scope.loading = false;

      // Effects
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight();
        UIUtils.ink();
        if ($scope.canCertify) {
          $scope.showFab('fab-certify');
        }
      }, 10);
    });
  }

  // Certify click
  $scope.certify = function() {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.hide();
      UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES')
      .then(function(confirm){
        if (!confirm) {
          return;
        }
        UIUtils.loading.show();
        Wallet.certify($scope.formData.uid,
                    $scope.formData.pubkey,
                    $scope.formData.timestamp,
                    $scope.formData.sig)
        .then(function() {
          UIUtils.loading.hide();
          UIUtils.alert.info('INFO.CERTIFICATION_DONE');
        })
        .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
      });
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    $scope.load($scope.formData.pubkey, true);
  };
}
