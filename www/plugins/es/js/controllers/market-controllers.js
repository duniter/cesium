angular.module('cesium.es.market.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q&category&location&reload&type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/lookup.html",
          controller: 'ESMarketLookupCtrl'
        }
      }
    })

    .state('app.market_lookup_lg', {
      url: "/market/lg?q&category&location&reload&type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/lookup_lg.html",
          controller: 'ESMarketLookupCtrl'
        }
      }
    })

    .state('app.market_view_record', {
      url: "/market/view/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/view_record.html",
          controller: 'ESMarketRecordViewCtrl'
        }
      }
    })

    .state('app.market_view_record_anchor', {
      url: "/market/view/:id/:title/:anchor",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/view_record.html",
          controller: 'ESMarketRecordViewCtrl'
        }
      }
    })

      .state('app.market_add_record', {
      cache: false,
      url: "/market/add/:type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/edit_record.html",
          controller: 'ESMarketRecordEditCtrl'
        }
      }
    })

    .state('app.market_edit_record', {
      cache: false,
      url: "/market/edit/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/edit_record.html",
          controller: 'ESMarketRecordEditCtrl'
        }
      }
    });
  })

 .controller('ESMarketLookupCtrl', ESMarketLookupController)

 .controller('ESMarketRecordViewCtrl', ESMarketRecordViewController)

 .controller('ESMarketRecordEditCtrl', ESMarketRecordEditController)

;

