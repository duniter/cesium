angular.module('cesium.es.message.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.user_message', {
        url: "/user/message",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/lookup.html"
          }
        }
      })

      .state('app.user_message.tab_inbox', {
        url: "/inbox",
        views: {
          'tab_inbox': {
            controller: 'ESMessageInboxListCtrl',
            templateUrl: "plugins/es/templates/message/tabs/tab_list.html"
          }
        },
        data: {
          auth: true,
          minData: true,
          large: 'app.user_messages_lg_inbox'
        }
      })

      .state('app.user_message.tab_outbox', {
        url: "/outbox",
        views: {
          'tab_outbox': {
            controller: 'ESMessageOutboxListCtrl',
            templateUrl: "plugins/es/templates/message/tabs/tab_list.html"
          }
        },
        data: {
          auth: true,
          minData: true,
          large: 'app.user_messages_lg_outbox'
        }
      })

      .state('app.user_messages_lg_inbox', {
        url: "/user/message/lg/inbox",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/lookup_lg.html",
            controller: 'ESMessageInboxListCtrl'
          }
        },
        data: {
          auth: true,
          minData: true
        }
      })

      .state('app.user_messages_lg_outbox', {
        url: "/user/message/lg/outbox",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/message/lookup_lg.html",
            controller: 'ESMessageOutboxListCtrl'
          }
        },
        data: {
          auth: true,
          minData: true
        }
      })

      .state('app.user_new_message', {
        cache: false,
        url: "/user/message/new?pubkey&uid&title&content",
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
        },
        data: {
          auth: true,
          minData: true
        }
      })

    ;
  })

  .controller('ESMessageAbstractListCtrl', ESMessageAbstractListController)

  .controller('ESMessageInboxListCtrl', ESMessageInboxListController)

  .controller('ESMessageOutboxListCtrl', ESMessageOutboxListController)

  .controller('ESMessageComposeCtrl', ESMessageComposeController)

  .controller('ESMessageComposeModalCtrl', ESMessageComposeModalController)

  .controller('ESMessageViewCtrl', ESMessageViewController)

  .controller('PopoverMessageCtrl', PopoverMessageController)

;

