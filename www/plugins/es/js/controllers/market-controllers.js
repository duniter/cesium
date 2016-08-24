angular.module('cesium.es.market.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q&category&location",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/lookup.html",
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

function ESMarketLookupController($scope, $rootScope, esMarket, $state, $focus, $timeout, UIUtils, ModalUtils, $filter,
  $location, BMA) {
  'ngInject';

  $scope.search = {
    text: '',
    lastRecords: true,
    results: [],
    looking: true,
    category: null,
    location: null,
    options: null
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
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
        $scope.entered = true;
      };

      // Search by text
      if ($state.stateParams && $state.stateParams.q) { // Query parameter
        $scope.search.text=$state.stateParams.q;
        hasOptions = runSearch = true;
      }

      // Search on location
      if ($state.stateParams && $state.stateParams.location) {
        $scope.search.location = $state.stateParams.location;
        hasOptions = runSearch = true;
      }

      // Search on category
      if ($state.stateParams && $state.stateParams.category) {
        esMarket.category.get({id: $state.stateParams.category})
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

    // removeIf(device)
    // Focus on search text (only if NOT device, to avoid keyboard opening)
    $focus('marketSearchText');
    // removeIf(device)
  });


  $scope.doSearch = function() {
    $scope.search.looking = true;
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
      from: 0,
      size: 20,
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

    if (matches.length === 0 && filters.length === 0) {
      $scope.doGetLastRecord();
      return;
    }
    request.query.bool = {};
    if (matches.length > 0) {
      request.query.bool.should =  matches;
    }
    if (filters.length > 0) {
      request.query.bool.filter =  filters;
    }

    $scope.doRequest(request);
  };

  $scope.onToggleOptions = function() {
    if ($scope.search.entered) {
      $scope.doSearch();
    }
  };
  $scope.$watch('search.options', $scope.onToggleOptions, true);

  $scope.doGetLastRecord = function() {
    $scope.search.looking = true;
    $scope.search.lastRecords = true;

    var request = {
      sort: {
        "time" : "desc"
      },
      from: 0,
      size: 20,
      _source: esMarket.record.fields.commons
    };

    $scope.doRequest(request);
  };

  $scope.doRequest = function(request) {
    $scope.search.looking = true;

    esMarket.category.all()
      .then(function(categories) {
        return esMarket.record.search(request)
          .then(function(res){
            if (res.hits.total === 0) {
              $scope.search.results = [];
            }
            else {
              var formatSlug = $filter('formatSlug');
              var records = res.hits.hits.reduce(function(result, hit) {
                  var record = hit._source;
                  record.id = hit._id;
                  record.type = hit._type;
                  record.urlTitle = formatSlug(hit._source.title);
                  if (record.category && record.category.id) {
                    record.category = categories[record.category.id];
                  }
                  if (record.thumbnail) {
                    record.thumbnail = UIUtils.image.fromAttachment(record.thumbnail);
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
                  return result.concat(record);
                }, []);
              $scope.search.results = records;

              if (records.length > 0) {
                // Set Motion
                $timeout(function() {
                  UIUtils.motion.ripple({
                    startVelocity: 3000
                  });
                  // Set Ink
                  UIUtils.ink();
                }, 10);
              }
            }

            $scope.search.looking = false;
          })
          .catch(function(err) {
            $scope.search.looking = false;
            $scope.search.results = [];
          });
      })
      .catch(function(err) {
        $scope.search.looking = false;
        $scope.search.results = [];
      });
  };

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

function ESMarketRecordViewController($scope, $rootScope, Wallet, esMarket, UIUtils, $state, $q, $timeout, BMA, esHttp, $filter, csSettings) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.maxCommentSize = 10;
  $scope.loading = true;

  ESCommentsController.call(this, $scope, Wallet, UIUtils, $q, $timeout, esHttp, esMarket);

  $scope.$on('$ionicView.enter', function (e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
      if ($scope.loading) { // prevent reload if same id
        $scope.load($state.stateParams.id);
      }
    }
    else {
      $state.go('app.market_lookup');
    }
  });

  $scope.load = function (id) {

    var categories;
    $q.all([
      esMarket.category.all()
        .then(function (result) {
          categories = result;
        }),
      // Get last UD
      BMA.blockchain.lastUd()
        .then(function (currentUD) {
          $rootScope.walletData.currentUD = currentUD;
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
      $scope.canEdit = $scope.formData && Wallet.isUserPubkey($scope.formData.issuer);

      return BMA.wot.member.get($scope.formData.issuer);
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
        UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED')(err);
      }
    });

  // Continue loading other data
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
      $timeout(function () {
        UIUtils.motion.fadeSlideIn({
          selector: '.card-gallery, .card-comment, .lazy-load .item'
        });
      }, 10);
    })
    .catch(function (err) {
      $scope.pictures = [];
      $scope.comments = [];
    });
  }

  $scope.refreshConvertedPrice = function() {
    if (!$scope.formData.price) {
      $scope.convertedPrice = null;
      return;
    }

    // Price in UD
    if (!$scope.formData.unit || $scope.formData.unit == 'UD') {
      if (!csSettings.data.useRelative) {
        $scope.convertedPrice = $scope.formData.price * $rootScope.walletData.currentUD;
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
        $scope.convertedPrice =  $scope.formData.price / $rootScope.walletData.currentUD;
      }
    }
  };
  $scope.$watch('$root.settings.useRelative', $scope.refreshConvertedPrice, true);

  $scope.edit = function() {
    $state.go('app.market_edit_record', {id: $scope.id, title: $filter('formatSlug')($scope.formData.title)});
  };
}

function ESMarketRecordEditController($scope, esMarket, UIUtils, $state,
  $timeout, ModalUtils, esHttp, $ionicHistory, $focus, csSettings, csCurrency) {
  'ngInject';

  $scope.walletData = {};
  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.loading = true;

  $scope.setForm =  function(form) {
    $scope.form = form;
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
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
      if ($state.stateParams && $state.stateParams.id) { // Load by id
        $scope.load($state.stateParams.id);
      }
      else {
        if ($state.stateParams && $state.stateParams.type) { // New record
          $scope.formData.type=$state.stateParams.type;
        }
        $scope.loading = false;
        UIUtils.loading.hide();
        UIUtils.motion.ripple();
      }
      $focus('market-record-title');
    });
  });

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
      if (!$scope.id) { // Create
        formData.time = esHttp.date.now();
        esMarket.record.add(formData)
        .then(function(id) {
          $ionicHistory.nextViewOptions({
            historyRoot: true
          });
          $state.go('app.market_view_record', {id: id});
          UIUtils.loading.hide(10);
        })
        .catch(UIUtils.onError('Could not save esMarket'));
      }
      else { // Update
        if (formData.time) {
          formData.time = esHttp.date.now();
        }
        esMarket.record.update(formData, {id: $scope.id})
        .then(function() {
          $ionicHistory.clearCache() // force reloading of the back view
          .then(function(){
            $ionicHistory.goBack();
            UIUtils.loading.hide(10);
          });
        })
        .catch(UIUtils.onError('Could not update esMarket'));
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
    //$scope.unitPopover.hide();
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
