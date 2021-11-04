angular.module('cesium.join.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider
      .state('app.join', {
        url: "/join",
        views: {
          'menuContent': {
            templateUrl: "templates/home/home.html",
            controller: 'JoinCtrl'
          }
        }
      })
    ;
  })

  .controller('JoinCtrl', JoinController)

  .controller('JoinChooseAccountTypeModalCtrl', JoinChooseAccountTypeModalController)

  .controller('JoinModalCtrl', JoinModalController)
;

function JoinController($scope, $timeout, $controller, Modals, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('HomeCtrl', {$scope: $scope}));

  $scope.showJoinModal = function() {
    if ($scope.loading) return $timeout($scope.showJoinModal, 500); // recursive call

    if (!csWallet.isLogin() && !$scope.error) {
      return $timeout(Modals.showJoin, 300);
    }
  };
  $scope.$on('$ionicView.enter', $scope.showJoinModal);

}

function JoinChooseAccountTypeModalController($scope, $state, Modals, UIUtils, csConfig, csCurrency) {
  'ngInject';

  $scope.formData = {};
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.loading = true;

  $scope.load = function() {
    if ($scope.loading) {
      return csCurrency.get()
        .then(function (currency) {
          if (!currency) return;
          $scope.currency = currency;
          $scope.formData.currency = currency.name;
          $scope.loading = false;
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
    }
  };
  $scope.$on('modal.shown', $scope.load);

  $scope.$on("$ionicSlides.sliderInitialized", function(event, data){
    // Disable swipe
    data.slider.lockSwipes();
  });

  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
  };

  $scope.selectAccountTypeAndClose = function(type) {
    if (csConfig.demo) {
      return UIUtils.alert.demo();
    }
    $scope.formData.accountType = type;
    $scope.closeModal($scope.formData);
  };

  /**
   * Catch click for quick fix
   * @param fix
   */
  $scope.doQuickFix = function(event) {
    if (event == 'settings') {
      $scope.closeModal();
      $state.go('app.settings');
    }
  };

  $scope.showHelpModal = function(helpAnchor) {
    Modals.showHelp({anchor: helpAnchor});
  };

  // TODO DEV only
  //$timeout(function() {
   //$scope.selectCurrency('g1');
   //$scope.selectAccountTypeAndClose('member');
   //}, 400);
}


function JoinModalController($scope, $state, $interval, $q, $timeout, Device, UIUtils, CryptoUtils, csSettings, Modals, csWallet, BMA, parameters) {
  'ngInject';

  $scope.formData = {
    pseudo: parameters.uid || '',
    pubkey: parameters.pubkey || undefined
  };
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500,
      pager: false,
      showPager: false
    }
  };
  $scope.slideBehavior = {};
  $scope.loading = true;

  $scope.isLicenseRead = Device.isIOS(); // always enable the button, on IOS  fix #554
  $scope.showUsername = false;
  $scope.showPassword = false;
  $scope.formData.computing=false;
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.userIdPattern = BMA.constants.regexp.USER_ID;
  $scope.accountAvailable = !!parameters.pubkey;

  // Read input parameters
  $scope.currency = parameters.currency;
  $scope.accountType = parameters.accountType || 'member';

  var wallet;

  $scope.load = function() {
    if ($scope.loading) {

      // Get the wallet
      wallet = (parameters.walletId && csWallet.children.get(parameters.walletId)) ||
        (parameters.pubkey && csWallet.children.getByPubkey(parameters.pubkey)) ||
        ((!parameters.pubkey || csWallet.isUserPubkey(parameters.pubkey)) && csWallet);
      if (!wallet) throw new Error("Cannot found the corresponding wallet, from parameters.pubkey or parameters.walletId");

      console.debug("[join] Starting join modal on wallet {0}".format(wallet.id));

      if ($scope.accountType === 'member') {
        $scope.licenseFileUrl = csSettings.getLicenseUrl();
        if ($scope.licenseFileUrl) {
          // Use HTML in iframe, when original file is markdown (fix #538)
          if ( $scope.licenseFileUrl.substring($scope.licenseFileUrl.length - 3) != '.txt') {
            $scope.licenseFileUrl = $scope.licenseFileUrl + '.html';
          }
          if (!$scope.isLicenseRead) {
            //$scope.startListenLicenseBottom();

            // Make sure to enable the next button when error occured - Fix issue #592
            $timeout(function() {
              if (!$scope.isLicenseRead) {
                $scope.isLicenseRead = true;
              }
            }, 5000);
          }
        }
      }

      $scope.slideBehavior = $scope.computeSlideBehavior();
      $scope.loading = false;
    }
  };
  $scope.$on('modal.shown', $scope.load);

  $scope.$on("$ionicSlides.sliderInitialized", function(event, data){
    // Disable swipe
    data.slider.lockSwipes();
  });

  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
  };

  $scope.showAccountPubkey = function() {
    if (parameters.pubkey && parameters.pseudo === $scope.formData.pseudo) {
      $scope.formData.pubkey = parameters.pubkey;
      $scope.formData.computing = false;
      return;
    }

    $scope.formData.computing=true;

    CryptoUtils.scryptKeypair($scope.formData.username, $scope.formData.password)
      .then(function(keypair) {
        $scope.formData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
        return $scope.checkAccountAvailable();
      })
      .then(function() {
        return $timeout(function(){
          $scope.formData.computing=false;
        }, 400);
      })
      .catch(function(err) {
        $scope.formData.pubkey = undefined;
        $scope.formData.computing=false;
        UIUtils.onError('ERROR.CRYPTO_UNKNOWN_ERROR')(err);
      });
  };

  $scope.formDataChanged = function() {
    $scope.formData.computing=false;
    $scope.formData.pubkey=null;
  };

  $scope.getCurrentFormName = function() {
    var index = $scope.slides.slider.activeIndex;
    if($scope.accountType === 'member') {
      index += ($scope.licenseFileUrl ? 0 : 1); // skip index 0, when no license file
      index += (parameters.pubkey && index >= 2 ? 2 : 0); // skip salt+pass, if already a pubkey
      if (index === 0) return "licenseForm";
      if (index === 1) return "pseudoForm";
      if (index === 2) return "saltForm";
      if (index === 3) return "passwordForm";
      if (index === 4) return "confirmForm";
    }
    else {
      if (index === 0) return "saltForm";
      if (index === 1) return "passwordForm";
      if (index === 2) return "confirmForm";
    }
  };

  $scope.computeSlideBehavior = function() {
    var formName = $scope.getCurrentFormName();

    var behavior;
    if (formName === "licenseForm") {
      behavior = {
        hasPreviousButton: false,
        hasNextButton: false,
        hasAcceptButton: true
      };
    }
    else if (formName === "pseudoForm") {
      behavior = {
        helpAnchor: 'join-pseudo',
        hasPreviousButton: $scope.licenseFileUrl && true,
        hasNextButton: true,
        focus: 'pseudo'
      };
    }
    else if (formName === "saltForm") {
      behavior = {
        helpAnchor: 'join-salt',
        hasPreviousButton: $scope.accountType === 'member',
        hasNextButton: true,
        focus: 'salt'
      };
    }
    else if (formName === "passwordForm") {
      behavior = {
        helpAnchor: 'join-password',
        hasPreviousButton: true,
        hasNextButton: true,
        focus: 'password'
      };
    }
    else if (formName === "confirmForm") {
      behavior = {
        hasPreviousButton: true,
        hasNextButton: false,
        hasSendButton: true,
        helpAnchor: 'join-pubkey'
      };
    }
    else {
      behavior = {
        hasPreviousButton: false,
        hasNextButton: true
      };
    }

    // removeIf(device)
    // Focus input text (only if NOT device, to avoid keyboard opening)
    // FIXME: this cause issue #464
    /*if (behavior.focus) {
      $timeout(function(){
        $focus(behavior.focus);
      }, 100);
    }*/
    // endRemoveIf(device)

    return behavior;
  };


  $scope.doNext = function() {
    var formName = $scope.getCurrentFormName();
    if (formName && $scope[formName]){
      $scope[formName].$submitted=true;
      if(!$scope[formName].$valid) {
        return;
      }
      if (formName === "pseudoForm" && $scope.uiAlreadyUsed) {
        return;
      }
      if (formName === "passwordForm") {
        $scope.showAccountPubkey();
      }
    }

    $scope.slideNext();

    $scope.slideBehavior = $scope.computeSlideBehavior();
  };

  $scope.doPrev = function() {
    $scope.slidePrev();
    $scope.slideBehavior = $scope.computeSlideBehavior();
  };

  $scope.doNewAccount = function(confirm) {

    if (!confirm) {

      var messageKey = ($scope.accountType === 'member') ? 'ACCOUNT.NEW.CONFIRMATION_MEMBER_ACCOUNT' :
        'ACCOUNT.NEW.CONFIRMATION_WALLET_ACCOUNT';

      return UIUtils.alert.confirm(messageKey, undefined,
        {
          cssClass: 'warning',
          okText: $scope.accountType == 'member' ? 'COMMON.BTN_SEND' : 'COMMON.BTN_CONTINUE',
          okType: 'button-assertive'
        })
        .then(function(confirm) {
          if (confirm) {
            $scope.doNewAccount(true);
          }
        });
    }

    var onErrorLogout = function(message) {
      return function(err) {
        if (parameter.uid) {
          wallet.unauth()
            .then(function(){
              UIUtils.onError(message)(err);
            });
        }
        else {
          wallet.logout()
            .then(function(){
              UIUtils.onError(message)(err);
            });
        }
        throw new Error('CANCELLED');
      };
    };

    UIUtils.loading.show();

    return wallet.login({
        auth: true,
        isNew: true,
        method: 'SCRYPT_DEFAULT',
        expectedPubkey: $scope.formData.pubkey,
        showMethods: false
      })
      .then(function() {
        if ($scope.accountType === "member") {
          $scope.closeModal();
          csSettings.data.wallet = csSettings.data.wallet || {};
          csSettings.data.wallet.alertIfUnusedWallet = false; // do not alert if empty

          var needSelf = angular.isUndefined(parameters.uid) || angular.isUndefined(parameters.blockUid) ||
            (parameters.uid.toUpperCase() !== $scope.formData.pseudo.toUpperCase());
          if (!needSelf) {
            wallet.setSelf(parameters.uid, parameters.blockUid);
          }

          // Self promise (if need)
          var selfPromise = needSelf ?
            wallet.self($scope.formData.pseudo, false/*do NOT load membership here*/)
              .catch(onErrorLogout('ERROR.SEND_IDENTITY_FAILED')) :
            $q.when();

          return selfPromise
            .then(function() {
              // Send membership IN
              return wallet.membership.inside()
                .catch(function(err) {
                  if (err && err.ucode != BMA.errorCodes.MEMBERSHIP_ALREADY_SEND) return;
                  onErrorLogout('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err);
                });
            })
            .then(function() {

              $scope.closeModal();

              // Redirect to wallet
              if (wallet.isDefault()) {
                return $state.go('app.view_wallet');
              } else {
                return $state.go('app.view_wallet_by_id', {id: wallet.id});
              }
            })
            .then(function() {
              // Wait 2s (for wallet load)
              // then ask to download revocation file
              return $timeout(function() {
                // Hide the loading indicator, if wallet already loaded
                if (wallet.isDataLoaded({requirements: true})) {
                  UIUtils.loading.hide();
                }
                return $scope.downloadRevocationRegistration();
              },
              2000);
            });
        }
        else{
          $scope.closeModal();

          // Redirect to wallet
          if (wallet.isDefault()) {
            $state.go('app.view_wallet');
          }
          else {
            $state.go('app.view_wallet_by_id', {id: wallet.id});
          }

        }
      })
      .catch(function(err) {
        UIUtils.loading.hide();
        if (err === 'CANCELLED') return;
        if (err && err.ucode != BMA.errorCodes.MEMBERSHIP_ALREADY_SEND) {
          console.error("[wallet] Node: already membership", err);
          return; // OK
        }
        else {
          UIUtils.alert.error('ERROR.UNKNOWN_ERROR');
        }
      });
  };

  $scope.downloadRevocationRegistration = function() {
    return UIUtils.alert.confirm('DOWNLOAD.POPUP_REVOKE_MESSAGE', 'DOWNLOAD.POPUP_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_DOWNLOAD',
        okType: 'button-assertive',
        cancelText: 'COMMON.BTN_LATER'
      })
    .then(function(confirm) {
      if (!confirm) return;
      return wallet.downloadRevocation();
    });
  };

  $scope.showHelpModal = function(helpAnchor) {
    Modals.showHelp({anchor: helpAnchor});
  };

  $scope.startListenLicenseBottom = function(){
    var iframeEl = angular.element(document.querySelector('.modal #iframe-license'));
    iframeEl = iframeEl && iframeEl.length ? iframeEl[0] : undefined;
    if (!iframeEl || !iframeEl.contentWindow) {
      console.debug('[join] Waiting license frame to be load...');
      return $timeout($scope.startListenLicenseBottom, 1000);
    }

    $scope.licenseBottomInterval = $interval(function(){
      var yPos = iframeEl.contentWindow.document.body.scrollTop;
      var scrollHeight = iframeEl.contentWindow.document.body.scrollHeight;
      var clientHeight = iframeEl.contentWindow.document.body.clientHeight;
      var isBottom = (scrollHeight - clientHeight === yPos);
      if(isBottom){
        $scope.isLicenseRead = true;
        $scope.stopListenLicenseBottom();
      }
    }, 1000);
  };

  $scope.stopListenLicenseBottom = function() {
    if ($scope.licenseBottomInterval) {
      $interval.cancel($scope.licenseBottomInterval);
      delete $scope.licenseBottomInterval;
    }
  };
  $scope.$on('modal.hidden', $scope.stopListenLicenseBottom);

  $scope.checkUid = function(){
    if (!$scope.formData.pseudo || $scope.formData.pseudo.length < 3) {
      $scope.formData.computing=false;
      delete $scope.uiAlreadyUsed;
      return;
    }

    var uid = $scope.formData.pseudo.toUpperCase();
    $scope.formData.computing=true;

    // Same has given uid + self block: skip control
    if (parameters.uid && uid === parameters.uid.toUpperCase()) {
      $scope.formData.computing=false;
      $scope.uiAlreadyUsed = false;
      return;
    }
    else {
      // search on uid
      BMA.wot.lookup({ search: uid })
        .then(function(res) {
          $scope.uiAlreadyUsed = (res.results || []).some(function(pub){
              return (pub.uids || []).some(function(idty) {
                  return (idty.uid.toUpperCase() === uid); // same Uid
                });
            });
          $scope.formData.computing=false;
        })
        .catch(function(err){
          console.error(err);
          $scope.formData.computing=false;
          $scope.uiAlreadyUsed = false;
        });
    }
  };
  $scope.$watch('formData.pseudo', $scope.checkUid, true);

  $scope.checkAccountAvailable = function() {
    if (parameters.pubkey) {
      $scope.accountAvailable = true;
      return;
    }

    delete $scope.accountAvailable;
    // Search for tx source, from pubkey
    return BMA.tx.sources({ pubkey:  $scope.formData.pubkey })
      .then(function(res) {
        $scope.accountAvailable = !res || !res.sources.length;
      })
      .catch(function(err) {
        console.error(err);
        $scope.accountAvailable = false;
      });
  };

  $scope.identifierRecovery = function() {
    // Go back
    $scope.slides.slider.unlockSwipes();
    for (var i = 0; i < 2; i++) {
      $scope.slides.slider.slidePrev();
    }
    $scope.slides.slider.lockSwipes();
    // Recompute behavior
    $scope.slideBehavior = $scope.computeSlideBehavior();
  };

  // TODO: remove auto add account when done
  /*$timeout(function() {
    //$scope.selectCurrency('g1');
    //$scope.selectAccountType('member');
    $scope.formData.username="azertypoi";
    $scope.formData.confirmUsername=$scope.formData.username;
    $scope.formData.password="azertypoi";
    $scope.formData.confirmPassword=$scope.formData.password;
    $scope.formData.pseudo="azertypoi";
    //$scope.doNext();
    //$scope.doNext();
  }, 400);*/
}

