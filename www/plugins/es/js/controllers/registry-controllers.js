angular.module('cesium.es.registry.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.registry_lookup', {
      url: "/page?q&category&location&type&issuer&reload",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup.html",
          controller: 'ESRegistryLookupCtrl'
        }
      },
      data: {
        large: 'app.registry_lookup_lg'
      }
    })

    .state('app.registry_lookup_lg', {
      url: "/page/lg?q&category&location&type&issuer&reload",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup_lg.html",
          controller: 'ESRegistryLookupCtrl'
        }
      }
    })

    .state('app.wallet_pages', {
      url: "/wallet/pages?refresh",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_wallet_pages.html",
          controller: 'ESWalletPagesCtrl'
        }
      },
      data: {
        login: true,
        minData: true
      }
    })

    .state('app.view_page', {
      url: "/page/view/:id/:title?refresh",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'ESRegistryRecordViewCtrl'
        }
      }
    })

    .state('app.view_page_anchor', {
      url: "/page/view/:id/:title/:anchor",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'ESRegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_add_record', {
      cache: false,
      url: "/page/add/:type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      },
      data: {
        auth: true,
        minData: true
      }
    })

    .state('app.registry_edit_record', {
      cache: false,
      url: "/page/edit/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      },
      data: {
        auth: true,
        minData: true
      }
    })
    ;
  })

 .controller('ESRegistryLookupCtrl', ESRegistryLookupController)

 .controller('ESWalletPagesCtrl', ESWalletPagesController)

 .controller('ESRegistryRecordViewCtrl', ESRegistryRecordViewController)

 .controller('ESRegistryRecordEditCtrl', ESRegistryRecordEditController)

;