function ESMarketLookupController($scope, $state, $focus, $timeout, $filter, $q, csSettings,
                                  UIUtils, ModalUtils, esMarket, BMA) {
  'ngInject';

  var defaultSearchLimit = 10;

  $scope.search = {
    text: '',
    type: null,
    lastRecords: true,
    results: [],
    loading: true,
    category: null,
    location: null,
    options: null,
    loadingMore: false
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
        $focus('marketSearchText');
        // endRemoveIf(device)
        $scope.entered = true;
      };

      // Search by text
      if (state.stateParams && state.stateParams.q) { // Query parameter
        $scope.search.text=state.stateParams.q;
        hasOptions = runSearch = true;
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
        esMarket.category.get({id: state.stateParams.category})
        .then(function(cat) {
          $scope.search.category = cat;
          hasOptions = runSearch = true;
          finishEntered();
        });
      }
      else {
        finishEntered();
      }
    }
    $scope.showFab('fab-add-market-record');


  });

  $scope.setAdType = function(type) {
    if (type != $scope.search.type) {
      $scope.search.type = type;
      if ($scope.search.lastRecords) {
        $scope.doGetLastRecord();
      }
      else {
        $scope.doSearch();
      }
    }
  };

  $scope.doSearch = function(offset, size) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.search.loading = (offset === 0);
    $scope.search.lastRecords = false;
    if (!$scope.search.options) {
      $scope.search.options = false;
    }

    var request = {
      query: {},
      highlight: {
        fields : {
          title : {},
          description : {},
          "category.name" : {}
        }
      },
      from: offset,
      size: size,
      _source: esMarket.record.fields.commons
    };
    var text = $scope.search.text.trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      // pubkey : use a special 'term', because of 'non indexed' field
      if (BMA.regex.PUBKEY.test(text /*case sensitive*/)) {
        matches = [];
        filters.push({term : { issuer: text}});
      }
      else {
        text = text.toLowerCase();
        var matchFields = ["title", "description", "location"];
        matches.push({multi_match : { query: text,
          fields: matchFields,
          type: "phrase_prefix"
        }});
        matches.push({match: { title: text}});
        matches.push({match: { description: text}});
        matches.push({prefix: { location: text}});
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
      filters.push({match_phrase: { location: $scope.search.location}});
    }

    if (!matches.length && !filters.length) {
      $scope.doGetLastRecord();
      return;
    }

    if ($scope.search.type) {
      filters.push({term: {type: $scope.search.type}});
    }

    request.query = {};
    if (matches.length > 0) {
      request.query.bool = request.query.bool || {};
      request.query.bool.should =  matches;
    }
    if (filters.length > 0) {
      request.query.bool = request.query.bool || {};
      request.query.bool.filter =  filters;
    }

    return $scope.doRequest(request, offset, size);
  };

  $scope.doGetLastRecord = function(offset, size) {
    offset = offset || 0;
    size = size || defaultSearchLimit;
    if (size < defaultSearchLimit) size = defaultSearchLimit;

    $scope.search.lastRecords = true;

    var request = {
      sort: {
        "creationTime" : "desc"
      },
      from: offset,
      size: size,
      _source: esMarket.record.fields.commons
    };

    if ($scope.search.type) {
      request.query = {bool: {filter: {term: {type: $scope.search.type}}}};
    }

    return $scope.doRequest(request, offset, size);
  };

  $scope.showMore= function() {
    var offset = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    var searchFunction = ($scope.search.lastRecords) ?
      $scope.doGetLastRecord :
      $scope.doSearch;

    return searchFunction(offset)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      })
      .catch(function(err) {
        $scope.search.loadingMore = false;
      });
  };

  $scope.doRequest = function(request, offset, size) {
    $scope.search.loading = (offset === 0);

    var categories;
    var currentUD;

    return $q.all([
      esMarket.category.all()
        .then(function (res) {
          categories = res;
        }),
      // Get last UD
      BMA.blockchain.lastUd()
        .then(function (res) {
          currentUD = res;
        })
        .catch(function(err) {
          currentUD = 1;
          console.error(err);
        })
    ])
    .then(function() {
      return esMarket.record.search(request);
    })
    .then(function(res){
      if (!res.hits.hits.length) {
        $scope.search.results = (offset > 0) ? $scope.search.results : [];
        $scope.search.hasMore = false;
        $scope.search.loading = false;
        return;
      }
      var formatSlug = $filter('formatSlug');
      var records = res.hits.hits.reduce(function(res, hit) {
        // Filter on type (workaround if filter on term 'type' not working)
        if ($scope.search.type && $scope.search.type != hit._source.type) {
          return res;
        }
        var record = hit._source;
        record.id = hit._id;
        record.urlTitle = formatSlug(hit._source.title);
        if (record.category && record.category.id) {
          record.category = categories[record.category.id];
        }
        if (record.thumbnail) {
          record.thumbnail = UIUtils.image.fromAttachment(record.thumbnail);
        }
        if (record.price) {
          if (!csSettings.data.useRelative && (!record.unit || record.unit==='UD')) {
            record.price = record.price * currentUD;
          }
          else if (csSettings.data.useRelative && record.unit==='unit') {
            record.price = record.price / currentUD;
          }
        }
        if (hit.highlight) {
          if (hit.highlight.title) {
              record.title = hit.highlight.title[0];
          }
          if (hit.highlight.description) {
              record.description = hit.highlight.description[0];
          }
          if (hit.highlight.location) {
              record.location = hit.highlight.location[0];
          }
          if (record.category && hit.highlight["category.name"]) {
              record.category.name = hit.highlight["category.name"][0];
          }
        }
        return res.concat(record);
      }, []);

      // Replace results, or append if 'show more' clicked
      if (offset === 0) {
        $scope.search.results = records;
      }
      else {
        $scope.search.results = $scope.search.results.concat(records);
      }
      $scope.search.hasMore = $scope.search.results.length >= offset + size;
      $scope.search.loading = false;

      if (records.length > 0) {
        // Set Motion
        $timeout(function() {
          UIUtils.motion.ripple({
            startVelocity: 3000
          });
          // Set Ink
          UIUtils.ink({
            selector: '.item.ink'
          });
        }, 10);
      }
    })
    .catch(function(err) {
      $scope.search.loading = false;
      $scope.search.results = (offset > 0) ? $scope.search.results : [];
      $scope.search.hasMore = false;
      UIUtils.onError('MARKET.ERROR.LOOKUP_RECORDS_FAILED')(err);
    });
  };

  /* -- options -- */

  $scope.onToggleOptions = function() {
    if ($scope.search.entered) {
      $scope.doSearch();
    }
  };
  $scope.$watch('search.options', $scope.onToggleOptions, true);

  /* -- modals -- */

  $scope.showCategoryModal = function() {
    // load categories
    esMarket.category.all()
    .then(function(categories){
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
        {categories : categories},
        {focusFirstInput: true}
      );
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.search.category = cat;
        $scope.doSearch();
      }
    });
  };

  $scope.showNewRecordModal = function() {
    $scope.loadWallet()
      .then(function(walletData) {
        UIUtils.loading.hide();
        $scope.walletData = walletData;
        ModalUtils.show('plugins/es/templates/market/modal_record_type.html')
        .then(function(type){
          if (type) {
            $state.go('app.market_add_record', {type: type});
          }
        });
    });
  };
}

