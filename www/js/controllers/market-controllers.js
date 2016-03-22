angular.module('cesium.market.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

    .state('app.market_lookup', {
      url: "/market",
      views: {
        'menuContent': {
          templateUrl: "templates/market/lookup.html",
          controller: 'MarketLookupCtrl'
        }
      }
    })

   .state('app.market_view_record', {
      url: "/market/:id",
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
      if (cat.parent != null
          && cat.parent != "undefined"
          && cat.name.toLowerCase().search(text) != -1) {
          return result.concat(cat);
      }
      return result;
    }, []);

    $scope.categories.search.looking = false;
  };
}

function MarketLookupController($scope, Market, $state, $ionicModal, $focus) {

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal);

  $scope.search = {
    text: '',
    results: {},
    category: null,
    options: false
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    $focus('searchText');
  });

  $scope.$watch('search.options', $scope.doSearch, true);

  $scope.isFilter = function(filter) {
    return ($scope.filter == filter);
  }

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.search.category = cat;
    $scope.closeCategoryModal();
    $scope.doSearch();
  };

  $scope.searchChanged = function() {
    $scope.search.text = $scope.search.text.toLowerCase();
    if ($scope.search.text.length > 1) {
      $scope.doSearch();
    }
    else {
      $scope.search.results = [];
    }
  };

  $scope.doSearch = function(query) {
    $scope.search.looking = true;

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
      _source: ["title", "time", "description", "location", "pictures"]
    };
    var matches = [];
    if ($scope.search.text.length > 1) {
      matches.push({match : { title: $scope.search.text}});
      matches.push({match : { description: $scope.search.text}});
    }
    if ($scope.search.options && $scope.search.category) {
      matches.push({match : { category: $scope.search.category.id}});
    }
    if (matches.length > 1) {
      request.query.bool = { should: matches };
    }
    else {
      request.query.match = matches[0].match;
    }

    return Market.record.search(request)
      .then(function(res){
        $scope.search.looking = false;
        if (res.hits.total == 0) {
          $scope.search.results = [];
        }
        else {
          $scope.search.results = res.hits.hits.reduce(function(result, hit) {
              var market = hit._source;
              market.id = hit._id;
              market.type = hit._type;
              if (hit.highlight) {
                if (hit.highlight.title) {
                    market.title = hit.highlight.title[0];
                }
                if (hit.highlight.description) {
                    market.description = hit.highlight.description[0];
                }
              }
              return result.concat(market);
            }, []);
        }
      })
      .catch(function(err) {
        $scope.search.looking = false;
        $scope.search.results = [];
      });
  };

  $scope.select = function(id) {
    $state.go('app.market_view_record', {id: id});
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
          $scope.canEdit = !$scope.isLogged() || ($scope.formData && $scope.formData.issuer == Wallet.getData().pubkey)
          UIUtils.loading.hide();
        })
      })
    ]).catch(UIUtils.onError('Could not load market'));
  };

  $scope.edit = function() {
    $state.go('app.market_edit_record', {id: $scope.id});
  };
}

function MarketRecordEditController($scope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q, $ionicPopup) {

  MarketCategoryModalController.call(this, $scope, Market, $state, $ionicModal);

  $scope.walletData = {};
  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];

  ionic.Platform.ready(function() {
	  if (!navigator.camera) {
	    delete $scope.camera; return;
	  }
    $scope.camera = navigator.camera;
  });

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
        });
      })
    ])
    .catch(UIUtils.onError('Could not load market'))
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
          Market.record.add($scope.formData, $scope.walletData.keypair)
          .then(function(id) {
            UIUtils.loading.hide();
            $state.go('app.market_view_record', {id: id})
            resolve();
          })
          .catch(UIUtils.onError('Could not save market'));
      }
      else { // Update
          Market.record.update($scope.formData, {id: $scope.id}, $scope.walletData.keypair)
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.market_view_record', {id: $scope.id})
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

  $scope.openPicturePopup = function() {
    $ionicPopup.show({
        title: 'Choose picture source :',
        buttons: [
          {
            text: 'Gallery',
            type: 'button',
            onTap: function(e) {
              return navigator.camera.PictureSourceType.PHOTOLIBRARY;
            }
          },
          {
            text: '<b>Camera</b>',
            type: 'button button-positive',
            onTap: function(e) {
              return navigator.camera.PictureSourceType.CAMERA;
            }
          }
        ]
      })
      .then(function(sourceType){
        $scope.getPicture(sourceType);
      });
  };

  $scope.getPicture = function(sourceType) {
      var options = {
        quality: 50,
        destinationType: navigator.camera.DestinationType.DATA_URL,
        sourceType: sourceType,
        encodingType: navigator.camera.EncodingType.PNG,
        targetWidth : 400,
        targetHeight : 400
      }
      $scope.camera.getPicture(
        function (imageData) {
          $scope.pictures.push({src: "data:image/png;base64," + imageData});
          $scope.$apply();
        },
        UIUtils.onError('Could not get picture'),
        options);
    };

  $scope.fileChanged = function(event) {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      var file = event.target.files[0];
      var reader = new FileReader();

      reader.addEventListener("load", function () {
          //console.log(reader.result);
          $scope.pictures.push({src: reader.result});
          $scope.$apply();
      }, false);

      if (file) {
        reader.readAsDataURL(file);
      }
      UIUtils.loading.hide();
      resolve();
    });
  };

  /*
  // See doc :
  // http://stackoverflow.com/questions/20958078/resize-base64-image-in-javascript-without-using-canvas
  $scope.imageToDataUri function(img, width, height) {

      // create an off-screen canvas
      var canvas = document.createElement('canvas'),
          ctx = canvas.getContext('2d');

      // set its dimension to target size
      canvas.width = width;
      canvas.height = height;

      // draw source image into the off-screen canvas:
      ctx.drawImage(img, 0, 0, width, height);

      // encode image to data-uri with base64 version of compressed image
      return canvas.toDataURL();
  }*/

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