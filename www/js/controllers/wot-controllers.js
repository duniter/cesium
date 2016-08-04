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

      .state('app.view_identity', {
        url: "/wot/view/:pubkey",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.view_certifications', {
        url: "/wot/cert/:pub",
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

  .controller('WotIdentityViewCtrl', WotIdentityViewController)

  .controller('WotLookupCtrl', WotLookupController)

  .controller('WotLookupModalCtrl', WotLookupModalController)

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)
;

function WotLookupController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet, IdentityService, UserService) {
  'ngInject';

  $scope.search = {
    text: '',
    looking: false,
    results: []
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.q) { // Query parameter
      $scope.search.text=$state.stateParams.q;
      $timeout(function() {
        $scope.doSearch();
      }, 100);
    }
  });

  $scope.doSearch = function() {
    $scope.search.looking = true;
    var text = $scope.search.text.toLowerCase().trim();
    if (text.length === 0) {
      $scope.search.results = [];
      $scope.search.looking = false;
    }
    else {
      IdentityService.search(text)
      .then(function(idties){
        if ($scope.search.text.toLowerCase().trim() !== text) return; // search text has changed
        $scope.search.results = idties;
        $scope.search.looking = false;
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

  $scope.doSelectIdentity = function(pubkey, uid) {
    if (!!pubkey && Wallet.isLogin() && !!Wallet.data && Wallet.data.pubkey == pubkey) {
      $state.go('app.view_wallet'); // open the user wallet
    }
    else {
      $state.go('app.view_identity', {pubkey: pubkey});
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

function WotLookupModalController($scope, BMA, $state, UIUtils, $timeout, Device, Wallet){
  'ngInject';

  WotLookupController.call(this, $scope, BMA, $state, UIUtils, $timeout, Device, Wallet);

  $scope.cancel = function(){
    $scope.closeModal();
  };

  $scope.doSelectIdentity = function(pub, uid){
    $scope.closeModal({
      pubkey: pub,
      uid: uid
    });
  };

}

function WotIdentityViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, Device, UserService) {
  'ngInject';

  $scope.identity = {};
  $scope.hasSelf = false;
  $scope.loaded = false;
  $scope.certificationCount = 0;
  $scope.sigQty = null;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$state.stateParams ||
        !$state.stateParams.pubkey ||
        $state.stateParams.pubkey.trim().length===0) {
      // Redirect o home
      $timeout(function() {
       //$state.go('app.home');
      }, 10);
      return;
    }
    if (!$scope.loaded) {
      $scope.loadIdentity($state.stateParams.pubkey);
    }
  });

  $scope.loadIdentity = function(pub) {
    var onLoadFinish = function() {
      $scope.loaded = true;

      $timeout(function() {
          UIUtils.motion.fadeSlideInRight();
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
              timestamp: idty.meta.timestamp,
              number: blocUid[0],
              hash: blocUid[1],
              revoked: idty.revoked,
              revokedSig: idty.revocation_sig,
              sig: idty.self
            });
          }, []));
        }, [])[0];
        $scope.hasSelf = ($scope.identity.uid && $scope.identity.timestamp && $scope.identity.sig);

        // Retrieve cert count
        var certPubkeys = [];
        $scope.certificationCount = res.results.reduce(function(sum, res) {
          return res.uids.reduce(function(sum, idty) {
            return idty.others.reduce(function(sum, cert) {
              if (cert.isMember && !certPubkeys[cert.pubkey]) { // skip cert from not member
                certPubkeys[cert.pubkey] = true;
                return sum + 1;
              }
              return sum;
            }, sum);
          }, sum);
        }, 0);

        // Retrieve registration date
        BMA.blockchain.block({block: $scope.identity.number})
        .then(function(block) {
          $scope.identity.sigDate = block.time;
          // Retrieve sigDate
          if (Wallet.isLogin() && !!Wallet.data.parameters && !!Wallet.data.parameters.sigQty) {
            $scope.sigQty =  Wallet.data.parameters.sigQty;
            onLoadFinish();
          }
          else {
            BMA.currency.parameters()
            .then(function(parameters) {
              $scope.sigQty =  parameters.sigQty;
              onLoadFinish();
            })
            .catch(UIUtils.onError('ERROR.GET_CURRENCY_PARAMETER'));
          }
        })
        .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));
      })
      .catch(function(err) {
        if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) { // Identity not found (if no self)
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

  // Copy
  $scope.copy = function(value) {
    if (value && Device.isEnable()) {
      Device.clipboard.copy(value);
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

  $scope.showFab('fab-transfer');
}

function WotCertificationsViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, Device, $ionicPopup) {
  'ngInject';

  $scope.certifications = [];
  $scope.identity = {};
  $scope.loaded = false;
  $scope.timeWarningExpire = Wallet.defaultSettings.timeWarningExpire;
  $scope.hasSelf = false;
  $scope.canCertify = false;
  $scope.alreadyCertified = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$state.stateParams || !$state.stateParams.pub || $state.stateParams.pub.trim().length===0) {
      // Redirect o home
      $timeout(function() {
       $state.go('app.home', null);
      }, 10);
      return;
    }
    if (!$scope.loaded) {
      $scope.loadCertifications($state.stateParams.pub);
    }
  });

  $scope.loadCertifications = function(pub, force) {
    $scope.loaded = false;
    var onLoadFinish = function() {
      $scope.loaded = true;
      // Set Motion
      $timeout(function() {
        UIUtils.motion.fadeSlideInRight();
      }, 10);
      if ($scope.canCertify) {
        $scope.showFab('fab-certify');
      }
      UIUtils.ink();
    };
    var onLoadRequirementsFinish = function(certsFromRequirements) {
      BMA.wot.lookup({search: pub})
      .then(function(res) {
        $scope.identity = res.results.reduce(function(idties, res) {
          return idties.concat(res.uids.reduce(function(uids, idty) {
            var blocUid = idty.meta.timestamp.split('-', 2);
            return uids.concat({
              uid: idty.uid,
              pub: res.pubkey,
              timestamp: idty.meta.timestamp,
              number: blocUid[0],
              hash: blocUid[1],
              revoked: idty.revoked,
              revokedSig: idty.revocation_sig,
              sig: idty.self
            });
          }, []));
        }, [])[0];
        $scope.hasSelf = ($scope.identity.uid && $scope.identity.timestamp && $scope.identity.sig);
        var expiresInByPub = !certsFromRequirements ? [] : certsFromRequirements.reduce(function(map, cert){
          map[cert.from]=cert.expiresIn;
          return map;
        }, []);
        var certPubkeys = [];
        var certifications = !res.results ? [] : res.results.reduce(function(certs, res) {
          return certs.concat(res.uids.reduce(function(certs, idty) {
            return certs.concat(idty.others.reduce(function(certs, cert) {
              if (!certPubkeys[cert.pubkey]) { // skip duplicated certs
                certPubkeys[cert.pubkey] = true;
                return certs.concat({
                  from: cert.pubkey,
                  uid: cert.uids[0],
                  to: pub,
                  block: (cert.meta && cert.meta.block_number) ? cert.meta.block_number : 0,
                  expiresIn: cert.isMember ? expiresInByPub[cert.pubkey] : null,
                  isMember: cert.isMember
                });
              }
              return certs;
            }, certs));
          }, certs));
        }, []);
        $scope.certifications = _.sortBy(certifications, function(cert){
          var score = 1;
          score += (1000000000000 * (cert.expiresIn ? cert.expiresIn : 0));
          score += (10000000      * (cert.isMember ? 1 : 0));
          score += (10            * (cert.block ? cert.block : 0));
          return -score;
        });
        $scope.canCertify = !Wallet.isLogin() || Wallet.data.pubkey != pub;
        $scope.alreadyCertified = (Wallet.isLogin() && Wallet.data.pubkey != pub && Wallet.data.isMember) ? !!_.findWhere($scope.certifications, { uid: Wallet.data.uid }) : false;
        onLoadFinish();
      })
      .catch(function(err) {
        if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_IDENTITY) { // Identity not found (if no self)
          $scope.certifications = [];
          $scope.timeWarningExpire = Wallet.defaultSettings.timeWarningExpire;
          $scope.identity = {};
          $scope.canCertify = false;
          $scope.alreadyCertified = false;
          onLoadFinish(); // Continue
        }
        else {
          UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
        }
      });
    };

    // Skip load requirements if already done (if identity=wallet user)
    if (!force && Wallet.isLogin() && Wallet.data.pubkey == pub) {
      $scope.timeWarningExpire = Wallet.data.settings.timeWarningExpire;
      onLoadRequirementsFinish(Wallet.data.requirements.certifications);
      return;
    }
    else {
      BMA.wot.requirements({pubkey: pub})
      .then(function(res) {
        if (!res.identities || res.identities.length === 0) {
          onLoadRequirementsFinish([]); // Continue
          return;
        }
        var idty = res.identities[0];
        onLoadRequirementsFinish(idty.certifications); // Continue
      })
      .catch(function(err) {
        if (!!err && err.ucode == BMA.errorCodes.NO_MATCHING_MEMBER) {
          onLoadRequirementsFinish([]); // Continue
        }
        else {
          UIUtils.onError('ERROR.LOAD_REQUIREMENTS_FAILED')(err);
        }
      });
    }
   };

  // Certify click
  $scope.certifyIdentity = function(identity) {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.hide();
      UIUtils.alert.confirm('CONFIRM.CERTIFY_RULES')
      .then(function(confirm){
        if (!confirm) {
          return;
        }
        UIUtils.loading.show();
        Wallet.certify($scope.identity.uid,
                    $scope.identity.pub,
                    $scope.identity.timestamp,
                    $scope.identity.sig)
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
    $scope.loadCertifications($scope.identity.pub, true);
  };
}
