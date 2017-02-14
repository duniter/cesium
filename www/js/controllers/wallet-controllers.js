angular.module('cesium.wallet.controllers', ['cesium.services', 'cesium.currency.controllers'])

  .config(function($stateProvider) {
    'ngInject';
    $stateProvider

      .state('app.view_wallet', {
        url: "/wallet",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet.html",
            controller: 'WalletCtrl'
          }
        }
      })

      .state('app.view_wallet_tx_errors', {
        url: "/wallet/tx/errors",
        views: {
          'menuContent': {
            templateUrl: "templates/wallet/view_wallet_tx_error.html",
            controller: 'WalletTxErrorCtrl'
          }
        }
      })
    ;
  })

  .controller('WalletCtrl', WalletController)

  .controller('WalletTxErrorCtrl', WalletTxErrorController)

  .controller('WalletSecurityModalCtrl', WalletSecurityModalController)

;

function WalletController($scope, $rootScope, $q, $ionicPopup, $timeout, $state, $filter,
                          UIUtils, csWallet, $translate, $ionicPopover, Modals, csSettings, BMA, ModalUtils) {
  'ngInject';

  $scope.hasCredit = false;
  $scope.showDetails = false;
  $scope.loading = true;
  $scope.settings = csSettings.data;

  $scope.$on('$ionicView.enter', function() {
    $scope.loadWallet()
      .then(function(walletData) {
        $scope.walletData = walletData;
        $scope.setShowDetails(angular.isDefined(csSettings.data.wallet, csSettings.data.wallet.showPubkey) ?
          csSettings.data.wallet.showPubkey: true);
        $scope.loading=false; // very important, to avoid TX to be display before wallet.currentUd is loaded
        $scope.updateView();
        $scope.showFab('fab-transfer');
        $scope.showQRCode('qrcode', $rootScope.walletData.pubkey, 1100);
        $scope.showHelpTip();
        UIUtils.loading.hide(); // loading could have be open (e.g. new account)
      })
      .catch(function(err){
        if (err == 'CANCELLED') {
          $scope.showHome();
        }
      });
  });

  $ionicPopover.fromTemplateUrl('templates/wallet/popover_actions.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.actionsPopover = popover;
  });

  //Cleanup the popover when we're done with it!
  $scope.$on('$destroy', function() {
    $scope.actionsPopover.remove();
  });

  $scope.onSettingsChanged = function() {
    if (!$scope.walletData || $scope.loading) return;
    $scope.unit = $filter('currencySymbol')($scope.walletData.currency, csSettings.data.useRelative);
    $scope.secondaryUnit = $filter('currencySymbol')($scope.walletData.currency, !csSettings.data.useRelative);
  };
  $scope.$watch('settings.useRelative', $scope.onSettingsChanged);

  // Reload if show UD changed
  $scope.$watch('settings.showUDHistory', function() {
    if (!$scope.walletData || $scope.loading) return;
    $scope.doUpdate();
  }, true);

  // Update view
  $scope.updateView = function() {
    $scope.$broadcast('$$rebind::' + 'balance'); // force rebind balance

    $scope.onSettingsChanged();
    // Set Motion
    $timeout(function() {
      UIUtils.motion.fadeSlideInRight({selector: '#wallet .animate-fade-slide-in-right .item'});
      // Set Ink
      UIUtils.ink({selector: '#wallet .animate-fade-slide-in-right .item'});
    }, 10);
  };


  $scope.setRegisterForm = function(registerForm) {
    $scope.registerForm = registerForm;
  };

  // Ask uid
  $scope.showUidPopup = function() {
    return $q(function(resolve, reject) {
      $translate(['ACCOUNT.NEW.TITLE', 'ACCOUNT.POPUP_REGISTER.TITLE', 'ACCOUNT.POPUP_REGISTER.HELP', 'COMMON.BTN_OK', 'COMMON.BTN_CANCEL'])
        .then(function (translations) {
          $rootScope.walletData.newUid = (!!$rootScope.walletData.uid ? ''+$rootScope.walletData.uid : '');

          // Choose UID popup
          $ionicPopup.show({
            templateUrl: 'templates/wallet/popup_register.html',
            title: translations['ACCOUNT.POPUP_REGISTER.TITLE'],
            subTitle: translations['ACCOUNT.POPUP_REGISTER.HELP'],
            scope: $scope,
            buttons: [
              { text: translations['COMMON.BTN_CANCEL'] },
              {
                text: translations['COMMON.BTN_OK'],
                type: 'button-positive',
                onTap: function(e) {
                  $scope.registerForm.$submitted=true;
                  if(!$scope.registerForm.$valid || !$rootScope.walletData.newUid) {
                    //don't allow the user to close unless he enters a uid
                    e.preventDefault();
                  } else {
                    return $rootScope.walletData.newUid;
                  }
                }
              }
            ]
          })
          .then(function(uid) {
            if (!uid) { // user cancel
              $rootScope.walletData.uid = null;
              UIUtils.loading.hide();
              return;
            }
            resolve(uid);
          });
        });
      });
  };

  // Send self identity
  $scope.self = function() {
    $scope.hideActionsPopover();

    return $scope.showUidPopup()
    .then(function(uid) {
      UIUtils.loading.show();

      return csWallet.self(uid)
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err){
         UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
         .then(function() {
           $scope.self(); // loop
         });
      });
    });
  };

  $scope.doMembershipIn = function(retryCount) {
    return csWallet.membership.inside()
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        if (!retryCount || retryCount <= 2) {
          $timeout(function() {
            $scope.doMembershipIn(retryCount ? retryCount+1 : 1);
          }, 1000);
        }
        else {
          UIUtils.onError('ERROR.SEND_MEMBERSHIP_IN_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        }
      });
  };


  // Send membership IN
  $scope.membershipIn = function() {
    $scope.hideActionsPopover();

    if ($rootScope.walletData.isMember) {
      return UIUtils.alert.info("INFO.NOT_NEED_MEMBERSHIP");
    }

    return $scope.showUidPopup()
    .then(function (uid) {
      UIUtils.loading.show();
      // If uid changed, or self blockUid not retrieve : do self() first
      if (!$rootScope.walletData.blockUid || uid != $rootScope.walletData.uid) {
        $rootScope.walletData.blockUid = null;
        $rootScope.walletData.uid = uid;
        csWallet.self(uid, false/*do NOT load membership here*/)
        .then(function() {
          $scope.doMembershipIn();
        })
        .catch(function(err){
          UIUtils.onError('ERROR.SEND_IDENTITY_FAILED')(err)
            .then(function() {
              $scope.membershipIn(); // loop
            });
        });
      }
      else {
        $scope.doMembershipIn();
      }
    })
    .catch(function(err){
       UIUtils.loading.hide();
       UIUtils.alert.info(err);
       $scope.membershipIn(); // loop
    });
  };

  // Send membership OUT
  $scope.membershipOut = function(confirm) {
    $scope.hideActionsPopover();

    // Ask user confirmation
    if (!confirm) {
      return UIUtils.alert.confirm('CONFIRM.MEMBERSHIP_OUT')
      .then(function(confirm) {
        if (confirm) $scope.membershipOut(true); // loop with confirmation
      });
    }

    UIUtils.loading.show();
    return csWallet.membership.out()
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.toast.show('INFO.MEMBERSHIP_OUT_SENT');
    })
    .catch(UIUtils.onError('ERROR.SEND_MEMBERSHIP_OUT_FAILED'));
  };

  // Updating wallet data
  $scope.doUpdate = function() {
    console.debug('[wallet] TX history reloading...');
    return UIUtils.loading.show()
      .then(function() {
        return csWallet.refreshData();
      })
      .then(function() {
        return UIUtils.loading.hide();
      })
      .then(function() {
        $scope.updateView();
      })
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  /**
   * Renew membership
   */
  $scope.renewMembership = function(confirm) {

    if (!$rootScope.walletData.isMember) {
      return UIUtils.alert.error("ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION");
    }
    if (!confirm && !$rootScope.walletData.requirements.needRenew) {
      return $translate("CONFIRM.NOT_NEED_RENEW_MEMBERSHIP", {membershipExpiresIn: $rootScope.walletData.requirements.membershipExpiresIn})
        .then(function(message) {
          return UIUtils.alert.confirm(message);
        })
        .then(function(confirm) {
          if (confirm) $scope.renewMembership(true); // loop with confirm
        });
    }

    return UIUtils.alert.confirm("CONFIRM.RENEW_MEMBERSHIP")
      .then(function(confirm) {
        if (confirm) {
          UIUtils.loading.show();
          return $scope.doMembershipIn();
        }
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.error(err)
          // loop
          .then($scope.renewMembership);
      });
  };


  /**
   * Fix identity (e.g. when identity expired)
   */
  $scope.fixIdentity = function() {
    if (!$rootScope.walletData.uid) return;

    return $translate('CONFIRM.FIX_IDENTITY', {uid: $rootScope.walletData.uid})
      .then(function(message) {
        return UIUtils.alert.confirm(message);
      })
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset membership data
        $rootScope.walletData.blockUid = null;
        $rootScope.walletData.sigDate = null;
        return csWallet.self($rootScope.walletData.uid);
      })
      .then(function() {
        return $scope.doMembershipIn();
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.error(err)
          .then(function() {
            $scope.fixIdentity(); // loop
          });
      });
  };

  /**
   * Fix membership, when existing MS reference an invalid block
   */
  $scope.fixMembership = function() {
    if (!$rootScope.walletData.uid) return;

    return UIUtils.alert.confirm("CONFIRM.FIX_MEMBERSHIP")
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        // Reset membership data
        $rootScope.walletData.blockUid = null;
        $rootScope.walletData.sigDate = null;
        return Wallet.self($rootScope.walletData.uid, false/*do NOT load membership here*/);
      })
      .then(function() {
        return $scope.doMembershipIn();
      })
      .catch(function(err){
        UIUtils.loading.hide();
        UIUtils.alert.info(err);
        $scope.fixMembership(); // loop
      });
  };

  /**
   * Catch click for quick fix
   * @param fix
   */
  $scope.doQuickFix = function(event) {
    if (event == 'renew') {
      $scope.renewMembership();
    }
    else if (event == 'fixMembership') {
      $scope.fixMembership();
    }
    else if (event == 'fixIdentity') {
      $scope.fixIdentity();
    }
  };

  /* -- popup / UI -- */

  $scope.toggleShowDetails = function() {
    // Update user settings
    csSettings.data.wallet = csSettings.data.wallet || {};
    csSettings.data.wallet.showPubkey = !$scope.showDetails;
    csSettings.store();

    $scope.setShowDetails(csSettings.data.wallet.showPubkey);
  };

  $scope.setShowDetails = function(show) {
    $scope.showDetails = show;
    $scope.hideActionsPopover();

    // Change QRcode visibility
    var qrcode = document.getElementById('qrcode');
    if (qrcode) {
      qrcode.classList.toggle('visible-xs', !show);
      qrcode.classList.toggle('visible-sm', !show);
    }

    if (show && !$scope.loading) {
      $timeout(function (){
        var pubkeyElement = document.getElementById('wallet-pubkey');
        if (pubkeyElement) {
          pubkeyElement.classList.toggle('done', true);
          pubkeyElement.classList.toggle('in', true);
        }
        var uidElement = document.getElementById('wallet-uid');
        if (uidElement) {
          uidElement.classList.toggle('done', true);
          uidElement.classList.toggle('in', true);
        }
      }, 500);
    }
  };

  // Transfer
  $scope.showTransferModal = function() {
    var hasCredit = (!!$scope.walletData.balance && $scope.walletData.balance > 0);
    if (!hasCredit) {
      UIUtils.alert.info('INFO.NOT_ENOUGH_CREDIT');
      return;
    }
    Modals.showTransfer()
      .then(function(done){
        if (done) {
          UIUtils.toast.show('INFO.TRANSFER_SENT');
          $scope.$broadcast('$$rebind::' + 'balance'); // force rebind balance

          // Set Motion
          $timeout(function() {
            UIUtils.motion.ripple({
              selector: '.item-pending',
              startVelocity: 3000
            });
            // Set Ink
            UIUtils.ink({selector: '.item-pending'});
          }, 10);
        }
      });
  };

  $scope.startWalletTour = function() {
    $scope.hideActionsPopover();
    return $scope.showHelpTip(0, true);
  };

  $scope.showHelpTip = function(index, isTour) {
    index = angular.isDefined(index) ? index : csSettings.data.helptip.wallet;
    isTour = angular.isDefined(isTour) ? isTour : false;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope(isTour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started
    helptipScope.tour = isTour;

    return helptipScope.startWalletTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        if (!isTour) {
          csSettings.data.helptip.wallet = endIndex;
          csSettings.store();
        }
      });
  };

  $scope.showQRCode = function(id, text, timeout) {
    if (!!$scope.qrcode) {
      return;
    }
    if (!timeout) {
      timeout = 1100;
    }
    $scope.qrcode = new QRCode(id, {
      text: text,
      width: 200,
      height: 200,
      correctLevel: QRCode.CorrectLevel.L
    });
    $timeout(function () {
      var qrcodes = document.getElementsByClassName('qrcode');
      _.forEach(qrcodes, function(qrcode){
        if (qrcode.id == id) {
          qrcode.classList.toggle('on', true);
        }
      });
    }, timeout);
  };

  $scope.showCertifications = function() {
    $state.go(UIUtils.screen.isSmall() ? 'app.wallet_view_cert' : 'app.wallet_view_cert_lg', {
      pubkey: $rootScope.walletData.pubkey,
      uid: $rootScope.walletData.name || $rootScope.walletData.uid
    });
  };

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('templates/wallet/popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  $scope.showSharePopover = function(event) {
    $scope.hideActionsPopover();

    var title = $rootScope.walletData.name || $rootScope.walletData.uid || $rootScope.walletData.pubkey;
    var url = $state.href('app.wot_view_identity', {pubkey: $rootScope.walletData.pubkey, uid: $rootScope.walletData.name || $rootScope.walletData.uid}, {absolute: true});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'WOT.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        postMessage: title
      }
    });
  };

  $scope.showMoreTx = function(fromTime) {

    fromTime = fromTime ||
      ($rootScope.walletData.tx.fromTime - csSettings.data.walletHistoryTimeSecond) ||
      (Math.trunc(new Date().getTime() / 1000) - 2 * csSettings.data.walletHistoryTimeSecond);

    UIUtils.loading.show();
    return csWallet.refreshData({tx: {enable: true,fromTime: fromTime}})
      .then(function() {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(function(err) {
        // If http rest limitation: wait then retry
        if (err.ucode == BMA.errorCodes.HTTP_LIMITATION) {
          $timeout(function() {
            return $scope.showMoreTx();
          }, 2000);
        }
        else {
          UIUtils.onError('ERROR.REFRESH_WALLET_DATA')(err);
        }
      });
  };

  $scope.showSecurityModal = function(){
    $scope.hideActionsPopover();
    Modals.showAccountSecurity();
  };
}

function WalletTxErrorController($scope, $timeout, UIUtils, csWallet) {
  'ngInject';

  $scope.$on('$ionicView.enter', function (e) {
    $scope.loadWallet()
      .then(function () {
        $scope.updateView();
        $scope.showFab('fab-redo-transfer');
        UIUtils.loading.hide();
      });
  });

  // Update view
  $scope.updateView = function () {
    // Set Motion
    $timeout(function () {
      UIUtils.motion.fadeSlideInRight();
      // Set Ink
      UIUtils.ink({selector: '.item'});
    }, 10);
  };

  // Updating wallet data
  $scope.doUpdate = function () {
    UIUtils.loading.show();
    csWallet.refreshData()
      .then(function () {
        $scope.updateView();
        UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('ERROR.REFRESH_WALLET_DATA'));
  };

  $scope.filterPositive = function (prop) {
    return function (item) {
      return item[prop] > 0;
    };
  };

  $scope.filterNegative = function (prop) {
    return function (item) {
      return item[prop] < 0;
    };
  };

}

function WalletSecurityModalController($scope, $rootScope, UIUtils, csWallet, $translate, CryptoUtils, $timeout){

  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };
  $scope.isLastSlide = false;
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.option = 'recoverID';

  $scope.recover = {};
  $scope.isValidFile = false;

  $scope.isLogin = csWallet.isLogin();
  $scope.formData = {
    addQuestion: '',
    level: '4',
    questions : []
  };

  for (var i = 1; i<20; i++){
    $translate('ACCOUNT.SECURITY.QUESTION_' + i.toString())
      .then(function(translation){
        $scope.formData.questions.push({value: translation , checked: false});
      })
  };

  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = false;

  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
    $scope.isLastSlide = ($scope.slides.slider.activeIndex === 3 && ($scope.option == "saveID" || $scope.option == "recoverID")) || ($scope.slides.slider.activeIndex === 2 && $scope.option == "revocation");
  };


  $scope.doNext = function(formName) {
    if (!formName) {
      formName = $scope.slides.slider.activeIndex === 1 && $scope.option == "saveID" ? 'questionsForm' :
        ($scope.slides.slider.activeIndex === 2 && $scope.option === "recoverID" ? 'recoverForm' :
          ($scope.slides.slider.activeIndex === 2 && $scope.option === "saveID" ? 'answersForm' :
            ($scope.slides.slider.activeIndex === 3 && $scope.option === "saveID" ? 'loginForm' : formName)));

      if ($scope.slides.slider.activeIndex === 1 && $scope.option === "recoverID" && $scope.isValidFile){
        $scope.slideNext();
      }
    }

    if (formName) {
      $scope[formName].$submitted = true;
      if (!$scope[formName].$valid) {
        return;
      }
      if(formName === 'recoverForm'){
        $scope.recoverId();
      }
      else if(formName === 'loginForm'){
        $scope.submit();
      }
      else {
        $scope.slideNext();
      }
    }
  };


  $scope.selectOption = function(option){
    $scope.option = option;
    $scope.slideNext();
  };


  $scope.restore = function(){
    if ($scope.slides.slider.activeIndex === 1 && $scope.option === 'saveID') {
      $scope.formData = {
        addQuestion: '',
        level: '4',
        questions: []
      };
      for (var i = 1; i < 20; i++) {
        $translate('ACCOUNT.SECURITY.QUESTION_' + i.toString())
          .then(function (translation) {
            $scope.formData.questions.push({value: translation, checked: false});
          })
      }
    }
    else if ($scope.slides.slider.activeIndex === 2 && $scope.option === 'saveID') {
      _.each($scope.formData.questions, function(question){
        question.answer = undefined;
      })
    }
    else if ($scope.slides.slider.activeIndex === 1 && $scope.option === 'recoverID'){
      $scope.hasContent = false;
      $scope.recover = {};
      $scope.fileData =  '';
      $scope.isValidFile = false;

    }
    else if ($scope.slides.slider.activeIndex === 2 && $scope.option === 'recoverID'){
      _.each($scope.recover.questions, function(element){
        element.answer = undefined;
      })

    }
  };

  /**
   * Recover Id
   */

  $scope.recoverContent = function(file) {
    $scope.hasContent = file !== '';
    $scope.fileData = file.fileData ? file.fileData : '';
    $scope.fileData.type = /^image/.test($scope.fileData.type) ? 'image' : $scope.fileData.type;
    $scope.isValidFile = $scope.fileData !== '' && $scope.fileData.type == 'text/plain';

    if ($scope.isValidFile) {
      $scope.content = file.fileContent.split('\n');
      var indexOfQuestions = _.indexOf($scope.content, 'Questions: ');
      var LastIndexQuestions = -1;
      _.each($scope.content, function (element, index) {
        if (/^Issuer:/.test(element)) {
          LastIndexQuestions = index;
        }
        else if (/^Crypted-Nonce:/.test(element)) {
          $scope.recover.cypherNonce = element.split(' ')[1];
        }
        else if (/^Crypted-Pubkey:/.test(element)) {
          $scope.recover.cypherPubkey = element.split(' ')[1];
        }
        else if (/^Crypted-Salt:/.test(element)) {
          $scope.recover.cypherSalt = element.split(' ')[1];
        }
        else if (/^Crypted-Pwd:/.test(element)) {
          $scope.recover.cypherPwd = element.split(' ')[1];
        }
      });
      $scope.recover.questions = [];
      for (var i = indexOfQuestions + 1; i < LastIndexQuestions; i++) {
        $scope.recover.questions.push({value: $scope.content[i]});
      }
    }
  };

  $scope.recoverId = function(){
    if(!$scope.recoverForm.$valid){
      return;
    }

    $scope.recover.answer = '';
    _.each($scope.recover.questions, function(element){
      $scope.recover.answer += element.answer;
    })

    return csWallet.recoverId($scope.recover)
      .then(function (recover){
        $scope.recover = recover;
        $scope.slideNext();
      })

  };

  /**
   * Save Id
   */

  $scope.addQuestion = function(){
    if ($scope.formData.addQuestion != '') {
      $scope.formData.questions.push({value: $scope.formData.addQuestion, checked: true});
      $scope.formData.addQuestion = '';
    }
  };

  $scope.submit = function(){
    if (!csWallet.isUserPubkey($scope.pubkey)){
      UIUtils.alert.error('ERROR.SALT_OR_PASSWORD_NOT_CONFIRMED', 'ERROR.LOGIN_FAILED');
      return;
    }
    if(!$scope.loginForm.$valid){
      return;
    }

    var file = {file : _.filter($scope.formData.questions, function(question){
      return question.checked;
    })};
    var record = {
      salt: $scope.formData.username,
      pwd: $scope.formData.password,
      questions: '',
      answer: ''
    };
    _.each(file.file, function(question){
      record.questions += question.value + '\n';
      record.answer += question.answer;
    })

    return csWallet.getCryptedId(record)
      .then(function(record){
        csWallet.downloadSaveId(record);
        $scope.closeModal();
      })

  };

  $scope.isRequired = function(){
    var questionChecked = _.filter($scope.formData.questions, function(question) {
      return question.checked;
    })
    return questionChecked.length < $scope.formData.level;
  };

  $scope.formDataChanged = function() {
    $scope.computing = true;
    $scope.pubkey = '';
    $timeout(function() {
      var salt = $scope.formData.username;
      var pwd = $scope.formData.password;
      CryptoUtils.connect(salt, pwd).then(
        function (keypair) {
          $scope.pubkey = CryptoUtils.util.encode_base58(keypair.signPk);
          $scope.computing = false;
        }
      )
        .catch(function (err) {
          $scope.pubkey = '';
          UIUtils.loading.hide();
          console.error('>>>>>>>', err);
          UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
          $scope.computing = false;
        });
    }, 500);
  };
  $scope.$watch('formData.username', $scope.formDataChanged, true);
  $scope.$watch('formData.password', $scope.formDataChanged, true);



  /**
   * Download revocation file
   */
  $scope.downloadRevokeFile = function () {
    csWallet.downloadRevocation();
  };

  /**
   * Revoke identity
   */
  $scope.revokeIdentity = function (confirm, confirmAgain) {
    if ($rootScope.walletData.requirements.needSelf) {
      return UIUtils.alert.error("ERROR.ONLY_SELF_CAN_EXECUTE_THIS_ACTION");
    }
    if (!confirm) {
      return UIUtils.alert.confirm("CONFIRM.REVOKE_IDENTITY", 'CONFIRM.POPUP_WARNING_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_CONTINUE',
        okType: 'button-assertive'
      })
        .then(function (confirm) {
          if (confirm) $scope.revokeIdentity(true); // loop with confirm
        });
    }
    if (!confirmAgain) {
      return UIUtils.alert.confirm("CONFIRM.REVOKE_IDENTITY_2", 'CONFIRM.POPUP_TITLE', {
        cssClass: 'warning',
        okText: 'COMMON.BTN_YES_CONTINUE',
        okType: 'button-assertive'
      })
        .then(function (confirm) {
          if (confirm) $scope.revokeIdentity(true, true); // loop with all confirmation
        });
    }

    return UIUtils.loading.show()
      .then(function () {
        return csWallet.revoke();
      })
      .then(function () {
        UIUtils.toast.show("INFO.REVOCATION_SENT");
        $scope.updateView();
        return UIUtils.loading.hide();
      })
      .catch(function (err) {
        UIUtils.onError('ERROR.REVOCATION_FAILED')(err);
      });
  };
}
