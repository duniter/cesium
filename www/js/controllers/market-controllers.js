angular.module('cesium.market.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q",
      views: {
        'menuContent': {
          templateUrl: "templates/market/lookup.html",
          controller: 'MarketLookupCtrl'
        }
      }
    })

   .state('app.market_view_record', {
      url: "/market/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "templates/market/view_record.html",
          controller: 'MarketRecordViewCtrl'
        }
      }
    })

    .state('app.market_add_record', {
      url: "/market/add",
      views: {
        'menuContent': {
          templateUrl: "templates/market/edit_record.html",
          controller: 'MarketRecordEditCtrl'
        }
      }
    })

    .state('app.market_edit_record', {
      url: "/market/:id/edit",
      views: {
        'menuContent': {
          templateUrl: "templates/market/edit_record.html",
          controller: 'MarketRecordEditCtrl'
        }
      }
    });
  })

 .controller('MarketLookupCtrl', MarketLookupController)

 .controller('MarketRecordViewCtrl', MarketRecordViewController)

 .controller('MarketRecordEditCtrl', MarketRecordEditController)

;

function MarketCategoryModalController($scope, Market, $state, $ionicModal) {

  $scope.categoryModal = null;
  $scope.categories = {
      all: null,
      search: {
        text: '',
        results: {},
        options: false
      }
  };

  // category lookup modal
  $ionicModal.fromTemplateUrl('templates/market/modal_category.html', {
      scope: $scope,
      focusFirstInput: true
  }).then(function(modal) {
    $scope.categoryModal = modal;
    $scope.categoryModal.hide();
  });

  $scope.openCategoryModal = function() {

    // load categories
    Market.category.all()
    .then(function(categories){
      $scope.categories.search.text = '';
      $scope.categories.search.results = categories;
      $scope.categories.all = categories;
      UIUtils.ink();
      $scope.categoryModal.show();
    });
  };

  $scope.closeCategoryModal = function() {
    $scope.categoryModal.hide();
  };

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    console.log('Category ' + cat.name + 'selected. Method selectCategory(cat) not overwritten.');
    $scope.closeCategoryModal();
  };

  $scope.searchCategoryChanged = function() {
    $scope.categories.search.text = $scope.categories.search.text.toLowerCase();
    if ($scope.categories.search.text.length > 1) {
      $scope.doSearchCategory($scope.categories.search.text);
    }
    else {
      $scope.categories.search.results = $scope.categories.all;
    }
  };

  $scope.doSearchCategory = function(text) {
    $scope.search.looking = true;

    $scope.categories.search.results = $scope.categories.all.reduce(function(result, cat) {
      if (cat.parent && cat.name.toLowerCase().search(text) != -1) {
          return result.concat(cat);
      }
      return result;
    }, []);

    $scope.categories.search.looking = false;
  };
}

