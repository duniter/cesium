angular.module('cesium.market.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($menuProvider) {
    'ngInject';
    $menuProvider.addItem({
      text: 'MENU.MARKET',
      icon: "ion-speakerphone",
      url: '#/app/market',
      section: $menuProvider.sections.MAIN
    });
  })

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

    .state('app.market_lookup', {
      url: "/market?q&category&location",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/lookup.html",
          controller: 'MarketLookupCtrl'
        }
      }
    })

   .state('app.market_view_record', {
      url: "/market/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/view_record.html",
          controller: 'MarketRecordViewCtrl'
        }
      }
    })

    .state('app.market_add_record', {
      url: "/market/add",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/edit_record.html",
          controller: 'MarketRecordEditCtrl'
        }
      }
    })

    .state('app.market_edit_record', {
      url: "/market/:id/edit",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/market/edit_record.html",
          controller: 'MarketRecordEditCtrl'
        }
      }
    });
  })

 .controller('MarketLookupCtrl', MarketLookupController)

 .controller('MarketRecordViewCtrl', MarketRecordViewController)

 .controller('MarketRecordEditCtrl', MarketRecordEditController)

;

function MarketCategoryModalController($scope, Market, $state, $ionicModal, UIUtils) {
  'ngInject';

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
  $ionicModal.fromTemplateUrl('plugins/es/templates/market/modal_category.html', {
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

function MarketLookupController($scope, Market, $state, $ionicModal, $focus, $timeout, UIUtils) {
  'ngInject';

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal, UIUtils);

  $scope.search = {
    text: '',
    lastRecords: true,
    results: [],
    looking: true,
    category: null,
    location: null,
    options: false
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
      if ($state.stateParams && $state.stateParams.q) { // Query parameter
        $scope.search.text=$state.stateParams.q;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      // search on category
      else if ($state.stateParams && $state.stateParams.category) {
        Market.category.all()
        .then(function(categories) {
          var cat = categories[$state.stateParams.category];
          if (cat !== "undefined") {
            $scope.search.options = true;
            $scope.search.category = cat;
          }
          $timeout(function() {
            $scope.doSearch();
          }, 100);
        });
      }
      // search on location
      else if ($state.stateParams && $state.stateParams.location) {
        $scope.search.options = true;
        $scope.search.location = $state.stateParams.location;
        $timeout(function() {
          $scope.doSearch();
        }, 100);
      }
      else {
        $timeout(function() {
          $scope.doGetLastRecord();
        }, 100);
      }
      $scope.entered = true;
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
    $scope.search.lastRecords = false;
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
      _source: Market.record.fields.commons
    };
    var text = $scope.search.text.toLowerCase().trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      var matchFields = ["title", "description", "issuer", "location"];
      matches.push({multi_match : { query: text,
        fields: matchFields,
        type: "phrase_prefix"
      }});
      matches.push({match: { title: text}});
      matches.push({match: { description: text}});
      matches.push({prefix: { location: text}});
    }
    if ($scope.search.options && $scope.search.category) {
      filters.push({term: { "category.id": $scope.search.category.id}});
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

  $scope.doGetLastRecord = function() {
    $scope.search.looking = true;
    $scope.search.lastRecords = true;

    var request = {
      sort: {
        "time" : "desc"
      },
      from: 0,
      size: 20,
      _source: Market.record.fields.commons
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
              var records = res.hits.hits.reduce(function(result, hit) {
                  var record = hit._source;
                  record.id = hit._id;
                  record.type = hit._type;
                  record.urlTitle = record.title;
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
                  }
                  return result.concat(record);
                }, []);
              $scope.search.results = records;

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
}

function MarketRecordViewController($scope, $rootScope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q, $timeout, BMA, UserService) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.maxCommentSize = 10;
  $scope.commentData = {};

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
      if (!$scope.loaded) {
        $scope.load($state.stateParams.id);
      }
    }
    else {
      $state.go('app.market_lookup');
    }
  });

  $scope.loadComments = function(id) {
    return Market.record.comment.all(id, $scope.maxCommentSize)
      .then(function(comments) {
        // sort by time asc
        comments  = comments.sort(function(cm1, cm2) {
           return (cm1.time - cm2.time);
        });
        $scope.comments = comments;
      });
  };

  $scope.load = function(id) {
    UIUtils.loading.show();
    Market.category.all()
    .then(function(categories) {
      Market.record.getCommons({id: id})
      .then(function (hit) {
        $scope.formData = hit._source;
        if (hit._source.category && hit._source.category.id) {
          $scope.category = categories[hit._source.category.id];
        }
        $scope.id= hit._id;
        if (hit._source.thumbnail) {
          $scope.thumbnail = UIUtils.image.fromAttachment(hit._source.thumbnail);
        }
        $scope.canEdit = $scope.formData && $scope.isUserPubkey($scope.formData.issuer);

        // Get last UD
        BMA.blockchain.lastUd(true/*cache*/)
        .then(function(currentUD){
          $rootScope.walletData.currentUD = currentUD;
          $scope.refreshConvertedPrice();
          // Load issuer as member
          return BMA.wot.member.get($scope.formData.issuer);
        })
        .then(function(member){
          $scope.issuer = member;

          // Set Motion (only direct children, to exclude .lazy-load children)
          $timeout(function() {
            UIUtils.motion.fadeSlideIn({
              selector: '.list > .item',
              startVelocity: 3000
            });
          }, 10);
          UIUtils.loading.hide();
          $scope.loaded = true;
        })
        .catch(function(err) {
          UIUtils.loading.hide();
          $scope.member = null;
        });
      })
      .catch(function(err) {
        if (!$scope.secondTry) {
          $scope.secondTry = true;
          $q(function() {
            $scope.load(id); // loop once
          }, 100);
        }
        else {
          UIUtils.onError('MARKET.ERROR.LOAD_RECORD_FAILED')(err);
        }
      });

      // Continue loading other data
      $q.all([
        // Load pictures
        Market.record.picture.all({id: id})
        .then(function(hit) {
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat(UIUtils.image.fromAttachment(pic.file));
            }, []);
          }
        }),

        // Load comments
        $scope.loadComments(id)
      ])
      .then(function() {
        // Set Motion
        $timeout(function() {
          UIUtils.motion.fadeSlideIn({
            selector: '.card-gallery, .card-comment, .lazy-load > .item'
          });
        }, 10);
      })
      .catch(function(err) {
        $scope.pictures = [];
        $scope.comments = [];
      });

    })
    .catch(function(){
      $scope.loading = false;
      UIUtils.onError('MARKET.ERROR.LOAD_CATEGORY_FAILED')(err);
    });
  };

  $scope.refreshConvertedPrice = function() {
    if (!$scope.walletData || !$rootScope.walletData.settings) {
      return;
    }
    if ($rootScope.walletData.settings.useRelative) {
      $scope.convertedPrice = $scope.formData.price ? ($scope.formData.price / $rootScope.walletData.currentUD) : null;
    } else {
      $scope.convertedPrice = $scope.formData.price;
    }
  };
  $scope.$watch('$root.walletData.settings.useRelative', $scope.refreshConvertedPrice, true);

  $scope.edit = function() {
    $state.go('app.market_edit_record', {id: $scope.id});
  };

  $scope.showMoreComments = function(){
    $scope.maxCommentSize = $scope.maxCommentSize * $scope.maxCommentSize;
    $scope.loadComments($scope.id)
    .then(function() {
      // Set Motion
      $timeout(function() {
        UIUtils.motion.fadeSlideIn({
          selector: '.card-comment'
        });
      }, 10);
    });
  };

  $scope.sendComment = function() {
    if (!$scope.commentData.message || $scope.commentData.message.trim().length === 0) {
      return;
    }
    $scope.loadWallet()
    .then(function(walletData) {
      var comment = $scope.commentData;
      comment.record= $scope.id;
      comment.issuer = walletData.pubkey;
      var obj = {};
      angular.copy(comment, obj);
      if (walletData.uid) {
        obj.uid = walletData.uid;
      }
      obj.isnew = true;
      $scope.comments.push(obj);
      $scope.commentData = {}; // reset comment
      // Create
      if (!comment.id) {
        // Set time (UTC) - TODO : use the block chain time
        comment.time = Math.floor(moment().utc().valueOf() / 1000);
        obj.time = comment.time;
        Market.record.comment.add(comment)
        .then(function (id){
          obj.id = id;
        })
        .catch(UIUtils.onError('MARKET.ERROR.FAILED_SAVE_COMMENT'));
      }
      // Update
      else {
        Market.record.comment.update(comment, {id: comment.id})
        .catch(UIUtils.onError('MARKET.ERROR.FAILED_SAVE_COMMENT'));
      }
    });
  };

  $scope.editComment = function(index) {
    var comment = $scope.comments[index];
    $scope.comments.splice(index, 1);
    $scope.commentData = comment;
  };

  $scope.removeComment = function(index) {
    var comment = $scope.comments[index];
    if (!comment || !comment.id) {return;}
    $scope.comments.splice(index, 1);
    Market.record.comment.remove(comment.id, Wallet.data.keypair)
    .catch(UIUtils.onError('MARKET.ERROR.FAILED_REMOVE_COMMENT'));
  };
}

