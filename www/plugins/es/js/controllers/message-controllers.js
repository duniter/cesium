angular.module('cesium.es.message.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.user_message', {
        url: "/user/message?type",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/list.html",
            controller: 'ESMessageListCtrl'
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
        url: "/user/message/view/:type/:id",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/view_message.html",
            controller: 'ESMessageViewCtrl'
          }
        }
      })

    ;
  })

  .controller('ESMessageListCtrl', ESMessageListController)

  .controller('ESMessageComposeCtrl', ESMessageComposeController)

  .controller('ESMessageComposeModalCtrl', ESMessageComposeModalController)

  .controller('ESMessageViewCtrl', ESMessageViewController)

  .controller('PopoverMessageCtrl', PopoverMessageController)

;

function ESMessageListController($scope, $rootScope, $state, $translate, $ionicHistory, $ionicPopover,
                                 esModals, UIUtils, esMessage) {
  'ngInject';

  $scope.loading = true;
  $scope.messages = [];

  $scope.$on('$ionicView.enter', function(e, state) {

    $scope.loadWallet({minData: true})
      .then(function() {
        if (!$scope.entered) {
          $scope.entered = true;
          $scope.type = state.stateParams && state.stateParams.type || 'inbox';
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
    var options  = {};
    options.from = offset || 0;
    options.size = size || 20;
    options.type = $scope.type;

    $scope.loading = true;
    return esMessage.load($rootScope.walletData.keypair, options)
      .then(function(messages) {
        $scope.messages = messages;

        UIUtils.loading.hide();
        $scope.loading = false;

        if (messages.length > 0) {
          $scope.motion.show({selector: '.view-messages .list .item'});
        }
      })
      .catch(function(err) {
        UIUtils.onError('MESSAGE.ERROR.LOAD_MESSAGES_FAILED')(err);
        $scope.messages = [];
        $scope.loading = false;
      });
  };

  $scope.setType = function(type) {
    $scope.type = type;
    $scope.load();
  };

  $scope.markAllAsRead = function() {
    $scope.hideActionsPopover();
    if (!$scope.messages || !$scope.messages.length) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.MARK_ALL_AS_READ')
      .then(function(confirm) {
        if (confirm) {
          esMessage.markAllAsRead()
            .then(function () {
              _.forEach($scope.messages, function(msg){
                msg.read = true;
              });
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.MARK_ALL_AS_READ_FAILED'));
        }
      });
  };

  $scope.delete = function(index) {
    var message = $scope.messages[index];
    if (!message) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.REMOVE')
      .then(function(confirm) {
        if (confirm) {
          esMessage.remove(message.id, $scope.type)
            .then(function () {
              $scope.messages.splice(index,1); // remove from messages array
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  $scope.deleteAll = function() {
    $scope.hideActionsPopover();
    if (!$scope.messages || !$scope.messages.length) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.REMOVE_ALL')
      .then(function(confirm) {
        if (confirm) {
          esMessage.removeAll($scope.type)
            .then(function () {
              $scope.messages.splice(0,$scope.messages.length); // reset array
              UIUtils.toast.show('MESSAGE.INFO.All_MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_All_MESSAGES_FAILED'));
        }
      });
  };

  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    return $scope.loadWallet({minData: true})
      .then(function() {
        UIUtils.loading.hide();
        return esModals.showMessageCompose(parameters)
          .then(function(sent) {
            if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
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
          destPub: message.issuer,
          destUid: message.name||message.uid,
          title: prefix + message.title,
          content: content,
          isReply: true
        });
      })
      .then(function(sent) {
        if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
      });
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/message/lookup_popover_actions.html', {
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


  // for DEV only
  /*$timeout(function() {
    $scope.showNewMessageModal();
   }, 900);
   */
}


function ESMessageComposeController($scope, $controller, UIUtils, parameters) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESMessageComposeModalCtrl', {$scope: $scope}));

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

    $scope.loadWallet({minData: true})
      .then(function() {
        UIUtils.loading.hide();
      })
      .catch(function(err){
        if (err === 'CANCELLED') {
          $scope.showHome();
        }
      });
  });

  $scope.cancel = function() {
    $scope.showHome();
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.clodeModal = function() {
    $scope.showHome();
  };

}

function ESMessageComposeModalController($scope, Modals, UIUtils, CryptoUtils, csWallet, esHttp, esMessage, parameters) {
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
    if(!$scope.form.$valid /*|| !$scope.formData.destPub*/) {
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
      issuer: csWallet.data.pubkey,
      recipient: $scope.formData.destPub,
      title: $scope.formData.title,
      content: $scope.formData.content,
      time: esHttp.date.now()
    };

    esMessage.send(data, csWallet.data.keypair)
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
        $scope.type = state.stateParams.type || 'inbox';

        $scope.load(state.stateParams.id, $scope.type)
          .then(function(message) {
            $scope.loading = false;
            UIUtils.loading.hide();
            if (!message) return;

            $scope.id = message.id;
            $scope.formData = message;
            $scope.canDelete = true;
            $scope.motion.show({selector: '.view-message .list .item'});
            // Mark as read
            if (!message.read) {
              $timeout(function() {
                // Message has NOT changed
                if ($scope.id === message.id) {
                  esMessage.markAsRead(message, $scope.type)
                    .then(function() {
                      console.debug("[message] marked as read");
                    })
                    .catch(UIUtils.onError('MESSAGE.ERROR.MARK_AS_READ_FAILED'));
                }
              }, 2000); // 2s
            }
          });
      }

      $scope.showFab('fab-view-message-reply');
    }
    else {
      $state.go('app.user_message');
    }
  });

  $scope.load = function(id, type) {
    type = type || 'inbox';

    return $scope.loadWallet({minData: true})
      .then(function() {
        return esMessage.get({type: type, id: id});
      })
      .catch(UIUtils.onError('MESSAGE.ERROR.LOAD_MESSAGE_FAILED'))
      .then(function(message) {
        if (!message.valid) {
          return UIUtils.alert.error(!$scope.isUserPubkey(message.recipient) ? 'MESSAGE.ERROR.USER_NOT_RECIPIENT' : 'MESSAGE.ERROR.NOT_AUTHENTICATED_MESSAGE',
            'MESSAGE.ERROR.MESSAGE_NOT_READABLE')
            .then(function () {
              $state.go('app.user_message', {type: type});
            });
        }
        return message;
      });
  };

  $scope.delete = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }

    UIUtils.alert.confirm('MESSAGE.CONFIRM.REMOVE')
      .then(function(confirm) {
        if (confirm) {
          esMessage.remove($scope.id, $scope.type)
            .then(function () {
              $ionicHistory.nextViewOptions({
                historyRoot: true
              });
              $state.go('app.user_message', {type: $scope.type});
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  /* -- Modals -- */

  $scope.showReplyModal = function() {
    var recipientField = ($scope.type == 'inbox') ? 'issuer' : 'recipient';
    $translate('MESSAGE.REPLY_TITLE_PREFIX')
      .then(function (prefix) {
        var content = $scope.formData.content ? $scope.formData.content.replace(/^/g, ' > ') : null;
        content = content ? content.replace(/\n/g, '\n > ') : null;
        content = content ? content +'\n' : null;
        return esModals.showMessageCompose({
            destPub: $scope.formData[recipientField],
            destUid: $scope.formData.name||$scope.formData.uid,
            title: prefix + $scope.formData.title,
            content: content,
            isReply: true
          });
      })
      .then(function(sent) {
        if (sent) {
          UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT')
            .then(function() {
              $ionicHistory.goBack();
            });
        }
      })
    ;
  };
}

function PopoverMessageController($scope, UIUtils, $state, csWallet, esHttp, esMessage, esModals) {
  'ngInject';

  var defaultSearchLimit = 40;

  $scope.search = {
    loading : true,
    results: null,
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit
  };

  $scope.$on('popover.shown', function() {
    if ($scope.search.loading) {
      $scope.load();
    }
  });

  $scope.load = function(from, size) {
    var options = {};
    options.from = from || 0;
    options.size = size || defaultSearchLimit;
    return esMessage.notifications.load(options)
      .then(function(notifications) {
        if (!from) {
          $scope.search.results = notifications;
        }
        else {
          $scope.search.results = $scope.search.results.concat(notifications);
        }
        $scope.search.loading = false;
        $scope.search.hasMore = ($scope.search.results && $scope.search.results.length >= $scope.search.limit);
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!from) {
          $scope.search.results = [];
        }
        $scope.search.hasMore = false;
        UIUtils.onError('MESSAGE.ERROR.LOAD_NOTIFICATIONS_FAILED')(err);
      });
  };

  $scope.updateView = function() {
    if ($scope.motion && $scope.search.results && $scope.search.results.length) {
      $scope.motion.show({selector: '.popover-notification .item'});
    }
  };

  $scope.showMore = function() {
    $scope.search.limit = $scope.search.limit || defaultSearchLimit;
    $scope.search.limit = $scope.search.limit * 2;
    if ($scope.search.limit < defaultSearchLimit) {
      $scope.search.limit = defaultSearchLimit;
    }
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.search.limit)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  // Listen notifications changes
  $scope.onNewMessageNotification = function(notification) {
    if ($scope.search.loading || $scope.search.loadingMore) return;
    $scope.search.results.splice(0,0,notification);
    $scope.updateView();
  };

  $scope.select = function(notification) {
    if (!notification.read) notification.read = true;
    $state.go('app.user_view_message', {id: notification.id});
    $scope.closePopover(notification);
  };

  $scope.resetData = function() {
    if ($scope.search.loading) return;
    console.debug("[ES] [messages] Resetting data (settings or account may have changed)");
    $scope.search.hasMore = false;
    $scope.search.results = [];
    $scope.search.loading = true;
    delete $scope.search.limit;
  };


  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    $scope.closePopover();
    return esModals.showMessageCompose(parameters)
      .then(function(sent) {
        if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
      });
  };

  /* -- listeners -- */

  csWallet.api.data.on.logout($scope, $scope.resetData);
  esHttp.api.node.on.stop($scope, $scope.resetData);
  esHttp.api.node.on.start($scope, $scope.load);
  esMessage.api.data.on.new($scope, $scope.onNewMessageNotification);

}
