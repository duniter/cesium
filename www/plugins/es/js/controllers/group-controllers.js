angular.module('cesium.es.group.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.groups', {
        url: "/group?type&location",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/group/lookup.html",
            controller: 'ESGroupListCtrl'
          }
        }
      })

      .state('app.add_group', {
        url: "/group/add/:type",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/group/edit_group.html",
            controller: 'ESGroupEditCtrl'
          }
        }
      })

      .state('app.edit_group', {
        url: "/group/edit/:id",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/group/edit_group.html",
            controller: 'ESGroupEditCtrl'
          }
        }
      })


      .state('app.view_group', {
        url: "/group/view/:id",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/group/view_record.html",
            controller: 'ESGroupViewCtrl'
          }
        }
      })

    ;
  })

  .controller('ESGroupListCtrl', ESGroupListController)

  .controller('ESGroupViewCtrl', ESGroupViewController)

  .controller('ESGroupEditCtrl', ESGroupEditController)

  .controller('PopoverGroupCtrl', PopoverGroupController)

;

function ESGroupListController($scope, UIUtils, $state, csWallet, esGroup, ModalUtils) {
  'ngInject';

  var defaultSearchLimit = 40;

  $scope.search = {
    loading : true,
    results: null,
    type: 'last',
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit
  };
  $scope.enableFilter = !UIUtils.screen.isSmall();

  $scope.$on('$ionicView.enter', function() {
    if ($scope.search.loading) {
      $scope.doSearch();
    }
  });

  $scope.doSearch = function(from, size) {
    var options = {};
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;
    $scope.search.loading = true;
    return esGroup.record.search(options)
      .then(function(res) {
        if (!from) {
          $scope.search.results = res || [];
        }
        else if (res){
          $scope.search.results = $scope.search.results.concat(res);
        }
        $scope.search.loading = false;
        $scope.search.hasMore = $scope.search.results.length >= $scope.search.limit;
        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.loading = false;
        if (!from) {
          $scope.search.results = [];
        }
        $scope.search.hasMore = false;
        UIUtils.onError('GROUP.ERROR.SEARCH_GROUPS_FAILED')(err);
      });
  };

  $scope.updateView = function() {

    $scope.$broadcast('$$rebind::rebind'); // notify binder
    $scope.motion.show({selector: '.list.{0} .item'.format($scope.motion.ionListClass)});
  };

  $scope.select = function(item) {
    if (item && item.id) $state.go('app.view_group', {id: item.id});
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
      $scope.search.limit)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.resetData = function() {
    if ($scope.search.loading) return;
    console.debug("[ES] [group] Resetting data (settings or account may have changed)");
    $scope.search.hasMore = false;
    $scope.search.results = [];
    $scope.search.loading = true;
    delete $scope.search.limit;
  };
  // When logout: force reload
  csWallet.api.data.on.logout($scope, $scope.resetData);

  /* -- modals and views -- */

  $scope.showNewRecordModal = function() {
    $scope.loadWallet({minData: true})
      .then(function(walletData) {
        UIUtils.loading.hide();
        $scope.walletData = walletData;
        ModalUtils.show('plugins/es/templates/group/modal_record_type.html')
          .then(function(type){
            if (type) {
              $state.go('app.add_group', {type: type});
            }
          });
      });
  };
}

function PopoverGroupController($scope, $timeout, UIUtils, $state, csWallet, esNotification, esGroup, esModals) {
  'ngInject';

  var defaultSearchLimit = 40;

  $scope.search = {
    loading : true,
    results: null,
    hasMore : false,
    loadingMore : false,
    limit: defaultSearchLimit,
    options: {
      codes: {
        includes: esNotification.constants.GROUP_CODES
      }
    }
  };

  $scope.load = function(from, size) {
    var options = angular.copy($scope.search.options);
    options.from = options.from || from || 0;
    options.size = options.size || size || defaultSearchLimit;

    return esNotification.load(csWallet.data.pubkey, options)
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

    $timeout(function() {
      UIUtils.ink({selector: '.popover-notification .item.ink'});
    }, 100);
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

  $scope.onNewNotification = function(notification) {
    if (!$scope.search.loading && !$scope.search.loadingMore &&  notification.isMessage) {
      console.debug("[popover] detected new message (from notification service)");

      if (notification.reference) {
        console.log("[popover] new message has a reference !");
      }
      $scope.search.results.splice(0,0,notification);
      $scope.updateView();
    }
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

  csWallet.api.data.on.logout($scope, $scope.resetData);

  /* -- Modals -- */

  $scope.showNewMessageModal = function(parameters) {
    $scope.closePopover();
    return esModals.showMessageCompose(parameters)
      .then(function(sent) {
        if (sent) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
      });
  };

  esNotification.api.data.on.new($scope, $scope.onNewNotification);

  /* -- default popover action -- */
  if ($scope.search.loading) {
    $scope.load();
  }

}


function ESGroupViewController($scope, $state, UIUtils, esGroup, csWallet) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.pictures = [];
  $scope.loading = true;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (state.stateParams && state.stateParams.id) { // Load by id
      if ($scope.loading || state.stateParams.refresh) { // prevent reload if same id (if not forced)
        $scope.load(state.stateParams.id, state.stateParams.anchor);
      }
      UIUtils.loading.hide();
      $scope.$broadcast('$recordView.enter', state);
    }
    else {
      $state.go('app.groups');
    }
  });

  $scope.load = function(id) {
    esGroup.record.load(id, {
      fetchPictures: true
    })
      .then(function (data) {
        $scope.id = data.id;
        $scope.formData = data.record;
        $scope.issuer= data.issuer;
        $scope.canEdit = csWallet.isUserPubkey($scope.formData.issuer);

        $scope.pictures = data.record.pictures || [];
        delete data.record.pictures; // remove, as already stored in $scope.pictures

        $scope.loading = false;
        UIUtils.loading.hide();
        $scope.updateView();

      })
      .catch(UIUtils.onError('GROUP.ERROR.LOAD_RECORD_FAILED'));
  };

  $scope.updateView = function() {
    $scope.motion.show();
  };

  // Edit click
  $scope.edit = function() {
    UIUtils.loading.show();
    $state.go('app.edit_group', {id: $scope.id});
  };
}