function MarketLookupController($scope, Market, $state, $ionicModal, $focus, $timeout, ionicMaterialMotion, ionicMaterialInk, UIUtils) {

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal, ionicMaterialInk);

  $scope.search = {
    text: '',
    results: {},
    category: null,
    location: null,
    options: null
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.q) { // Query parameter
      $scope.search.text=$state.stateParams.q;
      $timeout(function() {
        $scope.doSearch();
      }, 100);
    }
    else {
      $timeout(function() {
        $scope.doGetLastRecord();
      }, 100);
    }
    $focus('searchText');
  });

  $scope.$watch('search.options', $scope.doSearch, true);

  $scope.isFilter = function(filter) {
    return ($scope.filter == filter);
  };

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.search.category = cat;
    $scope.closeCategoryModal();
    $scope.doSearch();
  };


  $scope.doSearch = function() {
    $scope.search.looking = true;
    if (!$scope.search.options) {
      $scope.search.options = false;
    }

    var request = {
      query: {},
      highlight: {
        fields : {
          title : {},
          description : {}
        }
      },
      from: 0,
      size: 20,
      _source: ["title", "time", "description", "location", "pictures", "category"]
    };
    var text = $scope.search.text.toLowerCase().trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      matches.push({match: { title: text}});
      matches.push({match: { description: text}});
      if (!$scope.search.options) {
        matches.push({match: { location: text}});
      }
    }
    if ($scope.search.options && $scope.search.category) {
      filters.push({term: { category: $scope.search.category.id}});
    }
    if ($scope.search.options && $scope.search.location && $scope.search.location.length > 0) {
      filters.push({match: { location: $scope.search.location}});
    }

    if (matches.length === 0 && filters.length === 0) {
      $scope.search.results = [];
      $scope.search.looking = false;
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

  $scope.doGetLastRecord = function() {
    $scope.search.looking = true;

    var request = {
      sort: {
        "time" : "desc"
      },
      from: 0,
      size: 20,
      _source: ["title", "time", "description", "location", "pictures", "category"]
    };

    $scope.doRequest(request);
  };


$scope.doRequest = function(request) {
    $scope.search.looking = true;

    Market.category.all()
      .then(function(categories) {
        return Market.record.search(request)
          .then(function(res){
            if (res.hits.total === 0) {
              $scope.search.results = [];
            }
            else {
              var items = res.hits.hits.reduce(function(result, hit) {
                  var market = hit._source;
                  market.id = hit._id;
                  market.type = hit._type;
                  market.urlTitle = market.title;
                  if (market.category) {
                    market.category = categories[market.category];
                  }
                  if (hit.highlight) {
                    if (hit.highlight.title) {
                        market.title = hit.highlight.title[0];
                    }
                    if (hit.highlight.description) {
                        market.description = hit.highlight.description[0];
                    }
                    if (hit.highlight.location) {
                        market.location = hit.highlight.location[0];
                    }
                  }
                  return result.concat(market);
                }, []);
              $scope.search.results = items;

              // Set Motion
              $timeout(function() {
                UIUtils.motion.fadeSlideInRight({
                  startVelocity: 3000
                });
              }, 10);

              // Set Ink
              UIUtils.ink();
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

  $scope.select = function(id, title) {
    UIUtils.loading.show();
    $state.go('app.market_view_record', {id: id, title: title});
  };
}

function MarketRecordViewController($scope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q) {

  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
       $scope.load($state.stateParams.id);
    }
    else {
      $state.go('app.market_lookup');
    }
  });

  $scope.load = function(id) {
    UIUtils.loading.show();
    $q.all([
      Market.category.all()
      .then(function(categories) {
        Market.record.get({id: id})
        .then(function (hit) {
          $scope.formData = hit._source;
          $scope.category = categories[hit._source.category];
          $scope.id= hit._id;
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat({src: pic.src});
            }, []);
          }
          $scope.canEdit = !$scope.isLogged() || ($scope.formData && $scope.formData.issuer === Wallet.getData().pubkey);
          UIUtils.loading.hide();
        });
      })
    ]).catch(UIUtils.onError('Could not load market'));
  };

  $scope.edit = function() {
    $state.go('app.market_edit_record', {id: $scope.id});
  };
}

function MarketRecordEditController($scope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q, $ionicPopup, System, $timeout) {

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal);

  $scope.walletData = {};
  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];
  $scope.system = System;

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
    .then(function(walletData) {
      $scope.walletData = walletData;
      if ($state.stateParams && $state.stateParams.id) { // Load by id
        UIUtils.loading.show();
        $scope.load($state.stateParams.id);
      }
      else {
        UIUtils.loading.hide();
      }
    });
  });

  $scope.load = function(id) {
    UIUtils.loading.show();
    $q.all([
      Market.category.all()
      .then(function(categories) {
        Market.record.get({id: id})
        .then(function (hit) {
          $scope.formData = hit._source;
          $scope.category = categories[hit._source.category];
          $scope.id= hit._id;
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat({src: pic.src});
            }, []);
          }
          UIUtils.loading.hide();
          UIUtils.motion.pushDown({
                  selector: '.push-down'
              });
          UIUtils.motion.fadeSlideInRight({
                  selector: '.animate-fade-slide-in .item'
              });
          // Set Ink
          UIUtils.ink();
        });
      })
    ])
    .catch(UIUtils.onError('Could not load market'));
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
        // Set time (UTC)
        // TODO : use the block chain time
        $scope.formData.time = Math.floor(moment().utc().valueOf() / 1000);
        Market.record.add($scope.formData, $scope.walletData.keypair)
        .then(function(id) {
          UIUtils.loading.hide();
          $state.go('app.market_view_record', {id: id});
          resolve();
        })
        .catch(UIUtils.onError('Could not save market'));
      }
      else { // Update
        if (!$scope.formData.time) {
          // Set time (UTC)
          // TODO : use the block chain time
          $scope.formData.time = Math.floor(moment().utc().valueOf() / 1000);
        }
        Market.record.update($scope.formData, {id: $scope.id}, $scope.walletData.keypair)
        .then(function() {
          UIUtils.loading.hide();
          $state.go('app.market_view_record', {id: $scope.id});
          resolve();
        })
        .catch(UIUtils.onError('Could not update market'));
      }
    });
  };

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.category = cat;
    $scope.formData.category = cat.id;
    $scope.closeCategoryModal();
  };

  $scope.takePicture = function() {
    System.camera.take()
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
        System.image.resize(file)
        .then(function(imageData) {
          $scope.pictures.push({src: imageData});
          UIUtils.loading.hide();
          $scope.$apply();
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

  $scope.auth = function() {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.show();
      $scope.walletData = walletData;
      Market.auth.token(walletData.keypair)
      .then(function(token) {
        UIUtils.loading.hide();
        console.log('authentication token is:' + token);
      })
      .catch(onError('Could not computed authentication token'));
    })
    .catch(onError('Could not computed authentication token'));
  };
}