function MarketRecordEditController($scope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q, $ionicPopup, Device, $timeout) {
  'ngInject';

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal, UIUtils, Wallet);

  $scope.walletData = {};
  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadCurrencies()
    .then(function(currencies){
      if (currencies.length == 1) {
         $scope.currency = currencies[0].name;
      }
      return $scope.loadWallet();
    })
    .then(function(walletData) {
      $scope.useRelative = walletData.settings.useRelative;
      $scope.walletData = walletData;
      if ($state.stateParams && $state.stateParams.id) { // Load by id
        UIUtils.loading.show();
        $scope.load($state.stateParams.id);
      }
      else {
        $scope.loadCurrencies()
        .then(function(currencies){
          $scope.formData.currency = $scope.currency;
          UIUtils.loading.hide();
        });
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
          if (hit._source.category && hit._source.category.id) {
            $scope.category = categories[hit._source.category.id];
          }
          $scope.id= hit._id;
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat(UIUtils.image.fromAttachment(pic.file));
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
      var doFinishSave = function(formData) {
        if (!$scope.id) { // Create
          // Set time (UTC)
          // TODO : use the block chain time
          formData.time = Math.floor(moment().utc().valueOf() / 1000);
          Market.record.add(formData)
          .then(function(id) {
            $scope.id = id;
            UIUtils.loading.hide();
            $state.go('app.market_view_record', {id: id});
            resolve();
          })
          .catch(UIUtils.onError('Could not save market'));
        }
        else { // Update
          if (formData.time) {
            // Set time (UTC)
            // TODO : use the block chain time
            formData.time = Math.floor(moment().utc().valueOf() / 1000);
          }
          Market.record.update(formData, {id: $scope.id})
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.market_view_record', {id: $scope.id});
            resolve();
          })
          .catch(UIUtils.onError('Could not update market'));
        }
      };

      $scope.formData.picturesCount = $scope.pictures.length;
      if ($scope.formData.picturesCount > 0) {
        $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
          return res.concat({file: UIUtils.image.toAttachment(pic)});
        }, []);
        UIUtils.image.resizeSrc($scope.pictures[0].src, true)
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
    });
  };

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.category = cat;
    $scope.formData.category = cat;
    $scope.closeCategoryModal();
  };

  $scope.setUseRelative = function(useRelative) {
    $scope.formData.unit = useRelative ? 'DU' : 'unit';
    //$scope.unitPopover.hide();
  };

  $scope.openCurrencyLookup = function() {
    alert('Not implemented yet. Please submit an issue if occur again.');
  };

  $scope.selectNewPicture = function() {
    if ($scope.isDeviceEnable()){
      openPicturePopup();
    }
    else {
      var fileInput = angular.element(document.querySelector('#editMarket #pictureFile'));
      if (fileInput && fileInput.length > 0) {
        fileInput[0].click();
      }
    }
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
        //$scope.$apply();
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


}