function ESRegistryLookupController($scope, $focus, $timeout, $filter,
                                    UIUtils, ModalUtils, BMA, esModals, esRegistry) {
  'ngInject';

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    results: [],
    loading: true,
    lastRecords: true,
    type: null,
    category: null,
    location: null,
    options: null,
    issuer: null
  };
  $scope.searchTextId = 'registrySearchText';

  $scope.enter = function(e, state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
      var hasOptions = false;
      var runSearch = false;
      var finishEntered = function() {
        $scope.search.options = hasOptions ? true : $scope.search.options; // keep null if first call
        if (runSearch) {
          $timeout(function() {
            $scope.doSearch();
          }, 100);
        }
        else { // By default : get last record
          $timeout(function() {
            $scope.doGetLastRecord();
          }, 100);
        }
        // removeIf(device)
        // Focus on search text (only if NOT device, to avoid keyboard opening)
        if ($scope.searchTextId) {
          $focus($scope.searchTextId);
        }
        // endRemoveIf(device)

        $scope.entered = true;
      };

      // Search by text
      if (state.stateParams && state.stateParams.q) {
        $scope.search.text=state.stateParams.q;
        runSearch = true;
      }

      // Search on type
      if (state.stateParams && state.stateParams.type) {
        $scope.search.type = state.stateParams.type;
        hasOptions = runSearch = true;
      }

      // Search on location
      if (state.stateParams && state.stateParams.location) {
        $scope.search.location = state.stateParams.location;
        hasOptions = runSearch = true;
      }

      // Search on issuer
      if (state.stateParams && state.stateParams.issuer) {
        $scope.search.issuer = state.stateParams.issuer;
        hasOptions = runSearch = true;
      }

      // Search on category
      if (state.stateParams && state.stateParams.category) {
        esRegistry.category.get({id: state.stateParams.category})
        .then(function(cat) {
          $scope.search.category = cat;
          hasOptions = runSearch = true;
          finishEntered();
        })
        .catch(UIUtils.onError("REGISTRY.ERROR.LOAD_CATEGORY_FAILED"));
      }
      else {
        finishEntered();
      }
    }
    $scope.showFab('fab-add-registry-record');

  };
  $scope.$on('$ionicView.enter', function(e, state) {
    return $scope.enter(e, state); // can be override by sub controller
  });

  $scope.doSearch = function(from) {
    $scope.search.loading = !from;
    $scope.search.lastRecords = false;
    if (!$scope.search.options) {
      $scope.search.options = false;
    }

    var text = $scope.search.text.trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      // pubkey : use a special 'term', because of 'non indexed' field
      if (BMA.regexp.PUBKEY.test(text /*case sensitive*/)) {
        filters.push({term : { issuer: text}});
        filters.push({term : { pubkey: text}});
      }
      else {
        text = text.toLowerCase();
        var matchFields = ["title", "description", "city", "address"];
        matches.push({multi_match : { query: text,
          fields: matchFields,
          type: "phrase_prefix"
        }});
        matches.push({match : { title: text}});
        matches.push({match : { description: text}});
        matches.push({prefix : { city: text}});
        matches.push({
          nested: {
            path: "category",
            query: {
              bool: {
                filter: {
                  match: { "category.name": text}
                }
              }
            }
          }
        });
      }
    }
    // issuer: use only on filter
    else if ($scope.search.options && $scope.search.issuer) {
      filters.push({term : { issuer: $scope.search.issuer}});
    }
    if ($scope.search.options && $scope.search.type) {
      filters.push({term: { type: $scope.search.type}});
    }
    if ($scope.search.options && $scope.search.category) {
      filters.push({
        nested: {
          path: "category",
          query: {
            bool: {
              filter: {
                term: { "category.id": $scope.search.category.id}
              }
            }
          }
        }
      });
    }
    if ($scope.search.options && $scope.search.location && $scope.search.location.length > 0) {
      filters.push({match_phrase: { city: $scope.search.location}});
    }

    if (matches.length === 0 && filters.length === 0) {
      $scope.doGetLastRecord();
      return;
    }

    var query = {bool: {}};
    if (matches.length > 0) {
      query.bool.should =  matches;
    }
    if (filters.length > 0) {
      query.bool.filter =  filters;
    }

    $scope.doRequest({query: query, from: from});
  };

  $scope.onToggleOptions = function() {
    if ($scope.search.entered) {
      $scope.doSearch();
    }
  };
  $scope.$watch('search.options', $scope.onToggleOptions, true);

  $scope.doGetLastRecord = function(from) {
    $scope.search.lastRecords = true;
    return $scope.doRequest({
        sort: {
          "creationTime" : "desc"
        },
        from: from
      });
  };

  $scope.doRequest = function(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || defaultSearchLimit;
    if (options.size < defaultSearchLimit) options.size = defaultSearchLimit;
    $scope.search.loading = (options.from === 0);

    return esRegistry.record.search(options)
      .then(function(records) {
        if (!records || !records.length) {
          $scope.search.results = (options.from > 0) ? $scope.search.results : [];
          $scope.search.loading = false;
          $scope.search.hasMore = false;
          return;
        }
        var formatSlug = $filter('formatSlug');
        _.forEach(records, function(record) {
          record.urlTitle = formatSlug(record.title);
        });

        // Replace results, or append if 'show more' clicked
        if (!options.from) {
          $scope.search.results = records;
        }
        else {
          $scope.search.results = $scope.search.results.concat(records);
        }
        $scope.search.hasMore = $scope.search.results.length >= options.from + options.size;
        $scope.search.loading = false;

        if (records.length > 0) {
          $scope.motion.show();
        }
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (options.from > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        UIUtils.onError('REGISTRY.ERROR.LOOKUP_RECORDS_FAILED')(err);
      });
  };

  $scope.showMore= function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    var searchFunction = ($scope.search.lastRecords) ?
      $scope.doGetLastRecord :
      $scope.doSearch;

    return searchFunction(from)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  /* -- modals -- */

  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/registry/modal_record_type.html')
    .then(function(type){
      if (type) {
        $scope.search.type = type;
        $scope.doSearch();
      }
    });
  };

  $scope.showCategoryModal = function() {
    // load categories
    esRegistry.category.all()
    .then(function(categories){
      // open modal
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
             {categories: categories}, {focusFirstInput: true});
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.search.category = cat;
        $scope.doSearch();
      }
    });
  };

  $scope.showNewPageModal = function() {
    return esModals.showNewPage();
  };

 // TODO: remove auto add account when done
 /* $timeout(function() {
    $scope.search.text='lavenier';
    $scope.doSearch();
  }, 400);
  */
}


