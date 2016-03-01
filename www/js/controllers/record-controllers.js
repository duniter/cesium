angular.module('cesium.record.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

    .state('app.lookup_record', {
      url: "/record",
      views: {
        'menuContent': {
          templateUrl: "templates/record/lookup.html",
          controller: 'RecordLookupCtrl'
        }
      }
    })

   .state('app.view_record', {
      url: "/record/:id",
      views: {
        'menuContent': {
          templateUrl: "templates/record/view_record.html",
          controller: 'RecordCtrl'
        }
      }
    })

    .state('app.add_record', {
      url: "/record/add",
      views: {
        'menuContent': {
          templateUrl: "templates/record/edit_record.html",
          controller: 'RecordEditCtrl'
        }
      }
    })

    .state('app.edit_record', {
      url: "/record/:id/edit",
      views: {
        'menuContent': {
          templateUrl: "templates/record/edit_record.html",
          controller: 'RecordEditCtrl'
        }
      }
    });
  })

 .controller('RecordLookupCtrl', RecordLookupController)

 .controller('RecordCtrl', RecordController)

 .controller('RecordEditCtrl', RecordEditController)

;

function CategoryModalController($scope, Record, $state, $ionicModal) {

  $scope.categoryModal = null;

  // category lookup modal
  $ionicModal.fromTemplateUrl('templates/record/modal_category.html', {
      scope: $scope,
      focusFirstInput: true
  }).then(function(modal) {
    $scope.categoryModal = modal;
    $scope.categoryModal.hide();
  });

  $scope.openCategoryModal = function() {
    // load categories
    Record.record.category.all()
    .then(function(categories){
      $scope.categories = categories;
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
}

function RecordLookupController($scope, Record, $state, $ionicModal) {

  CategoryModalController.call(this, $scope, Record, $state, $ionicModal);

  $scope.queryData = {};
  $scope.search = { text: '', results: {} };
  $scope.filter = null;

  function createQuery() {
    var res = {
      query: {},
      highlight: {
        fields : {
          title : {},
          description : {}
        }
      },
      from: 0,
      size: 20,
      _source: ["title", "time", "description", "pictures"]
    };
    var matches = [];
    matches[0] = {match : { title: $scope.search.text}};
    if ($scope.isFilter('advanced')
        && $scope.search.category != null
        && $scope.search.category != "undefined") {
      matches[1] = {match : { category: $scope.search.category.id}};
    }
    if (matches.length > 1) {
      res.query.bool = { should: matches };
    }
    else {
      res.query.match = matches[0].match;
    }
    return res;
  }

  $scope.setFilter = function(filter) {
    $scope.filter = filter;
  }

  $scope.isFilter = function(filter) {
    return ($scope.filter == filter);
  }

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.search.category = cat;
    $scope.closeCategoryModal();
  };

  $scope.searchChanged = function() {
    $scope.search.text = $scope.search.text.toLowerCase();
    if ($scope.search.text.length > 1) {
      $scope.search.looking = true;
      $scope.queryData = createQuery();
      $scope.doSearch()
    }
    else {
      $scope.search.results = [];
    }
  };

  $scope.doSearch = function() {
    return Record.record.search($scope.queryData)
      .then(function(res){
        $scope.search.looking = false;
        if (res.hits.total == 0) {
          $scope.search.results = [];
        }
        else {
          $scope.search.results = res.hits.hits.reduce(function(result, hit) {
              var record = hit._source;
              record.id = hit._id;
              record.type = hit._type;
              if (hit.highlight.title) {
                  record.title = hit.highlight.title[0];
              }
              if (hit.highlight.description) {
                  record.description = hit.highlight.description[0];
              }
              return result.concat(record);
            }, []);
        }
      })
      .catch(function(err) {
        $scope.search.looking = false;
        $scope.search.results = [];
      });
  };

  $scope.select = function(id) {
    $state.go('app.view_record', {id: id});
  };
}

function RecordController($scope, $ionicModal, Wallet, Record, UIUtils, $state, CryptoUtils, $q) {

  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
       $scope.load($state.stateParams.id);
    }
    else {
      $state.go('app.lookup_record');
    }
  });

  $scope.load = function(id) {
    UIUtils.loading.show();
    $q.all([
      Record.record.category.all()
      .then(function(categories) {
        Record.record.get({id: id})
        .then(function (hit) {
          $scope.formData = hit._source;
          $scope.category = categories[hit._source.category];
          $scope.id= hit._id;
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat({src: pic.src});
            }, []);
          }/*
          if (hit._source.pictures) {
            hit._source.pictures.forEach(function(pic) {
              $scope.pictures.concat({src: pic.src});
            });
          }*/
          UIUtils.loading.hide();
        })
      })
    ]).catch(UIUtils.onError('Could not load record'));
  };

  $scope.edit = function() {
    $state.go('app.edit_record', {id: $scope.id});
  };
}

function RecordEditController($scope, $ionicModal, Wallet, Record, UIUtils, $state, CryptoUtils, $q, $ionicPopup) {

  CategoryModalController.call(this, $scope, Record, $state, $ionicModal);

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
        $scope.load($state.stateParams.id);
      }
    });
  });

  $scope.load = function(id) {
    UIUtils.loading.show();
    $q.all([
      Record.record.category.all()
      .then(function(categories) {
        Record.record.get({id: id})
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
    .catch(UIUtils.onError('Could not load record'))
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
          Record.record.add($scope.formData, $scope.walletData.keypair)
          .then(function(id) {
            UIUtils.loading.hide();
            $state.go('app.view_record', {id: id})
            resolve();
          })
          .catch(UIUtils.onError('Could not save record'));
      }
      else { // Update
          Record.record.update($scope.formData, {id: $scope.id}, $scope.walletData.keypair)
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.view_record', {id: $scope.id})
            resolve();
          })
          .catch(UIUtils.onError('Could not update record'));
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
      Record.auth.token(walletData.keypair)
      .then(function(token) {
        UIUtils.loading.hide();
        console.log('authentication token is:' + token);
      })
      .catch(onError('Could not computed authentication token'));
    })
    .catch(onError('Could not computed authentication token'));
  };
}