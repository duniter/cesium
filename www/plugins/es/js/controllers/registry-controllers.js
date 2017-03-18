angular.module('cesium.es.registry.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.registry_lookup', {
      url: "/registry?q&category&location&type&reload",
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
      url: "/registry/lg?q&category&location&type&reload",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup_lg.html",
          controller: 'ESRegistryLookupCtrl'
        }
      }
    })

    .state('app.registry_view_record', {
      url: "/registry/view/:id/:title?refresh",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'ESRegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_view_record_anchor', {
      url: "/registry/view/:id/:title/:anchor",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'ESRegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_add_record', {
      cache: false,
      url: "/registry/add/:type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      }
    })

    .state('app.registry_edit_record', {
      cache: false,
      url: "/registry/edit/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      }
    })
    ;
  })

 .controller('ESRegistryLookupCtrl', ESRegistryLookupController)

 .controller('ESRegistryRecordViewCtrl', ESRegistryRecordViewController)

 .controller('ESRegistryRecordEditCtrl', ESRegistryRecordEditController)

;

function ESRegistryLookupController($scope, $state, $focus, $timeout, esRegistry, UIUtils, ModalUtils, $filter, BMA) {
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
    options: null
  };

  $scope.$on('$ionicView.enter', function(e, state) {
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
        $focus('registrySearchText');
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
        matches = [];
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

  $scope.showNewRecordModal = function() {
    $scope.loadWallet({minData: true})
      .then(function(walletData) {
        UIUtils.loading.hide();
        $scope.walletData = walletData;
        ModalUtils.show('plugins/es/templates/registry/modal_record_type.html')
        .then(function(type){
          if (type) {
            $state.go('app.registry_add_record', {type: type});
          }
        });
    });
  };

 // TODO: remove auto add account when done
 /* $timeout(function() {
    $scope.search.text='lavenier';
    $scope.doSearch();
  }, 400);
  */
}

function ESRegistryRecordViewController($scope, $state, $q, $timeout, $ionicPopover, $ionicHistory, $translate,
                                        $anchorScroll,
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
    esRegistry.record.load(id)
      .then(function (data) {
        $scope.id= data.id;
        $scope.formData = data.record;
        $scope.canEdit = csWallet.isUserPubkey($scope.formData.issuer);
        $scope.issuer = data.issuer;
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
      });

    // Continue loading other data
    $timeout(function() {
      // Load pictures
      esRegistry.record.picture.all({id: id})
        .then(function(hit) {
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat(esHttp.image.fromAttachment(pic.file));
            }, []);
          }
          // Set Motion
          $timeout(function(){
            UIUtils.motion.fadeSlideIn({
              selector: '.lazy-load .item.card-gallery, .lazy-load .item',
              startVelocity: 3000
            });
          }, 200);
        })
        .catch(function() {
          $scope.pictures = [];
        });

      // Load other data (from child controller)
      $scope.$broadcast('$recordView.load', id, esRegistry.record.comment);

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
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.registry_lookup');
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
    var url = $rootScope.rootPath + $state.href('app.registry_view_record', {title: title, id: $scope.id});
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

function ESRegistryRecordEditController($scope, esRegistry, UIUtils, $state, $q, Device,
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
        UIUtils.motion.ripple();
      }
      // removeIf(device)
      $focus('registry-record-title');
      // endRemoveIf(device)
    });
  });

  $scope.load = function(id) {
    esRegistry.record.load(id, {
        fetchPictures: true
      })
      .then(function (data) {
        $scope.formData = data.record;
        $scope.id= data.id;

        $scope.pictures = data.record.pictures || [];
        delete data.record.pictures; // remove, as already stored in $scope.pictures

        $scope.loading = false;
        UIUtils.loading.hide();

        $timeout(function(){
          UIUtils.motion.ripple({
            selector: '.animate-ripple .item, .card-gallery',
            startVelocity: 3000
          });
          // Set Ink
          UIUtils.ink();
        }, 100);
      })
      .catch(UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED'));
  };

  $scope.needCategory = function() {
    return $scope.formData.type && ($scope.formData.type=='company' || $scope.formData.type=='shop');
  };

  $scope.save = function() {
    $scope.form.$submitted=true;
    if($scope.saving || // avoid multiple save
       !$scope.form.$valid ||
       (!$scope.formData.category.id &&
        ($scope.formData.type === 'shop' || $scope.formData.type === 'company'))) {
      return;
    }
    $scope.saving = true;
    return UIUtils.loading.show()

      .then(function(){
        var json = $scope.formData;
        if (!$scope.needCategory()) {
          delete json.category;
        }
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
          return esRegistry.record.add(json);
        }
        // Update
        return esRegistry.record.update(json, {id: $scope.id});
      })

      .then(function(id) {
        $scope.id = $scope.id || id;
        $scope.saving = false;
        $ionicHistory.clearCache($ionicHistory.currentView().stateId); // clear current view
        $ionicHistory.nextViewOptions({historyRoot: true});
        return $state.go('app.registry_view_record', {id: $scope.id, refresh: true});
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
    ModalUtils.show('plugins/es/templates/registry/modal_record_type.html')
    .then(function(type){
      if (type) {
        $scope.formData.type = type;
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