function ESGroupEditController($scope, esGroup, UIUtils, $state, $q, Device,
                               $ionicHistory, ModalUtils, $focus, $timeout, esHttp) {
  'ngInject';

  $scope.walletData = {};
  $scope.formData = {};
  $scope.id = null;
  $scope.pictures = [];
  $scope.loading = true;

  $scope.setForm =  function(form) {
    $scope.form = form;
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    $scope.loadWallet({minData: true})
      .then(function(walletData) {
        $scope.walletData = walletData;
        if (state.stateParams && state.stateParams.id) { // Load by id
          $scope.load(state.stateParams.id);
        }
        else {
          if (state.stateParams && state.stateParams.type) {
            $scope.formData.type=state.stateParams.type;
          }
          $scope.loading = false;
          UIUtils.loading.hide();
          $scope.updateView();
        }
        // removeIf(device)
        $focus('group-record-title');
        // endRemoveIf(device)
      });
  });

  $scope.load = function(id) {
    esGroup.record.load(id, {
      fetchPictures: true,
      html: false
    })
      .then(function (data) {
        $scope.formData = data.record;
        $scope.issuer= data.issuer;
        $scope.id= data.id;

        $scope.pictures = data.record.pictures || [];
        delete data.record.pictures; // remove, as already stored in $scope.pictures

        $scope.loading = false;
        UIUtils.loading.hide();
        $scope.updateView();

      })
      .catch(UIUtils.onError('GROUP.ERROR.LOAD_RECORD_FAILED'));
  };

  $scope.updateView = function() {
    $scope.motion.show({selector: '.list.{0} .item, .card-gallery'.format($scope.motion.ionListClass)});
  };

  $scope.save = function() {
    $scope.form.$submitted=true;
    if($scope.saving || // avoid multiple save
      !$scope.form.$valid ||
      ($scope.formData.type !== 'managed' && $scope.formData.type !== 'open')) {
      return;
    }
    $scope.saving = true;
    return UIUtils.loading.show()

      .then(function(){
        var json = $scope.formData;
        json.time = esHttp.date.now();

        // Resize pictures
        json.picturesCount = $scope.pictures.length;
        if (json.picturesCount > 0) {
          json.pictures = $scope.pictures.reduce(function(res, pic) {
            return res.concat({file: esHttp.image.toAttachment(pic)});
          }, []);
          return UIUtils.image.resizeSrc($scope.pictures[0].src, true) // resize thumbnail
            .then(function(imageSrc) {
              json.thumbnail = esHttp.image.toAttachment({src: imageSrc});
              return json;
            });
        }
        else {
          if (json.thumbnail) {
            // FIXME: this is a workaround to allow content deletion
            // Is it a bug in the ES attachment-mapper ?
            json.thumbnail = {
              _content: '',
              _content_type: ''
            };
          }
          json.pictures = [];
          return json;
        }
      })
      .then(function(json){
        // Create
        if (!$scope.id) {
          json.creationTime = esHttp.date.now();
          return esGroup.record.add(json);
        }
        // Update
        return esGroup.record.update(json, {id: $scope.id});
      })

      .then(function(id) {
        $scope.id = $scope.id || id;
        $scope.saving = false;
        $ionicHistory.clearCache($ionicHistory.currentView().stateId); // clear current view
        $ionicHistory.nextViewOptions({historyRoot: true});
        return $state.go('app.view_group', {id: $scope.id, refresh: true});
      })

      .catch(function(err) {
        $scope.saving = false;
        UIUtils.onError('GROUP.ERROR.SAVE_RECORD_FAILED')(err);
      });
  };

  $scope.openPicturePopup = function() {
    Device.camera.getPicture()
      .then(function(imageData) {
        $scope.pictures.push({src: "data:image/png;base64," + imageData});
        $scope.$apply();
      })
      .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
  };

  $scope.fileChanged = function(event) {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      var file = event.target.files[0];
      UIUtils.image.resizeFile(file)
        .then(function(imageData) {
          $scope.pictures.push({src: imageData});
          UIUtils.loading.hide();
          resolve();
        });
    });
  };

  $scope.removePicture = function(index){
    $scope.pictures.splice(index, 1);
  };

  $scope.favoritePicture = function(index){
    if (index > 0) {
      var item = $scope.pictures[index];
      $scope.pictures.splice(index, 1);
      $scope.pictures.splice(0, 0, item);
    }
  };

  $scope.cancel = function() {
    $ionicHistory.goBack();
  };

  /* -- modals -- */
  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/group/modal_record_type.html')
      .then(function(type){
        if (type) {
          $scope.formData.type = type;
        }
      });
  };

}