function ESMarketRecordViewController($scope, $anchorScroll, $ionicPopover, $state, $ionicHistory, $q,
                                      $timeout, $filter, $focus,
                                      csWallet, esMarket, UIUtils,  esHttp, esUser, BMA, csSettings) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.maxCommentSize = 10;
  $scope.loading = true;

  ESCommentsController.call(this, $scope, $timeout, $filter, $state, $focus, UIUtils, esHttp, esMarket);

  $scope.$on('$ionicView.enter', function (e, state) {
    if (state.stateParams && state.stateParams.id) { // Load by id
      if ($scope.loading) { // prevent reload if same id
        $scope.load(state.stateParams.id, state.stateParams.anchor);
      }
    }
    else {
      $state.go('app.market_lookup');
    }
  });

  $scope.load = function (id, anchor) {

    var categories;
    $q.all([
      esMarket.category.all()
        .then(function (result) {
          categories = result;
        }),
      // Get last UD
      BMA.blockchain.lastUd()
        .then(function (currentUD) {
          $scope.currentUD = currentUD;
        })
    ])
    .then(function () {
      return esMarket.record.getCommons({id: id});
    })
    .then(function (hit) {
      $scope.formData = hit._source;
      $scope.id = hit._id;
      if (hit._source.category && hit._source.category.id) {
        $scope.category = categories[hit._source.category.id];
      }
      if (hit._source.thumbnail) {
        $scope.thumbnail = UIUtils.image.fromAttachment(hit._source.thumbnail);
      }
      $scope.canEdit = $scope.formData && csWallet.isUserPubkey($scope.formData.issuer);
      return esUser.profile.fillAvatars([{pubkey: $scope.formData.issuer}])
        .then(function(idties) {
          return idties[0];
        });
    })
    .then(function (member) {
      $scope.issuer = member;
      $scope.refreshConvertedPrice();
      // Set Motion (only direct children, to exclude .lazy-load children)
      $timeout(function () {
        UIUtils.motion.fadeSlideIn({
          selector: '.list > .item',
          startVelocity: 3000
        });
      }, 10);
      UIUtils.loading.hide();
      $scope.loading = false;
    })
    .catch(function (err) {
      if (!$scope.secondTry) {
        $scope.secondTry = true;
        $q(function () {
          $scope.load(id); // loop once
        }, 100);
      }
      else {
        $scope.loading = false;
        UIUtils.loading.hide();
        $scope.member = null;
        if (err && err.ucode === 404) {
          UIUtils.toast.show('MARKET.ERROR.RECORD_NOT_EXISTS');
          $state.go(UIUtils.screen.isSmall() ? 'app.market_lookup' : 'app.market_lookup_lg');
        }
        else {
          UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED')(err);
        }
      }
    });

    // Continue loading other data
    $timeout(function() {
      $q.all([
        // Load pictures
        esMarket.record.picture.all({id: id})
          .then(function (hit) {
            if (hit._source.pictures) {
              $scope.pictures = hit._source.pictures.reduce(function (res, pic) {
                return res.concat(UIUtils.image.fromAttachment(pic.file));
              }, []);
            }
          }),

        // Load comments
        $scope.loadComments(id)
      ])
      .then(function () {
        // Set Motion
        $timeout(function() {
          UIUtils.motion.fadeSlideIn({
            selector: '.card-gallery, .card-comment, .lazy-load .item'
          });
          $anchorScroll(anchor); // scroll (if comment anchor)
        }, 10);
      })
      .catch(function () {
        $scope.pictures = [];
        $scope.comments = [];
      });
    }, 100);

  };

  $scope.refreshConvertedPrice = function() {
    if (!$scope.formData.price) {
      $scope.convertedPrice = null;
      return;
    }

    // Price in UD
    if (!$scope.formData.unit || $scope.formData.unit == 'UD') {
      if (!csSettings.data.useRelative) {
        $scope.convertedPrice = $scope.formData.price * $scope.currentUD;
      }
      else {
        $scope.convertedPrice = $scope.formData.price;
      }
    }
    // price in qte
    else {
      if (!csSettings.data.useRelative) {
        $scope.convertedPrice = $scope.formData.price;
      }
      else {
        $scope.convertedPrice =  $scope.formData.price / $scope.currentUD;
      }
    }
  };
  $scope.$watch('$root.settings.useRelative', $scope.refreshConvertedPrice, true);

  $scope.edit = function() {
    $state.go('app.market_edit_record', {id: $scope.id, title: $filter('formatSlug')($scope.formData.title)});
  };

  $scope.delete = function() {
    $scope.hideActionsPopover();

    UIUtils.alert.confirm('MARKET.VIEW.REMOVE_CONFIRMATION')
    .then(function(confirm) {
      if (confirm) {
        esMarket.record.remove($scope.id)
          .then(function () {
            $ionicHistory.nextViewOptions({
              historyRoot: true
            });
            $state.go('app.market_lookup');
            UIUtils.toast.show('MARKET.INFO.RECORD_REMOVED');
          })
          .catch(UIUtils.onError('MARKET.ERROR.REMOVE_RECORD_FAILED'));
      }
    });
  };

  /* -- modals & popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/market/view_popover_actions.html', {
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
    var url = $state.href('app.market_view_record', {title: title, id: $scope.id}, {absolute: true});
    UIUtils.popover.share(event, {
      bindings: {
        url: url,
        titleKey: 'MARKET.VIEW.POPOVER_SHARE_TITLE',
        titleValues: {title: title},
        time: $scope.formData.time,
        postMessage: title,
        postImage: $scope.pictures.length > 0 ? $scope.pictures[0] : null
      }
    });
  };
}

function ESMarketRecordEditController($scope, esMarket, UIUtils, $state, $ionicPopover,
  $timeout, ModalUtils, esHttp, $ionicHistory, $focus, csSettings, csCurrency) {
  'ngInject';

  $scope.walletData = {};
  $scope.formData = {
    price: null
  };
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.loading = true;

  $scope.setForm =  function(form) {
    $scope.form = form;
  };

  $scope.$on('$ionicView.enter', function(e, state) {
    // Load currencies list
    csCurrency.all()
    .then(function(currencies){
      if (currencies.length == 1) {
         $scope.currency = currencies[0].name;
      }
      // Load wallet
      return $scope.loadWallet();
    })
    .then(function(walletData) {
      $scope.useRelative = csSettings.data.useRelative;
      $scope.walletData = walletData;
      if (state.stateParams && state.stateParams.id) { // Load by id
        $scope.load(state.stateParams.id);
      }
      else {
        if (state.stateParams && state.stateParams.type) { // New record
          $scope.formData.type=state.stateParams.type;
        }
        $scope.loading = false;
        UIUtils.loading.hide();
        $timeout(function(){
          UIUtils.motion.ripple();
        }, 100);
      }
      $focus('market-record-title');
    });
  });

  $ionicPopover.fromTemplateUrl('plugins/es/templates/market/popover_unit.html', {
    scope: $scope
  }).then(function(popover) {
    $scope.unitPopover = popover;
  });

  $scope.$on('$destroy', function() {
    if (!!$scope.unitPopover) {
      $scope.unitPopover.remove();
    }
  });

  $scope.cancel = function() {
    $scope.closeModal();
  };

  $scope.load = function(id) {
    esMarket.category.all()
    .then(function(categories) {
      esMarket.record.get({id: id})
      .then(function (hit) {
        $scope.formData = hit._source;
        if (hit._source.category && hit._source.category.id) {
          $scope.category = categories[hit._source.category.id];
        }
        $scope.id= hit._id;
        if (hit._source.pictures) {
          $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
            return res.concat(UIUtils.image.fromAttachment(pic.file));
          }, []);
          delete $scope.formData.pictures; // duplicated with $scope.pictures
        }
        else {
          $scope.pictures = [];
        }
        if ($scope.formData.price) {
          $scope.useRelative = (!$scope.formData.unit || $scope.formData.unit == 'UD');
        }
        else {
          $scope.useRelative = csSettings.data.useRelative;
        }
        $scope.loading = false;
        UIUtils.loading.hide();
        $timeout(function(){
          UIUtils.motion.ripple({
            selector: '.animate-ripple .item, .card-gallery',
            startVelocity: 3000
          });
          // Set Ink
          UIUtils.ink();
        },100);
      })
      .catch(UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED'));
    })
    .catch(UIUtils.onError('MARKET.ERROR.LOAD_CATEGORY_FAILED'));
  };

  $scope.save = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid || !$scope.category.id) {
      return;
    }

    UIUtils.loading.show();
    var doFinishSave = function(formData) {
      if (!!formData.price && typeof formData.price == "string") {
        formData.price = parseFloat(formData.price.replace(new RegExp('[.,]'), '.')); // fix #124
      }
      if (!!formData.price) {
        formData.unit = formData.unit || ($scope.useRelative ? 'UD' : 'unit');
      }
      else {
        delete formData.unit;
      }
      if (!formData.currency) {
        formData.currency = $scope.currency;
      }
      if (!$scope.id) { // Create
        formData.creationTime = esHttp.date.now();
        formData.time = formData.creationTime;
        esMarket.record.add(formData)
        .then(function(id) {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.market_view_record', {id: id});
          UIUtils.loading.hide(10);
        })
        .catch(UIUtils.onError('MARKET.ERROR.FAILED_SAVE_RECORD'));
      }
      else { // Update
        formData.time = esHttp.date.now();
        esMarket.record.update(formData, {id: $scope.id})
        .then(function() {
          $ionicHistory.clearCache() // force reloading of the back view
          .then(function(){
            $ionicHistory.goBack();
            UIUtils.loading.hide(10);
          });
        })
        .catch(UIUtils.onError('MARKET.ERROR.FAILED_UPDATE_RECORD'));
      }
    };

    $scope.formData.picturesCount = $scope.pictures.length;
    if ($scope.formData.picturesCount > 0) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({file: UIUtils.image.toAttachment(pic)});
      }, []);
      UIUtils.image.resizeSrc($scope.pictures[0].src, true) // resize thumbnail
      .then(function(imageSrc) {
        $scope.formData.thumbnail = UIUtils.image.toAttachment({src: imageSrc});

        doFinishSave($scope.formData);
      });
    }
    else {
      delete $scope.formData.thumbnail;
      delete $scope.formData.pictures;
      doFinishSave($scope.formData);
    }
  };

  $scope.setUseRelative = function(useRelative) {
    $scope.formData.unit = useRelative ? 'UD' : 'unit';
    $scope.useRelative = useRelative;
    $scope.unitPopover.hide();
  };

  $scope.openCurrencyLookup = function() {
    alert('Not implemented yet. Please submit an issue if occur again.');
  };

  $scope.cancel = function() {
    $ionicHistory.goBack();
  };

  /* -- modals -- */
  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/market/modal_record_type.html')
    .then(function(type){
      if (type) {
        $scope.formData.type = type;
      }
    });
  };

  $scope.showCategoryModal = function() {
    // load categories
    esMarket.category.all()
    .then(function(categories){
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
        {categories : categories},
        {focusFirstInput: true}
      );
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.category = cat;
        $scope.formData.category = cat;
      }
    });
  };
}