function ESMessageAbstractListController($scope, $state, $translate, $ionicHistory, $ionicPopover, $timeout,
                                 csWallet, esModals, UIUtils, esMessage) {
  'ngInject';

  var defaultSearchLimit = 40;

  $scope.search = {
    loading: true,
    results: [],
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit,
    type: 'last',
    text: null,
    options: {
    }
  };

  $scope.fabButtonNewMessageId = undefined;

  $scope.$on('$ionicView.enter', function(e, state) {

    $scope.loadWallet({minData: true})
      .then(function() {
        if (!$scope.entered) {
          $scope.entered = true;
          $scope.type = $scope.type || state.stateParams && state.stateParams.type || 'inbox';
          $scope.load();
        }

        if ($scope.fabButtonNewMessageId) {
          $scope.showFab($scope.fabButtonNewMessageId);
        }
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

  $scope.refresh = function(silent) {
    return $scope.load(undefined, undefined, silent);
  };

  $scope.load = function(from, size, silent) {

    var options = angular.copy($scope.search.options);
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;
    options.type = $scope.type;
    options.summary = false;
    options.filter = ($scope.search.type == 'text' && $scope.search.text && $scope.search.text.trim().length > 0) ?
      $scope.search.text : undefined;

    $scope.search.loading = !silent;
    return esMessage.load(options)
      .then(function(res) {

        if (!options.from) {
          $scope.search.results = res || [];
        }
        else if (res){
          $scope.search.results = $scope.search.results.concat(res);
        }

        UIUtils.loading.hide();
        $scope.search.loading = false;
        $scope.search.hasMore = ($scope.search.results && $scope.search.results.length >= $scope.search.limit);
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!options.from) {
          $scope.search.results = [];
        }
        $scope.search.hasMore = false;
        UIUtils.onError('MESSAGE.ERROR.LOAD_MESSAGES_FAILED')(err);
      });
  };

  $scope.setType = function(type) {
    $scope.type = type;
    $scope.load();
  };

  $scope.updateView = function() {
    if ($scope.motion && $scope.motion.ionListClass && $scope.search.results.length) {
      $scope.motion.show({selector: '.view-messages .list .item'});
    }
  };

  $scope.showMore = function() {
    $scope.search.limit = $scope.search.limit || defaultSearchLimit;
    $scope.search.limit += defaultSearchLimit;
    if ($scope.search.limit < defaultSearchLimit) {
      $scope.search.limit = defaultSearchLimit;
    }
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.search.limit,
      true /*silent*/)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.markAllAsRead = function() {
    $scope.hideActionsPopover();
    if (!$scope.search.results || !$scope.search.results.length) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.MARK_ALL_AS_READ')
      .then(function(confirm) {
        if (confirm) {
          esMessage.markAllAsRead()
            .then(function () {
              _.forEach($scope.search.results, function(msg){
                msg.read = true;
              });
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.MARK_ALL_AS_READ_FAILED'));
        }
      });
  };

  $scope.delete = function(index) {
    var message = $scope.search.results[index];
    if (!message) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.REMOVE')
      .then(function(confirm) {
        if (confirm) {
          esMessage.remove(message.id, $scope.type)
            .then(function () {
              $scope.search.results.splice(index,1); // remove from messages array
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  $scope.deleteAll = function() {
    $scope.hideActionsPopover();
    if (!$scope.search.results || !$scope.search.results.length) return;

    UIUtils.alert.confirm('MESSAGE.CONFIRM.REMOVE_ALL')
      .then(function(confirm) {
        if (confirm) {
          esMessage.removeAll($scope.type)
            .then(function () {
              $scope.search.results.splice(0,$scope.search.results.length); // reset array
              UIUtils.toast.show('MESSAGE.INFO.All_MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_All_MESSAGES_FAILED'));
        }
      });
  };

  $scope.doSearchLast = function() {
    $scope.search.type='last';
    $scope.search.loadingMore=false;
    $scope.search.limit = defaultSearchLimit;
    return $scope.load();
  };

  $scope.doSearch = function() {
    if (!$scope.search.text || $scope.search.text.length < 3) {
      return;
    }
    $scope.search.type='text';
    $scope.search.loadingMore=false;
    $scope.search.results = [];
    $scope.search.limit = defaultSearchLimit;

    console.debug('[message] [{0}] Searching for: {1}'.format($scope.type, $scope.search.text));
    return $scope.load();
  };

  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    return $scope.loadWallet({minData: true})
      .then(function() {
        UIUtils.loading.hide();
        return esModals.showMessageCompose(parameters)
          .then(function(id) {
            if (id) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
          });
      });
  };

  $scope.showReplyModal = function(index) {
    var message = $scope.search.results[index];
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

  /* -- watch events (delete, received, sent) -- */

  // Message deletion
  $scope.onMessageDelete = function(id) {
    var index = _.findIndex($scope.search.results, function(msg) {
      return msg.id == id;
    });
    if (index) {
      $scope.search.results.splice(index,1); // remove from messages array
    }
  };
  esMessage.api.data.on.delete($scope, $scope.onMessageDelete);

  // Watch user sent message
  $scope.onNewOutboxMessage = function(id) {
    if ($scope.type != 'outbox') return;
    // Add message sent to list
    $scope.loading = true;
    return $timeout(function() {
       // Load the message sent
        return esMessage.get(id, {type: $scope.type, summary: true});
      }, 500 /*waiting ES propagation*/)
      .then(function(msg) {
        $scope.search.results.splice(0,0,msg);
        $scope.loading = false;
        $scope.motion.show({selector: '.view-messages .list .item'});
      })
      .catch(function() {
        $scope.loading = false;
      });
  };
  esMessage.api.data.on.sent($scope, $scope.onNewOutboxMessage);

  // Watch received message
  $scope.onNewInboxMessage = function(notification) {
    if ($scope.type != 'inbox' || !$scope.entered) return;
    // Add message sent to list
    $scope.loading = true;
    // Load the the message
    return esMessage.get(notification.id, {type: $scope.type, summary: true})
      .then(function(msg) {
        $scope.search.results.splice(0,0,msg);
        $scope.search.loading = false;
        $scope.motion.show({selector: '.view-messages .list .item'});
      })
      .catch(function() {
        $scope.search.loading = false;
      });
  };
  esMessage.api.data.on.new($scope, $scope.onNewInboxMessage);

  // Watch unauth
  $scope.onUnauth = function() {
    // Reset all data
    $scope.search.results = undefined;
    $scope.search.loading = false;
    $scope.entered = false;
  };
  csWallet.api.data.on.unauth($scope, $scope.onUnauth);

  // for DEV only
  /*$timeout(function() {
    $scope.showNewMessageModal();
   }, 900);
   */
}

function ESMessageInboxListController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESMessageAbstractListCtrl', {$scope: $scope}));

  $scope.type = 'inbox';
  $scope.fabButtonNewMessageId = 'fab-add-message-record-inbox';

}


function ESMessageOutboxListController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESMessageAbstractListCtrl', {$scope: $scope}));

  $scope.type = 'outbox';
  $scope.fabButtonNewMessageId = 'fab-add-message-record-outbox';
}

function ESMessageComposeController($scope, $controller) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESMessageComposeModalCtrl', {$scope: $scope, parameters: {}}));


  $scope.enter = function(e, state) {

    // Apply state parameters
    if (state && state.stateParams) {
      $scope.setParameters(state.stateParams);
    }

    // Load wallet
    return $scope.load()
      .then(UIUtils.loading.hide);
  };
  $scope.$on('$ionicView.enter',$scope.enter);

  $scope.cancel = function() {
    $scope.showHome();
  };

  $scope.setForm = function(form) {
    $scope.form = form;
  };

  $scope.closeModal = function() {
    $scope.showHome();
  };

}

function ESMessageComposeModalController($scope, Modals, UIUtils, csWallet, esHttp, esMessage, parameters) {
  'ngInject';

  var wallet;

  $scope.formData = {
    title: null,
    content: null,
    destPub: null,
    walletId: null
  };
  $scope.destUid = null;
  $scope.destPub = null;
  $scope.isResponse = false;
  $scope.enableSelectWallet = true;

  $scope.setParameters = function(parameters) {
    if (!parameters) return;

    if (parameters.pubkey || parameters.destPub) {
      $scope.formData.destPub = parameters.pubkey || parameters.destPub;
      if (parameters.uid || parameters.destUid) {
        $scope.destUid = parameters.uid || parameters.destUid;
        $scope.destPub = '';
      }
      else {
        $scope.destUid = '';
        $scope.destPub = $scope.formData.destPub;
      }
    }

    if (parameters.title) {
      $scope.formData.title = parameters.title;
    }

    if (parameters.content) {
      $scope.formData.content = parameters.content;
    }

    $scope.isResponse = parameters.isResponse || false;

    if (parameters.wallet) {
      $scope.formData.walletId = parameters.wallet;
    }
  };

  // Read default parameters
  $scope.setParameters(parameters);

  $scope.load = function() {
    $scope.enableSelectWallet = csWallet.children.count() > 0;

    wallet = $scope.enableSelectWallet && ($scope.formData.walletId ? csWallet.children.get($scope.formData.walletId) : csWallet) || csWallet;
    if (!wallet.isDefault()) {
      console.debug("[message] Using {" + wallet.id + "} wallet");
    }

    return wallet.login({minData: true, silent: true})
      .then(function(data) {
        $scope.walletData = data;
      })
      .catch(function(err){
        if (err === 'CANCELLED') {
          $scope.cancel();
        }
      });
  };
  $scope.$on('modal.shown', $scope.load);

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
      issuer: wallet.data.pubkey,
      recipient: $scope.formData.destPub,
      title: $scope.formData.title,
      content: $scope.formData.content,
      time: moment().utc().unix()
    };

    esMessage.send(data, {wallet: wallet})
      .then(function(id) {
        $scope.id=id;
        UIUtils.loading.hide();
        $scope.closeModal(id);
      })
      .catch(UIUtils.onError('MESSAGE.ERROR.SEND_MSG_FAILED'));
  };


  $scope.cancel = function() {
    $scope.closeModal();
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

  $scope.showSelectWalletModal = function() {
    if (!$scope.enableSelectWallet) return;

    return Modals.showSelectWallet({
      showDefault: true,
      showBalance: false
    })
      .then(function(newWallet) {
        if (!newWallet || (wallet && wallet.id === newWallet.id)) return;
        wallet = newWallet;
        $scope.walletData = wallet.data;
        console.debug("[message] Using {" + wallet.id + "} wallet");
      });
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


function ESMessageViewController($scope, $state, $timeout, $translate, $ionicHistory, $ionicPopover,
                                 UIUtils, esModals, esMessage) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.loading = true;

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

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
        return esMessage.get(id, {type: type});
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
          return esMessage.remove($scope.id, $scope.type)
            .then(function () {
              $ionicHistory.nextViewOptions({
                historyRoot: true
              });
              $state.go($scope.type == 'inbox' ? 'app.user_message.tab_inbox' : 'app.user_message.tab_outbox',
                {type: $scope.type}
              );
              UIUtils.toast.show('MESSAGE.INFO.MESSAGE_REMOVED');
            })
            .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_MESSAGE_FAILED'));
        }
      });
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/message/view_popover_actions.html', {
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
      .then(function(id) {
        if (id) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
      });
  };

  /* -- listeners -- */

  csWallet.api.data.on.logout($scope, $scope.resetData);
  esHttp.api.node.on.stop($scope, $scope.resetData);
  esHttp.api.node.on.start($scope, $scope.load);
  esMessage.api.data.on.new($scope, $scope.onNewMessageNotification);

}
