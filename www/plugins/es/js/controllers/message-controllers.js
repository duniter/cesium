angular.module('cesium.es.message.controllers', ['cesium.es.services', 'cesium.es.message.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

      .state('app.user_message', {
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

      .state('app.user_view_message', {
        cache: false,
        url: "/user/message/view/:id",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/view_message.html",
            controller: 'ESMessageViewCtrl'
          }
        }
      })

    ;
  })

  .controller('ESMessageInboxCtrl', ESMessageInboxController)

  .controller('ESMessageComposeCtrl', ESMessageComposeController)

  .controller('ESMessageComposeModalCtrl', ESMessageComposeModalController)

  .controller('ESMessageViewCtrl', ESMessageViewController)



;

function ESMessageInboxController($scope, $rootScope, $state, $timeout, $translate, $ionicHistory, esModals, UIUtils, esMessage) {
  'ngInject';

  $scope.loading = true;
  $scope.messages = [];

  $scope.$on('$ionicView.enter', function(e) {

    $scope.loadWallet()
      .then(function() {
        if (!$scope.entered) {
          $scope.entered = true;
          $scope.load();
        }

        $scope.showFab('fab-add-message-record');
      })
      .catch(function(err) {
        if ('CANCELLED' === err) {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.home');
        }
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
      query: {bool: {filter: {term: {recipient: $rootScope.walletData.pubkey}}}},
      from: offset,
      size: size,
      _source: esMessage.fields.commons
    };

    return $scope.doRequest(request);

  };

  $scope.doRequest = function(request) {

    return esMessage.searchAndDecrypt(request, $rootScope.walletData.keypair)
      .then(function(messages) {
        $scope.messages = messages;

        UIUtils.loading.hide();
        $scope.loading = false;

        if (messages.length > 0) {
          // Set Motion
          $timeout(function() {
            UIUtils.motion.ripple({
              startVelocity: 3000
            });
            // Set Ink
            UIUtils.ink();
          }, 10);
        }
      })
      .catch(function(err) {
        UIUtils.onError('MESSAGE.ERROR.SEARCH_FAILED')(err);
        $scope.messages = [];
        $scope.loading = false;
      });
  };

  $scope.delete = function(index) {
    var message = $scope.messages[index];
    if (!message) return;

    UIUtils.alert.confirm('MESSAGE.REMOVE_CONFIRMATION')
      .then(function(confirm) {
        if (confirm) {
          esMessage.remove(message.id)
            .then(function () {
              $scope.messages.splice(index,1); // remove from messages array
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    return $scope.loadWallet()
      .then(function() {
        UIUtils.loading.hide();
        return esModals.showMessageCompose(parameters)
          .then(function() {
            UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
          });
      });
  };

  $scope.showReplyModal = function(index) {
    var message = $scope.messages[index];
    if (!message) return;

    $translate('MESSAGE.REPLY_TITLE_PREFIX')
      .then(function (prefix) {
        var content = message.content ? message.content.replace(/^/g, ' > ') : null;
        content = content ? content.replace(/\n/g, '\n > ') : null;
        content = content ? content +'\n' : null;
        return esModals.showMessageCompose({
          destPub: message.pubkey,
          destUid: message.name||message.uid,
          title: prefix + message.title,
          content: content,
          isReply: true
        });
      })
      .then(function() {
        UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
      });
  };

  // for DEV only
  /*$timeout(function() {
    $scope.showNewMessageModal();
   }, 900);
   */
}


function ESMessageComposeController($scope,  $ionicHistory, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage) {
  'ngInject';

  ESMessageComposeModalController.call(this, $scope, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage);

  $scope.$on('$ionicView.enter', function(e, state) {
    if (!!state.stateParams && !!state.stateParams.pubkey) {
      $scope.formData.destPub = state.stateParams.pubkey;
      if (!!$state.stateParams.uid) {
        $scope.destUid = state.stateParams.uid;
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
      })
      .catch(function(err){
        if (err === 'CANCELLED') {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.home');
        }
      });
  });

  $scope.cancel = function() {
    $ionicHistory.goBack();
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

}

function ESMessageComposeModalController($scope, Modals, UIUtils, CryptoUtils, Wallet, esHttp, esMessage, parameters) {
  'ngInject';

  $scope.formData = {
    title: parameters ? parameters.title : null,
    content: parameters ? parameters.content : null,
    destPub: parameters ? parameters.destPub : null
  };
  $scope.destUid = parameters ? parameters.destUid : null;
  $scope.destPub = (parameters && !parameters.destUid) ? parameters.destPub : null;
  $scope.isResponse = parameters ? parameters.isResponse : false;

  $scope.doSend = function(forceNoContent) {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid) {
      return;
    }

    // Ask user confirmation if no content
    if (!forceNoContent && (!$scope.formData.content || !$scope.formData.content.trim().length)) {
      return UIUtils.alert.confirm('MESSAGE.COMPOSE.CONTENT_CONFIRMATION')
        .then(function(confirm) {
          if (confirm) {
            $scope.doSend(true);
          }
        });
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
  /*$timeout(function() {
    $scope.formData.destPub = 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU';
    $scope.formData.title = 'test';
    $scope.formData.content = 'test';
    $scope.destPub = $scope.formData.destPub;

    $timeout(function() {
      //$scope.doSend();
    }, 800);
  }, 100);
  */
}


function ESMessageViewController($scope, $state, $timeout, $translate, $ionicHistory, UIUtils, esModals, esMessage, esUser) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function (e, state) {
    if (state.stateParams && state.stateParams.id) { // Load by id
      if ($scope.loading) { // prevent reload if same id
        $scope.load(state.stateParams.id);
      }

      $scope.showFab('fab-view-message-reply');
    }
    else {
      $state.go('app.user_message');
    }
  });

  $scope.load = function(id) {

    $scope.loadWallet()
      .then(function(){
        UIUtils.loading.hide();

        return esMessage.get({id: id})
          .then(function(message) {

            if (!message.valid) {

              return UIUtils.alert.error(!$scope.isUserPubkey(message.recipient) ? 'MESSAGE.ERROR.USER_NOT_RECIPIENT' : 'MESSAGE.ERROR.NOT_AUTHENTICATED_MESSAGE',
                'MESSAGE.ERROR.MESSAGE_NOT_READABLE')
                .then(function () {
                  $state.go('app.user_message');
                });
            }

            $scope.formData = message;
            $scope.canDelete = true;
            $scope.loading = false;

            // Load avatar and name (and uid)
            return esUser.profile.fillAvatars([{pubkey: $scope.formData.issuer}])
              .then(function (idties) {
                return idties[0];
              });
          })
          .then(function(member) {
            $scope.issuer = member;

            // Set Motion (only direct children, to exclude .lazy-load children)
            $timeout(function () {
              UIUtils.motion.fadeSlideIn({
                startVelocity: 3000
              });
            }, 10);
          })
          .catch(UIUtils.onError('MESSAGE.ERROR.LOAD_MESSAGE_FAILED'));
      })
      .catch(function(err){
        if (err === 'CANCELLED') {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.user_message');
        }
      });
  };

  $scope.delete = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }

    UIUtils.alert.confirm('MESSAGE.REMOVE_CONFIRMATION')
      .then(function(confirm) {
        if (confirm) {
          esMessage.remove($scope.formData.id)
            .then(function () {
              $ionicHistory.nextViewOptions({
                historyRoot: true
              });
              $state.go('app.user_message');
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  /* -- Modals -- */

  $scope.showReplyModal = function() {
    $translate('MESSAGE.REPLY_TITLE_PREFIX')
      .then(function (prefix) {
        var content = $scope.formData.content ? $scope.formData.content.replace(/^/g, ' > ') : null;
        content = content ? content.replace(/\n/g, '\n > ') : null;
        content = content ? content +'\n' : null;
        return esModals.showMessageCompose({
            destPub: $scope.formData.pubkey,
            destUid: $scope.formData.name||$scope.formData.uid,
            title: prefix + $scope.formData.title,
            content: content,
            isReply: true
          });
      });
  };
}