function ESWalletPagesController($scope, $controller, $timeout, UIUtils, csWallet) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESRegistryLookupCtrl', {$scope: $scope}));

  $scope.searchTextId = undefined; // avoid focus

  // Override the default enter
  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      return csWallet.login({minData: true})
        .then(function(walletData) {
          UIUtils.loading.hide();
          $scope.search.issuer = walletData.pubkey;
          $scope.search.options = true;
          $timeout($scope.doSearch, 100);
        });
    }
    else {
      // Asking refresh
      if (state.stateParams && state.stateParams.refresh) {
        return $timeout($scope.doSearch, 2000 /*waiting for propagation, if deletion*/);
      }
    }
  };

  $scope.doUpdate = function() {
    if (!csWallet.isLogin()) return;
    $scope.search.issuer = csWallet.data.pubkey;
    $scope.search.options = true;
    return $scope.doSearch();
  };

}


function ESRegistryRecordViewController($scope, $rootScope, $state, $q, $timeout, $ionicPopover, $ionicHistory, $translate,
                                        $anchorScroll, csConfig,
                                        csWallet, esRegistry, UIUtils, esHttp) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.loading = true;
  $scope.motion = UIUtils.motion.fadeSlideIn;

  $scope.$on('$ionicView.enter', function(e, state) {
    if (state.stateParams && state.stateParams.id) { // Load by id
      if ($scope.loading || state.stateParams.refresh) { // prevent reload if same id (if not forced)
        $scope.load(state.stateParams.id, state.stateParams.anchor);
      }
      $scope.$broadcast('$recordView.enter', state);
    }
    else {
      $state.go('app.registry_lookup');
    }
  });

  $scope.$on('$ionicView.beforeLeave', function(event, args){
    $scope.$broadcast('$recordView.beforeLeave', args);
  });

  $scope.load = function(id, anchor) {
    $scope.loading = true;

    return $q.all([
      esRegistry.record.load(id)
        .then(function (data) {
          $scope.id= data.id;
          $scope.formData = data.record;
          console.log($scope.formData);
          $scope.canEdit = csWallet.isUserPubkey($scope.formData.issuer);
          $scope.issuer = data.issuer;
          // avatar
          $scope.avatar = $scope.formData.avatar;
          $scope.avatarStyle= $scope.formData.avatar && {'background-image':'url("'+$scope.avatar.src+'")'};

          UIUtils.loading.hide();
          $scope.loading = false;
          // Set Motion (only direct children, to exclude .lazy-load children)
          $scope.motion.show({selector: '.list > .item, .list > ng-if > .item'});
        })
        .catch(function(err) {
          // Retry (ES could have error)
          if (!$scope.secondTry) {
            $scope.secondTry = true;
            $q(function() {
              $scope.load(id);
            }, 100);
          }
          else {
            $scope.loading = false;
            if (err && err.ucode === 404) {
              UIUtils.toast.show('REGISTRY.ERROR.RECORD_NOT_EXISTS');
              $state.go('app.registry_lookup');
            }
            else {
              UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED')(err);
            }
          }
        }),

      // Load pictures
      esRegistry.record.picture.all({id: id})
        .then(function(hit) {

          $scope.pictures = hit._source.pictures && hit._source.pictures.reduce(function(res, pic) {
              return res.concat(esHttp.image.fromAttachment(pic.file));
            }, []);

          // Set Motion
          if ($scope.pictures.length > 0) {
            $scope.motion.show({
              selector: '.lazy-load .item.card-gallery',
              startVelocity: 3000
            });
          }
        })
        .catch(function() {
          $scope.pictures = [];
        }),

      // Load other data (from child controller)
      $timeout(function() {
        return $scope.$broadcast('$recordView.load', id, esRegistry.record.comment);
      })
    ])
    .then(function() {
      // Display items in technical parts
      $scope.motion.show({
        selector: '.lazy-load .item',
        startVelocity: 3000
      });

      // scroll (if comment anchor)
      if (anchor) $timeout(function() {
        $anchorScroll(anchor);
      }, 1000);
    });
  };

  // Edit click
  $scope.edit = function() {
    UIUtils.loading.show();
    $state.go('app.registry_edit_record', {id: $scope.id});
  };

  $scope.delete = function() {
    $scope.hideActionsPopover();

    // translate
    var translations;
    $translate(['REGISTRY.VIEW.REMOVE_CONFIRMATION', 'REGISTRY.INFO.RECORD_REMOVED'])
    .then(function(res) {
      translations = res;
      return UIUtils.alert.confirm(res['REGISTRY.VIEW.REMOVE_CONFIRMATION']);
    })
    .then(function(confirm) {
      if (confirm) {
        esRegistry.record.remove($scope.id)
        .then(function () {
          if (csWallet.data.pages && csWallet.data.pages.count) {
            csWallet.data.pages.count--;
          }
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.wallet_pages', {refresh: true});
          UIUtils.toast.show(translations['REGISTRY.INFO.RECORD_REMOVED']);
        })
        .catch(UIUtils.onError('REGISTRY.ERROR.REMOVE_RECORD_FAILED'));
      }
    });
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/registry/view_popover_actions.html', {
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
    var title = $scope.formData.title;
    // Use shareBasePath (fix #530) or rootPath (fix #390)
    var url = (csConfig.shareBaseUrl || $rootScope.rootPath) + $state.href('app.view_page', {title: title, id: $scope.id});
    // Override default position, is small screen - fix #545
    if (UIUtils.screen.isSmall()) {
      event = angular.element(document.querySelector('#registry-share-anchor-'+$scope.id)) || event;
    }
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'REGISTRY.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        time: $scope.formData.time,
        postMessage: title
      }
    });
  };

}

