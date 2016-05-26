angular.module('cesium.wot.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

      .state('app.wot_lookup', {
        url: "/wot",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/lookup.html",
            controller: 'WotLookupCtrl'
          }
        }
      })

      .state('app.view_identity', {
        url: "/wot/view/:pub",
        views: {
          'menuContent': {
            templateUrl: "templates/wot/view_identity.html",
            controller: 'WotIdentityViewCtrl'
          }
        }
      })

      .state('app.view_certifications', {
        url: "/wot/cert/:pub",
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

  .controller('WotCertificationsViewCtrl', WotCertificationsViewController)
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
        .catch(function(err) {
          if (err && err.ucode == 2001) {
            $scope.search.results = [];
            $scope.search.looking = false;
          }
          else {
            UIUtils.onError('ERROR.WOT_LOOKUP_FAILED')(err);
          }
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
     .catch(UIUtils.onError('ERROR.SCAN_FAILED'));
   }
 };
}

function WotIdentityViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, System) {

  $scope.identity = {};
  $scope.hasSelf = false;
  $scope.loaded = false;
  $scope.certificationCount = 0;
  $scope.sigQty = null;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$state.stateParams ||
        !$state.stateParams.pub ||
        $state.stateParams.pub.trim().length===0) {
      // Redirect o home
      $timeout(function() {
       $state.go('app.home', null);
      }, 10);
      return;
    }
    if (!$scope.loaded) {
      $scope.loadIdentity($state.stateParams.pub);
    }
  });

  $scope.loadIdentity = function(pub) {
    var onLoadFinish = function() {
      $scope.loaded = true;

      $timeout(function() {
          UIUtils.motion.fadeSlideInRight({
            selector: '.animate-fade-slide-in .item',
            startVelocity: 3000
          });
      }, 100);
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
        $scope.certificationCount = res.results.reduce(function(sum, res) {
          return res.uids.reduce(function(sum, idty) {
            return idty.others.reduce(function(sum, cert) {
              if (cert.isMember) { // skip cert from not member
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
          if (Wallet.isLogin()) {
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

  // Certify click
  $scope.certifyIdentity = function(identity) {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.show();

      // TODO: ask user confirm - see issue https://github.com/duniter/cesium/issues/12
      Wallet.certify($scope.identity.uid,
                  $scope.identity.pub,
                  $scope.identity.timestamp,
                  $scope.identity.sig)
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.alert.info('INFO.CERTIFICATION_DONE');
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

  // Set Header
  $scope.$parent.showHeader();
  $scope.isExpanded = false;
  $scope.$parent.setExpanded(false);
  $scope.$parent.setHeaderFab(false);
  $scope.showFab('fab-transfer');
}

function WotCertificationsViewController($scope, $state, BMA, Wallet, UIUtils, $q, $timeout, System) {

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
        UIUtils.motion.fadeSlideInRight({
            selector: '.animate-fade-slide-in-right .item',
            startVelocity: 3000
        });
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
        $scope.certifications = !res.results ? [] : res.results.reduce(function(certs, res) {
          return certs.concat(res.uids.reduce(function(certs, idty) {

            return certs.concat(idty.others.reduce(function(certs, cert) {
              if (cert.isMember) { // skip cert from not member
                return certs.concat({
                  from: cert.pubkey,
                  uid: cert.uids[0],
                  to: pub,
                  expiresIn: expiresInByPub[cert.pubkey]
                });
              }
              return certs;
            }, certs));
          }, certs));
        }, []);
        $scope.canCertify = !Wallet.isLogin() || Wallet.data.pubkey != pub;
        $scope.alreadyCertified = (Wallet.isLogin() && Wallet.data.pubkey != pub && Wallet.data.isMember) ? !!_.findWhere($scope.certifications, { uid: Wallet.data.uid }) : false;
        onLoadFinish();
      })
      .catch(function(err) {
        if (!!err && err.ucode == 2001) { // Identity not found (if no self)
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
        if (!!err && err.ucode == 2004) { // Identity not found (if no self)
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
      UIUtils.loading.show();

      // TODO: ask user confirm - see issue https://github.com/duniter/cesium/issues/12
      Wallet.certify($scope.identity.uid,
                  $scope.identity.pub,
                  $scope.identity.timestamp,
                  $scope.identity.sig)
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.alert.info('INFO.CERTIFICATION_DONE');
      })
      .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    $scope.loadCertifications($scope.identity.pub, true);
  };

  // Set Header
  $scope.$parent.showHeader();
  $scope.isExpanded = false;
  $scope.$parent.setExpanded(false);
  $scope.$parent.setHeaderFab(false);

}
