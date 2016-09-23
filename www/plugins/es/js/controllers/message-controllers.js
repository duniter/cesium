angular.module('cesium.es.message.controllers', ['cesium.es.services', 'cesium.es.message.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

      .state('app.user_message', {
        cache: false,
        url: "/user/message",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/inbox.html",
            controller: 'ESMessageInboxCtrl'
          }
        }
      })

      .state('app.user_new_message', {
        cache: false,
        url: "/user/message/new?pubkey&uid",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/compose.html",
            controller: 'ESMessageComposeCtrl'
          }
        }
      })

    ;
  })

  .controller('ESMessageInboxCtrl', ESMessageInboxController)

  .controller('ESMessageComposeCtrl', ESMessageComposeController)

  .controller('ESMessageComposeModalCtrl', ESMessageComposeModalController)

;

function ESMessageInboxController($scope, $rootScope, $timeout, $q, ModalUtils, UIUtils, esMessage, CryptoUtils) {
  'ngInject';

  $scope.loading = true;
  $scope.messages = [];

  $scope.$on('$ionicView.enter', function(e, $state) {

    $scope.loadWallet()
      .then(function(walletData) {
        if ($scope.loading) {
          $scope.load();
        }

        $scope.showFab('fab-add-message-record');
      })
      .catch(function(err) {
        // TODO
    });
  });

  $scope.load = function(size, offset) {
    offset = offset || 0;
    size = size || 20;

    $scope.loading = true;
    var request = {
      sort: {
        "time" : "desc"
      },
      query: {
        bool: {
          filter: {
            //term: {issuer: $rootScope.walletData.pubkey},
            term: {recipient: $rootScope.walletData.pubkey}
          }
        }
      },
      from: offset,
      size: size,
      _source: esMessage.fields.commons
    };

    //request.query.bool = {};

    var filters = [];
    //filters.push({match : { issuer: $rootScope.walletData.pubkey}});
    //filters.push({match : { recipient: $rootScope.walletData.pubkey}});
    //filters.push({match_phrase: { location: $scope.search.location}});
    //request.query.bool.should =  filters;

    return $scope.doRequest(request);

  };

  $scope.doRequest = function(request) {

    return esMessage.searchAndDecrypt(request, $rootScope.walletData.keypair)
      .then(function(messages) {
        $scope.messages = messages;
        UIUtils.loading.hide();
        $scope.loading = false;
      })
      .catch(function(err) {
        UIUtils.onError('MESSAGE.ERROR.SEARCH_FAILED')(err);
        $scope.messages = [];
        $scope.loading = false;
      });
  };

  /*$scope.doDecryption = function() {

    return esMessage.search(request)
      .then(function(res) {
        if (res.hits.total === 0) {
          $scope.messages = [];
        }
        else {
          var messages = res.hits.hits.reduce(function(result, hit) {
            var message = hit._source;

            // decrypt
            return result.concat(message)
          }, []);
          $scope.messages = messages;
        }
        UIUtils.loading.hide();
        $scope.loading = false;
      })
      .catch(function(err) {
        UIUtils.onError('MESSAGE.ERROR.SEARCH_FAILED')(err);
        $scope.messages = [];
        $scope.loading = false;
      });
  };*/

  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    $scope.loadWallet()
      .then(function() {
        UIUtils.loading.hide();

        return ModalUtils.show('plugins/es/templates/message/modal_compose.html',
          'ESMessageComposeModalCtrl',
          parameters, {focusFirstInput: true});
      });
  };

  // TODO : for DEV only
  $timeout(function() {
    //$scope.showNewMessageModal();
   }, 900);
}


function ESMessageComposeController($scope, $rootScope, $ionicHistory, $timeout, $focus, $q, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage) {
  'ngInject';

  ESMessageComposeModalController.call(this, $scope, $rootScope, $timeout, $focus, $q, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage);

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!!$state.stateParams && !!$state.stateParams.pubkey) {
      $scope.formData.destPub = $state.stateParams.pubkey;
      if (!!$state.stateParams.uid) {
        $scope.destUid = $state.stateParams.uid;
        $scope.destPub = '';
      }
      else {
        $scope.destUid = '';
        $scope.destPub = $scope.formData.destPub;
      }
    }

    $scope.loadWallet()
      .then(function() {
        UIUtils.loading.hide();
      });
  });

  $scope.cancel = function() {
    $ionicHistory.goBack();
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

}

function ESMessageComposeModalController($scope, $rootScope, $timeout, $focus, $q, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage) {
  'ngInject';

  $scope.formData = {
    title: null,
    content: null,
    destPub: null
  };

  $scope.doSend = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid) {
      return;
    }

    UIUtils.loading.show();

    var data = {
      issuer: Wallet.data.pubkey,
      recipient: $scope.formData.destPub,
      title: $scope.formData.title,
      content: $scope.formData.content,
      time: esHttp.date.now(),
      nonce: CryptoUtils.util.random_nonce()
    };

    esMessage.send(data, Wallet.data.keypair)
      .then(function(id) {
        $scope.id=id;
        UIUtils.loading.hide();
        $scope.closeModal(true);
      })
      .catch(UIUtils.onError('MESSAGE.ERROR.SEND_MSG_FAILED'));
  };

  /* -- Modals -- */

  $scope.showWotLookupModal = function() {
    Modals.showWotLookup()
      .then(function(result){
        if (result) {
          if (result.uid) {
            $scope.destUid = result.uid;
            $scope.destPub = '';
          }
          else {
            $scope.destUid = '';
            $scope.destPub = result.pubkey;
          }
          $scope.formData.destPub = result.pubkey;
          // TODO focus on title field
          //$focus('');
        }
      });
  };

  $scope.cancel = function() {
    $scope.closeModal();
  };


  // TODO : for DEV only
  $timeout(function() {
    $scope.formData.destPub = 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU';
    $scope.formData.title = 'test';
    $scope.formData.content = 'test';
    $scope.destPub = $scope.formData.destPub;

    $timeout(function() {
      //$scope.doSend();
    }, 800);
  }, 100);
}