function ESRegistryRecordEditController($scope, $timeout,  $state, $q, $ionicHistory, $focus, $translate, $controller,
                                        Device, UIUtils, ModalUtils, csWallet, esHttp, esRegistry) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESPositionEditCtrl', {$scope: $scope}));

  $scope.formData = {
    title: null,
    description: null,
    socials: [],
    geoPoint: null
  };

  $scope.loading = true;
  $scope.dirty = false;
  $scope.walletData = null;
  $scope.id = null;
  $scope.avatar = null;
  $scope.pictures = [];

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
          $scope.updateView({
            record: {
              type: state.stateParams.type
            }
          });
        }
      }
      // removeIf(device)
      $focus('registry-record-title');
      // endRemoveIf(device)
    });
  });

  $scope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
    if ($scope.dirty && !$scope.saving) {

      // stop the change state action
      event.preventDefault();

      if (!$scope.loading) {
        $scope.loading = true;
        return UIUtils.alert.confirm('CONFIRM.SAVE_BEFORE_LEAVE',
          'CONFIRM.SAVE_BEFORE_LEAVE_TITLE', {
            cancelText: 'COMMON.BTN_NO',
            okText: 'COMMON.BTN_YES_SAVE'
          })
          .then(function(confirmSave) {
            $scope.loading = false;
            if (confirmSave) {
              $scope.form.$submitted=true;
              return $scope.save(false/*silent*/, true/*haswait debounce*/)
                .then(function(saved){
                  if (saved) {
                    $scope.dirty = false;
                  }
                  return saved; // change state only if not error
                });
            }
            else {
              $scope.dirty = false;
              return true; // ok, change state
            }
          })
          .then(function(confirmGo) {
            if (confirmGo) {
              // continue to the order state
              $ionicHistory.nextViewOptions({
                historyRoot: true
              });
              $state.go(next.name, nextParams);
            }
          })
          .catch(function(err) {
            // Silent
          });
      }
    }
  });

  $scope.load = function(id) {
    $scope.loading = true;
    esRegistry.record.load(id, {
        raw: true
      })
      .then(function (data) {
        if (data && data.record) {
          $scope.updateView(data);
        }
        else {
          $scope.updateView({record: {}});
        }
      })
      .catch(function(err) {
        UIUtils.loading.hide(10);
        $scope.loading = false;
        UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED')(err);
      });
  };

  $scope.updateView = function(data) {
    $scope.formData = data.record || {};
    $scope.id= data.id;

    // avatar
    $scope.avatar = $scope.formData.avatar;
    if ($scope.avatar) {
      $scope.avatarStyle = $scope.avatar && {'background-image':'url("'+$scope.avatar.src+'")'};
      $scope.avatarClass = {};
    }
    else {
      $scope.avatarStyle = undefined;
      $scope.avatarClass = {};
      $scope.avatarClass['cion-page-' +  $scope.formData.type] = !$scope.avatar;
    }

    // pictures
    $scope.pictures = data.record && data.record.pictures || [];
    delete data.record.pictures; // remove, as already stored in $scope.pictures

    $scope.motion.show({
      selector: '.animate-ripple .item, .card-gallery',
      startVelocity: 3000
    });
    UIUtils.loading.hide();

    // Update loading - done with a delay, to avoid trigger onFormDataChanged()
    $timeout(function() {
      $scope.loading = false;
    }, 1000);
  };

  $scope.onFormDataChanged = function() {
    if ($scope.loading) return;
    $scope.dirty = true;
  };
  $scope.$watch('formData', $scope.onFormDataChanged, true);



  $scope.needCategory = function() {
    return $scope.formData.type && ($scope.formData.type=='company' || $scope.formData.type=='shop');
  };

  $scope.save = function(silent, hasWaitDebounce) {
    $scope.form.$submitted=true;
    if($scope.saving || // avoid multiple save
       !$scope.form.$valid ||
       (($scope.formData.type === 'shop' || $scope.formData.type === 'company') && (!$scope.formData.category || !$scope.formData.category.id))) {
      return $q.reject();
    }

    if (!hasWaitDebounce) {
      console.debug('[ES] [page] Waiting debounce end, before saving...');
      return $timeout(function() {
        return $scope.save(silent, true);
      }, 650);
    }

    $scope.saving = true;
    console.debug('[ES] [page] Saving record...');

    var showSuccessToast = function() {
      if (!silent) {
        // removeIf(no-device)
        UIUtils.loading.hide();
        // endRemoveIf(no-device)

        return $translate('REGISTRY.INFO.RECORD_SAVED')
          .then(function(message){
            UIUtils.toast.show(message);
          });
      }
    };

    var promise = $q.when();
    // removeIf(no-device)
    if (!silent) {
      promise = UIUtils.loading.show();
    }
    // endRemoveIf(no-device)

    return promise
      .then(function(){
        var json = $scope.formData;
        if (!$scope.needCategory()) {
          delete json.category;
        }
        json.time = esHttp.date.now();

        // geo point
        if (json.geoPoint && json.geoPoint.lat && json.geoPoint.lon) {
          json.geoPoint.lat =  parseFloat(json.geoPoint.lat);
          json.geoPoint.lon =  parseFloat(json.geoPoint.lon);
        }
        else{
          json.geoPoint = null;
        }

        // Social url must be unique in socials links - Fix #306:
        if (json.socials && json.socials.length) {
          json.socials = _.uniq(json.socials, false, function(social) {
            return social.url;
          });
        }

        // Pictures
        json.picturesCount = $scope.pictures.length;
        if (json.picturesCount > 0) {
          json.pictures = $scope.pictures.reduce(function (res, pic) {
            return res.concat({file: esHttp.image.toAttachment(pic)});
          }, []);
        }
        else {
          json.pictures = [];
        }

        // Avatar
        if ($scope.avatar && $scope.avatar.src) {
          return UIUtils.image.resizeSrc($scope.avatar.src, true) // resize to avatar
            .then(function(imageSrc) {
              json.avatar = esHttp.image.toAttachment({src: imageSrc});
              return json;
            });
        }
        else {
          // Workaround to allow content deletion, because of a bug in the ES attachment-mapper:
          // get error (in ES node) : MapperParsingException[No content is provided.] - AttachmentMapper.parse(AttachmentMapper.java:471
          json.avatar = {
            _content: '',
            _content_type: ''
          };
          return json;
        }
      })
      .then(function(json){
        // Create
        if (!$scope.id) {
          return esRegistry.record.add(json);
        }
        // Update
        return esRegistry.record.update(json, {id: $scope.id});
      })

      .then(function(id) {
        console.info("[ES] [page] Record successfully saved.");
        if (!$scope.id && csWallet.data.pages && csWallet.data.pages.count) {
          csWallet.data.pages.count++;
        }
        $scope.id = $scope.id || id;
        $scope.saving = false;
        $scope.dirty = false;

        showSuccessToast();

        $ionicHistory.clearCache($ionicHistory.currentView().stateId); // clear current view
        $ionicHistory.nextViewOptions({historyRoot: true});
        return $state.go('app.view_page', {id: $scope.id, refresh: true});
      })

      .catch(function(err) {
        $scope.saving = false;
        UIUtils.onError('REGISTRY.ERROR.SAVE_RECORD_FAILED')(err);
      });
  };

  $scope.openPicturePopup = function() {
    Device.camera.getPicture()
    .then(function(imageData) {
      $scope.pictures.push({src: "data:image/png;base64," + imageData});
    })
    .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
  };



  $scope.rotateAvatar = function(){
    if (!$scope.avatar || !$scope.avatar.src || $scope.rotating) return;

    $scope.rotating = true;

    return UIUtils.image.rotateSrc($scope.avatar.src)
      .then(function(imageData){
        $scope.avatar.src = imageData;
        $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
        $scope.dirty = true;
        $scope.rotating = false;
      })
      .catch(function(err) {
        console.error(err);
        $scope.rotating = false;
      });
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
  $scope.showAvatarModal = function() {
    if (Device.camera.enable) {
      return Device.camera.getPicture()
        .then(function(imageData) {
          if (!imageData) return;
          $scope.avatar = {src: "data:image/png;base64," + imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          $scope.dirty = true;
          $scope.avatarClass = {};
        })
        .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
    }
    else {
      return ModalUtils.show('plugins/es/templates/common/modal_edit_avatar.html','ESAvatarModalCtrl',
        {})
        .then(function(imageData) {
          if (!imageData) return;
          $scope.avatar = {src: imageData};
          $scope.avatarStyle={'background-image':'url("'+imageData+'")'};
          $scope.dirty = true;
          $scope.avatarClass = {};
        });
    }
  };

  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/registry/modal_record_type.html')
    .then(function(type){
      if (type) {
        $scope.formData.type = type;
        if (!$scope.avatar) {
          $scope.avatarClass['cion-page-' + type] = true;
        }
      }
    });
  };

  $scope.showCategoryModal = function(parameters) {
    // load categories
    esRegistry.category.all()
    .then(function(categories){
      // open modal
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
             {categories: categories}, {focusFirstInput: true});
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.formData.category = cat;
      }
    });
  };
}
