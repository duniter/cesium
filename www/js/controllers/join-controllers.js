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

function JoinController($timeout, Modals) {
  'ngInject';

  // Open join modal
  $timeout(function() {
    Modals.showJoin();
  }, 100);
}

function JoinChooseAccountTypeModalController($scope, $state, Modals, UIUtils, csCurrency) {
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


function JoinModalController($scope, $state, $interval, $timeout, UIUtils, CryptoUtils, csSettings, Modals, csWallet, BMA, parameters) {
  'ngInject';

  $scope.formData = {
    pseudo: ''
  };
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.slideBehavior = {};
  $scope.loading = true;


  $scope.isLicenseRead = false;
  $scope.showUsername = false;
  $scope.showPassword = false;
  $scope.formData.computing=false;
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.userIdPattern = BMA.constants.regex.USER_ID;

  // Read input parameters
  $scope.currency = parameters.currency;
  $scope.accountType = parameters.accountType || 'member';

  $scope.load = function() {
    if ($scope.loading) {

      $scope.licenseFileUrl = csSettings.getLicenseUrl();
      if ($scope.licenseFileUrl) {
        $scope.startListenLicenseBottom();
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
    $scope.formData.computing=true;

    CryptoUtils.connect($scope.formData.username, $scope.formData.password)
      .then(function(keypair) {
        $scope.formData.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
        $scope.formData.computing=false;
        $scope.checkAccountAvailable();
      })
      .catch(function(err) {
        $scope.formData.computing=false;
        $scope.formData.pubkey = undefined;
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
    if (formName == "licenseForm") {
      behavior = {
        hasPreviousButton: false,
        hasNextButton: false,
        hasAcceptButton: true
      };
    }
    else if (formName == "pseudoForm") {
      behavior = {
        helpAnchor: 'join-pseudo',
        hasPreviousButton: $scope.licenseFileUrl && true,
        hasNextButton: true,
        focus: 'pseudo'
      };
    }
    else if (formName == "saltForm") {
      behavior = {
        helpAnchor: 'join-salt',
        hasPreviousButton: true,
        hasNextButton: true,
        focus: 'salt'
      };
    }
    else if (formName == "passwordForm") {
      behavior = {
        helpAnchor: 'join-password',
        hasPreviousButton: true,
        hasNextButton: true,
        focus: 'password'
      };
    }
    else if (formName == "confirmForm") {
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

  $scope.doNewAccount = function(confirm) {

    if (!confirm) {

      var messageKey = ($scope.accountType === 'member') ? 'ACCOUNT.NEW.CONFIRMATION_MEMBER_ACCOUNT' :
        'ACCOUNT.NEW.CONFIRMATION_WALLET_ACCOUNT';

      return UIUtils.alert.confirm(messageKey, undefined,
        {
          cssClass: 'warning',
          okText: 'COMMON.BTN_SEND',
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
        csWallet.logout()
        .then(function(){
          UIUtils.onError(message)(err);
        });
      };
    };

    UIUtils.loading.show();

    csWallet.login($scope.formData.username, $scope.formData.password)
    .then(function() {
      if ($scope.accountType === "member") {
        $scope.closeModal();
        csSettings.data.wallet = csSettings.data.wallet || {};
        csSettings.data.wallet.alertIfUnusedWallet = false; // do not alert if empty
        // Redirect to wallet
        $state.go('app.view_wallet');

        // Send self
        csWallet.self($scope.formData.pseudo, false/*do NOT load membership here*/)
          .then(function() {
            // Send membership IN
            csWallet.membership.inside()
            .then(function() {

              $scope.closeModal();

              // Redirect to wallet
              $state.go('app.view_wallet')
              .then(function() {
                $scope.downloadRevocationRegistration();
              });
            })
            .catch(function(err) {
              //
              if (err && err.ucode == BMA.errorCodes.MEMBERSHIP_ALREADY_SEND) {

              }
              onErrorLogout('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err);
            });
          })
          .catch(onErrorLogout('ERROR.SEND_IDENTITY_FAILED'));
      }
      else{

        csWallet.data.isNew = true;

        $scope.closeModal();

        //Redirect to wallet
        $state.go('app.view_wallet');

      }
    })
    .catch(function(err) {
      UIUtils.loading.hide();
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  $scope.downloadRevocationRegistration = function() {
    return UIUtils.alert.confirm('DOWNLOAD.POPUP_REVOKE_MESSAGE', 'DOWNLOAD.POPUP_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_DOWNLOAD',
        okType: 'button-assertive',
        cancelText: 'COMMON.BTN_LATER'
      })
    .then(function() {
      return csWallet.downloadRevocation();
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
  };
  $scope.$watch('formData.pseudo', $scope.checkUid, true);

  $scope.checkAccountAvailable = function() {
    delete $scope.accountAvailable;
    // Search for tx source, from pubkey
    BMA.tx.sources({ pubkey:  $scope.formData.pubkey })
      .then(function(res) {
        if(!res.sources.length) {
          $scope.formData.computing=false;
          $scope.accountAvailable = true;
        }
        else{
          $scope.formData.computing=false;
          $scope.accountAvailable = false;
        }
      })
      .catch(function(err) {
        console.error(err);
        $scope.formData.computing=false;
        $scope.accountAvailable = false;
      });
  };

  $scope.identifierRecovery = function() {
    for (var i = 0; i < 2; i++)
      $scope.slidePrev();
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

