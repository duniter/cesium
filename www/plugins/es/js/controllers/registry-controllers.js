angular.module('cesium.es.registry.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.wot_lookup.tab_registry', {
      url: "/page?q&type&hash&category&location&issuer&reload&lat&lon&d&last",
      views: {
        'tab_registry': {
          templateUrl: "plugins/es/templates/registry/tabs/tab_registry.html",
          controller: 'ESRegistryLookupCtrl'
        }
      },
      data: {
        large: 'app.registry_lookup_lg',
        silentLocationChange: true
      }
    })

    .state('app.registry_lookup_lg', {
      url: "/wot/page/lg?q&type&hash&category&location&issuer&reload&lat&lon&d&last",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup_lg.html",
          controller: 'ESRegistryLookupCtrl'
        }
      },
      data: {
        silentLocationChange: true
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

function ESRegistryLookupController($scope, $focus, $timeout, $filter, $controller, $location, $translate, $ionicPopover,
                                    Device, UIUtils, ModalUtils, BMA, csSettings, csWallet, esModals, esRegistry, esHttp) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESLookupPositionCtrl', {$scope: $scope}));

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    results: [],
    loading: true,
    lastRecords: true,
    type: null,
    category: null,
    location: null,
    advanced: null,
    issuer: null,
    geoDistance: !isNaN(csSettings.data.plugins.es.geoDistance) ? csSettings.data.plugins.es.geoDistance : 20
  };
  $scope.searchTextId = 'registrySearchText';
  $scope.enableFilter = true;
  $scope.smallscreen = angular.isDefined($scope.smallscreen) ? $scope.smallscreen : UIUtils.screen.isSmall();

  $scope.options = angular.merge($scope.options||{}, {
    location: {
      show: true,
      help: 'REGISTRY.SEARCH.LOCATION_HELP'
    }
  });

  $scope.enter = function(e, state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {

      // Resolve distance unit
      if (!$scope.geoUnit) {
        return $translate('LOCATION.DISTANCE_UNIT')
          .then(function(unit) {
            $scope.geoUnit = unit;
            return $scope.enter(e, state); // Loop
          });
      }

      var finishEntered = function() {
        // removeIf(device)
        // Focus on search text (only if NOT device, to avoid keyboard opening)
        if ($scope.searchTextId) {
          $focus($scope.searchTextId);
        }
        // endRemoveIf(device)

        $scope.entered = true;

        $scope.doSearch();
      };

      // Search by text
      if (state.stateParams && state.stateParams.q && (typeof state.stateParams.q == 'string')) {
        $scope.search.text=state.stateParams.q;
      }

      if (state.stateParams && state.stateParams.hash) { // hash tag parameter
        $scope.search.text = '#' + state.stateParams.hash;
      }

      // Search on location
      if (state.stateParams && state.stateParams.location) {
        $scope.search.location = state.stateParams.location;
        if (state.stateParams.lat && state.stateParams.lon) {
          $scope.search.geoPoint = {
            lat: parseFloat(state.stateParams.lat),
            lon: parseFloat(state.stateParams.lon)
          };
        }
        if (state.stateParams.d) {
          $scope.search.geoDistance = state.stateParams.d;
        }
      }
      else {
        var defaultSearch = csSettings.data.plugins.es.registry && csSettings.data.plugins.es.registry.defaultSearch;
        // Apply defaults from settings
        if (defaultSearch) {
          if (defaultSearch.location){
            angular.merge($scope.search, csSettings.data.plugins.es.registry.defaultSearch);
          }
          else {
            defaultSearch = undefined; // invalid
          }
        }
        // First time calling this view: apply profile location (if loaded)
        if (!defaultSearch && csWallet.isLogin() && csWallet.data.profile) {
          if (!csWallet.isDataLoaded()) {
            UIUtils.loading.show();
            return csWallet.loadData()
              .then(function() {
                UIUtils.loading.hide();
                return $scope.enter(e,state); // loop
              });
          }
          $scope.search.geoPoint = csWallet.data.profile.geoPoint;
          $scope.search.location = csWallet.data.profile.city||(csWallet.data.profile.geoPoint ? 'profile position' : undefined);
        }
      }

      // Search on type
      if (state.stateParams && (state.stateParams.type || state.stateParams.last)) {
        if (state.stateParams.last || state.stateParams.type == 'last') {
          $scope.search.lastRecords = true;
          $scope.search.type = undefined;
        }
        else {
          $scope.search.type = state.stateParams.type;
        }
      }
      else {
        $scope.search.lastRecords = false;
      }

      // Search on issuer
      if (state.stateParams && state.stateParams.issuer) {
        $scope.search.issuer = state.stateParams.issuer;
      }

      // Search on category
      if (state.stateParams && state.stateParams.category) {
        esRegistry.category.get({id: state.stateParams.category})
        .then(function(cat) {
          $scope.search.category = cat;
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
    // WARN: do not set by reference
    // because it can be overrided by sub controller
    return $scope.enter(e, state);
  });

  // Store some search options as settings defaults
  $scope.leave = function() {
    var dirty = false;

    csSettings.data.plugins.es.registry = csSettings.data.plugins.es.registry || {};
    csSettings.data.plugins.es.registry.defaultSearch = csSettings.data.plugins.es.registry.defaultSearch || {};

    // Check if location changed
    var location = $scope.search.location && $scope.search.location.trim();
    var oldLocation = csSettings.data.plugins.es.registry.defaultSearch.location;
    if (!oldLocation || (oldLocation !== location)) {
      csSettings.data.plugins.es.registry.defaultSearch = {
        location: location,
        geoPoint: location && $scope.search.geoPoint ? angular.copy($scope.search.geoPoint) : undefined
      };
      dirty = true;
    }

    // Check if distance changed
    var odlDistance = csSettings.data.plugins.es.geoDistance;
    if (!odlDistance || odlDistance !== $scope.search.geoDistance) {
      csSettings.data.plugins.es.geoDistance = $scope.search.geoDistance;
      dirty = true;
    }

    // execute with a delay, for better UI perf
    if (dirty) {
      $timeout(function() {
        csSettings.store();
      });
    }
  };
  $scope.$on('$ionicView.leave', function() {
    // WARN: do not set by reference
    // because it can be overrided by sub controller
    return $scope.leave();
  });

  $scope.onGeoPointChanged = function() {
    if ($scope.search.loading) return;

    if ($scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoPoint.lon && !$scope.search.geoPoint.exact) {
      $scope.doSearch();
      $scope.updateLocationHref();
    }
  };
  $scope.$watch('search.geoPoint', $scope.onGeoPointChanged, true);

  $scope.resolveLocationPosition = function() {
    if ($scope.search.loadingPosition) return;

    $scope.search.loadingPosition = true;
    return $scope.searchPosition($scope.search.location)
      .then(function(res) {
        if (!res) {
          $scope.search.loading = false;
          $scope.search.results = undefined;
          $scope.search.total = 0;
          $scope.search.loadingPosition = false;
          $scope.search.geoPoint = undefined;
          throw 'CANCELLED';
        }
        $scope.search.geoPoint = res;
        if (res.shortName && !res.exact) {
          $scope.search.location = res.shortName;
        }
        $scope.search.loadingPosition = false;
      });
  };

  $scope.doGetLastRecords = function(from) {
    $scope.hidePopovers();

    $scope.search.text = undefined;
    return $scope.doSearch(from);
  };

  $scope.doSearchText = function() {
    $scope.doSearch();

    // removeIf(no-device)
    Device.keyboard.close();
    // endRemoveIf(no-device)
  };

  $scope.doSearch = function(from) {
    $scope.search.loading = !from;

    // Resolve location position
    if ($scope.search.location && $scope.search.location.length >= 3 && !$scope.search.geoPoint) {
      return $scope.resolveLocationPosition()
        .then(function() {
          return $scope.doSearch(from); // Loop
        });
    }

    var text = $scope.search.text && $scope.search.text.trim() || '';
    $scope.search.lastRecords = !text || !text.length;
    var matches = [];
    var filters = [];
    if (text && text.length) {
      // pubkey : use a special 'term', because of 'non indexed' field
      if (BMA.regexp.PUBKEY.test(text /*case sensitive*/)) {
        filters.push({term : { pubkey: text}});
      }
      else {
        text = text.toLowerCase();
        var tags = text ? esHttp.util.parseTags(text) : undefined;
        var matchFields = ["title", "description", "city", "address"];
        matches.push({multi_match : { query: text,
          fields: matchFields,
          type: "phrase_prefix"
        }});
        matches.push({match : { title: {query: text, boost: 2}}});
        matches.push({prefix: {title: text}});
        matches.push({match : { description: text}});
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
        if (tags && tags.length) {
          filters.push({terms: {tags: tags}});
        }
      }
    }
    // issuer: use only on filter
    else if ($scope.search.issuer) {
      filters.push({term : { issuer: $scope.search.issuer}});
    }
    if ($scope.search.type) {
      filters.push({term: { type: $scope.search.type}});
    }
    if ($scope.search.category) {
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

    var location = $scope.search.location && $scope.search.location.trim().toLowerCase();
    if ($scope.search.geoPoint && $scope.search.geoPoint.lat && $scope.search.geoPoint.lon) {

      // match location OR geo distance
      if (location && location.length) {
        var locationCity = location.split(',')[0];
        filters.push({
          or : [
            // No position defined
            {
              and: [
                {not: {exists: { field : "geoPoint" }}},
                {match_phrase: { city: locationCity }}
              ]
            },
            // Has position
            {geo_distance: {
              distance: $scope.search.geoDistance + $scope.geoUnit,
              geoPoint: {
                lat: $scope.search.geoPoint.lat,
                lon: $scope.search.geoPoint.lon
              }
            }}
          ]
        });
      }

      else {
        filters.push(
          {geo_distance: {
            distance: $scope.search.geoDistance + $scope.geoUnit,
            geoPoint: {
              lat: $scope.search.geoPoint.lat,
              lon: $scope.search.geoPoint.lon
            }
          }});
      }
    }

    var request = {
      highlight: {fields : {title : {}, description: {}, tags: {}}},
      from: from
    };
    if (matches.length > 0) {
      request.query = request.query || {bool: {}};
      request.query.bool.should =  matches;
      // Exclude result with score=0
      request.query.bool.minimum_should_match = 1;
    }
    if (filters.length > 0) {
      request.query = request.query || {bool: {}};
      request.query.bool.filter =  filters;
    }
    if ($scope.search.lastRecords) {
      request.sort = {creationTime : "desc"};
    }

    // Update href location
    $scope.updateLocationHref();

    // Execute the request
    return $scope.doRequest(request);
  };

  $scope.doRequest = function(options) {
    options = options || {};
    options.from = options.from || 0;
    options.size = options.size || defaultSearchLimit;
    if (options.size < defaultSearchLimit) options.size = defaultSearchLimit;
    $scope.search.loading = (options.from === 0);

    var requestId = ($scope.requestId && $scope.requestId + 1) || 1;
    $scope.requestId = requestId;

    return esRegistry.record.search(options)
      .then(function(res) {
        if ($scope.requestId != requestId) return; // Skip apply if not same request:

        if (!res || !res.hits || !res.hits.length) {
          $scope.search.results = (options.from > 0) ? $scope.search.results : [];
          $scope.search.total = (options.from > 0) ? $scope.search.total : 0;
          $scope.search.loading = false;
          $scope.search.hasMore = false;
          return;
        }
        var formatSlug = $filter('formatSlug');
        _.forEach(res.hits, function(record) {
          // Compute title for url
          record.urlTitle = formatSlug(record.title);
        });

        // Replace results, or append if 'show more' clicked
        if (!options.from) {
          $scope.search.results = res.hits;
          $scope.search.total = res.total;
        }
        else {
          $scope.search.results = $scope.search.results.concat(res.hits);
        }
        $scope.search.hasMore = $scope.search.results.length < res.total;
        $scope.search.loading = false;

        $scope.motion.show({selector: '.list .item', ink: true});
      })
      .catch(function(err) {
        $scope.search.loading = false;
        $scope.search.results = (options.from > 0) ? $scope.search.results : [];
        $scope.search.total = (options.from > 0) ? $scope.search.total : 0;
        $scope.search.hasMore = false;
        UIUtils.onError('REGISTRY.ERROR.LOOKUP_RECORDS_FAILED')(err);
      });
  };

  $scope.showMore= function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    var searchFunction = ($scope.search.lastRecords) ?
      $scope.doGetLastRecords :
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

  $scope.removeType = function() {
    $scope.search.type = null;
    $scope.doSearch();
    $scope.updateLocationHref();
  };

  $scope.removeCategory = function() {
    $scope.search.category = null;
    $scope.category = null;
    $scope.doSearch();
    $scope.updateLocationHref();
  };

  $scope.removeLocation = function() {
    $scope.search.location = null;
    $scope.search.geoPoint = null;
    $scope.doSearch();
    $scope.updateLocationHref();
  };

  // Update location href
  $scope.updateLocationHref = function(from) {
    // removeIf(device)
    // Skip when "show more"
    if (from) return;

    $timeout(function() {
      var text = $scope.search.text && $scope.search.text.trim();
      var location = $scope.search.location && $scope.search.location.trim();
      var stateParams = {
        location: location && location.length ? location : undefined,
        category: $scope.search.category ? $scope.search.category.id : undefined,
        last: $scope.search.lastRecords ? true : undefined,
        type: $scope.search.type ? $scope.search.type : undefined,
        lat: $scope.search.geoPoint && $scope.search.geoPoint.lat || undefined,
        lon: $scope.search.geoPoint && $scope.search.geoPoint.lon || undefined,
        d: $scope.search.geoPoint && $scope.search.geoDistance || undefined
      };
      if (text && text.match(/^#\w+$/)) {
        stateParams.hash = text.substr(1);
      }
      else if (text && text.length){
        stateParams.q = text;
      }

      $location.search(stateParams).replace();
    });
    // endRemoveIf(device)
  };


  $scope.onToggleAdvanced = function() {
    if ($scope.search.entered && !$scope.search.lastRecords) {
      $scope.doSearch();
      $scope.updateLocationHref();
    }
  };
  $scope.$watch('search.advanced', $scope.onToggleAdvanced, true);

  $scope.toggleAdvanced = function() {
    $scope.search.advanced = !$scope.search.advanced;
    $timeout($scope.hidePopovers, 200);
  };

  /* -- modals -- */

  $scope.showRecordTypeModal = function(event) {
    $scope.hidePopovers();

    $timeout(function() {
      if (event.isDefaultPrevented()) return;

      ModalUtils.show('plugins/es/templates/registry/modal_record_type.html')
        .then(function(type){
          if (type) {
            $scope.search.type = type;
            $scope.doSearch();
            $scope.updateLocationHref();
          }
        });
    }, 350); // use timeout to allow event to be prevented in removeType()
  };

  $scope.showCategoryModal = function(event) {
    $timeout(function() {
      if (event.isDefaultPrevented()) return;

      // load categories
      esRegistry.category.all()
        .then(function (categories) {
          // open modal
          return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
            {categories: categories}, {focusFirstInput: true});
        })
        .then(function (cat) {
          if (cat && cat.parent) {
            $scope.search.category = cat;
            $scope.doSearch();
            $scope.updateLocationHref();
          }
        });
    }, 350); // use timeout to allow event to be prevented in removeCategory()
  };

  $scope.showNewPageModal = function() {
    $scope.hidePopovers();
    return esModals.showNewPage();
  };

  /* -- popovers -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/registry/lookup_popover_actions.html', {
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

  $scope.showFiltersPopover = function(event) {
    if (!$scope.filtersPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/registry/lookup_popover_filters.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.filtersPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.filtersPopover.remove();
        });
        $scope.filtersPopover.show(event);
      });
    }
    else {
      $scope.filtersPopover.show(event);
    }
  };

  $scope.hideFiltersPopover = function() {
    if ($scope.filtersPopover) {
      $scope.filtersPopover.hide();
    }
  };

  $scope.hidePopovers = function() {
    $scope.hideActionsPopover();
    $scope.hideFiltersPopover();
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
          $scope.search.advanced = true;
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
    $scope.search.advanced = true;
    return $scope.doSearch();
  };

}


function ESRegistryRecordViewController($scope, $rootScope, $state, $q, $timeout, $ionicPopover, $ionicHistory, $translate,
                                        $anchorScroll, csConfig, csWallet, esRegistry, UIUtils, esHttp) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.loading = true;
  $scope.motion = UIUtils.motion.fadeSlideIn;

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

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
    id = id || $scope.id;
    $scope.loading = true;

    return $q.all([
      esRegistry.record.load(id)
        .then(function (data) {
          $scope.id= data.id;
          $scope.formData = data.record;
          //console.debug('Loading record', $scope.formData);
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
      if (imageData) {
        $scope.pictures.push({src: "data:image/png;base64," + imageData});
      }
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
        $scope.doSearch();
        $scope.updateLocationHref();
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
        $scope.doSearch();
        $scope.updateLocationHref();
      }
    });
  };
}
