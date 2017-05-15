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

  .controller('JoinModalCtrl', JoinModalController)

;



function JoinController($timeout, Modals) {
  'ngInject';

  // Open join modal
  $timeout(function() {
    Modals.showJoin();
  }, 100);

}


function JoinModalController($scope, $state, $interval, $rootScope, UIUtils, CryptoUtils, csSettings, Modals, csWallet, csCurrency, BMA) {
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
  $scope.isLastSlide = false;
  $scope.search = {
    looking: true
  };

  $scope.isLicenceRead = false;
  $scope.showUsername = false;
  $scope.showPassword = false;
  $scope.formData.computing=false;
  $scope.smallscreen = UIUtils.screen.isSmall();
  $scope.userIdPattern = BMA.constants.regex.USER_ID;

  csCurrency.load()
  .then(function (data) {
    if (data) {
      $scope.knownCurrencies = data.currencies;
    }
    $scope.search.looking = false;
  })
  .catch(UIUtils.onError('ERROR.GET_CURRENCIES_FAILED'));

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
    $scope.isLastSlide = $scope.formData.isMember ? ($scope.slides.slider.activeIndex === 5) : ($scope.slides.slider.activeIndex === 4);
  };

  $scope.selectCurrency = function(currency) {
    $scope.formData.currency = currency;
    $scope.slideNext();
  };

  $scope.selectAccountType = function(type) {
    $scope.formData.isMember = (type === 'member');
    $scope.slideNext();
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
      console.error('>>>>>>>' , err);
      UIUtils.alert.error('ERROR.CRYPTO_UNKNOWN_ERROR');
    });
  };

  $scope.formDataChanged = function() {
    $scope.formData.computing=false;
    $scope.formData.pubkey=null;
  };

  $scope.doNext = function(formName) {
    console.debug("[join] form " + formName + " OK. index=" + $scope.slides.slider.activeIndex);
    if($rootScope.accountType === 'member'){
      if (formName) {
        if((formName === 'pseudoForm') ||
          (formName === 'saltForm') ||
          (formName === 'passwordForm')){
          $scope[formName].$submitted=true;
          if(!$scope[formName].$valid) {
            return;
          }
        }

        if (formName === 'passwordForm') {
            $scope.showAccountPubkey();
        }
        $scope.slideNext();
      }
    }
    else{
      $scope[formName].$submitted=true;
      if(!$scope[formName].$valid) {
        return;
      }
      if(formName === 'passwordForm'){
        $scope.showAccountPubkey();
      }
    $scope.slideNext();
    }
  };

  $scope.doNewAccount = function(confirm) {

    if (!confirm) {

      return UIUtils.alert.confirm(($rootScope.accountType === 'member') ? 'ACCOUNT.NEW.CONFIRMATION_MEMBER_ACCOUNT' :
        'ACCOUNT.NEW.CONFIRMATION_WALLET_ACCOUNT')
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
      if ($rootScope.accountType === "member") {
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
                $scope.dowloadRevocationRegistration();
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


  $scope.dowloadRevocationRegistration = function() {
    return UIUtils.alert.download('DOWNLOAD.POPUP_REVOKE_MESSAGE', 'DOWNLOAD.POPUP_TITLE')
    .then(function() {
      return csWallet.downloadRevocation();
    });
  };

  $scope.showHelpModal = function(helpAnchor) {
    if (!helpAnchor) {
      helpAnchor = $scope.slides.slider.activeIndex == 2 ?
        'join-salt' : ( $scope.slides.slider.activeIndex == 3 ?
          'join-password' : 'join-pseudo');
    }
    Modals.showHelp({anchor: helpAnchor});
  };

  $scope.isBottom = function(){
    var yPos = document.getElementById("iframe").contentWindow.document.body.scrollTop;
    var scrollHeight = document.getElementById("iframe").contentWindow.document.body.scrollHeight;
    var clientHeight = document.getElementById("iframe").contentWindow.document.body.clientHeight;
    if(scrollHeight - clientHeight === yPos){
      return true;
    }
    return false;
  };

  $rootScope.startLicenceRead = function(){

    $scope.licenceReadInterval = $interval(function(){
      var counter = 0;
      if(counter === 0){
        $scope.slides.slider.lockSwipes();
        counter++;
      }

      if($scope.isBottom()){
        $scope.isLicenceRead = true; 
        $interval.cancel($scope.licenceReadInterval);
      }
      },1000);
  };

  $scope.checkUID = function(){
    var uid = $scope.formData.pseudo;
    $scope.UIDFound = false;
    $scope.formData.computing=true;
    BMA.wot.lookup({ search: uid }) // search on uid
      .then(function(res) {
        var found;
        if(!res.ucode){
          found = res.results &&
              res.results.length > 0 &&
              res.results.some(function(pub){
                return pub.uids && pub.uids.length > 0 &&
                  pub.uids.some(function(idty) {
                    return (idty.uid.toUpperCase() === uid.toUpperCase()); // same Uid
                  });
              });
        }
        if(found){
          $scope.formData.computing=false;
          $scope.UIDFound = true;
        }
        else{
          $scope.formData.computing=false;
          $scope.UIDFound = false;
        }
      })
      .catch(function(){
        $scope.formData.computing=false;
        $scope.UIDFound = false;
      });  
  };  
  $scope.$watch('formData.pseudo', $scope.checkUID, true);

  $scope.checkAccountAvailable = function() {
    var pub = $scope.formData.pubkey;
    $scope.accountAvailable = false;
    BMA.tx.sources({ pubkey: pub }) // search on pubkey
      .then(function(res) {
        if(!res.sources.length) {
          $scope.formData.computing=false;
          $scope.accountAvailable = true;
        }
        else{
          $scope.formData.computing=false;
        }
      });
  };

  $scope.identifierRecovery = function() {
    for (var i = 0; i < 2; i++) 
      $scope.slidePrev();
  };




  // TODO: remove auto add account when done
  /*$timeout(function() {
    //$scope.selectCurrency('test_net');
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

