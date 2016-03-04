angular.module('cesium.registry.controllers', ['cesium.services'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

    .state('app.registry_lookup', {
      url: "/registry",
      views: {
        'menuContent': {
          templateUrl: "templates/registry/lookup.html",
          controller: 'RegistryLookupCtrl'
        }
      }
    })

   .state('app.registry_view_record', {
      url: "/registry/:id",
      views: {
        'menuContent': {
          templateUrl: "templates/registry/view_record.html",
          controller: 'RegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_add_record', {
      url: "/registry/add",
      views: {
        'menuContent': {
          templateUrl: "templates/registry/edit_record.html",
          controller: 'RegistryRecordEditCtrl'
        }
      }
    })

    .state('app.registry_edit_record', {
      url: "/registry/:id/edit",
      views: {
        'menuContent': {
          templateUrl: "templates/registry/edit_record.html",
          controller: 'RegistryRecordEditCtrl'
        }
      }
    });
  })

 .controller('RegistryLookupCtrl', RegistryLookupController)

 .controller('RegistryRecordViewCtrl', RegistryRecordViewController)

 .controller('RegistryRecordEditCtrl', RegistryRecordEditController)

;

function RegistryCategoryModalController($scope, Registry, $state, $ionicModal) {

  $scope.categoryModal = null;

  // category lookup modal
  $ionicModal.fromTemplateUrl('templates/registry/modal_category.html', {
      scope: $scope,
      focusFirstInput: true
  }).then(function(modal) {
    $scope.categoryModal = modal;
    $scope.categoryModal.hide();
  });

  $scope.openCategoryModal = function() {
    // load categories
    Registry.category.all()
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

function RegistryLookupController($scope, Registry, $state, $ionicModal) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal);

  $scope.search = {
    text: '',
    results: {},
    category: null,
    options: false
  };

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
      _source: ["title", "time", "description", "pictures"]
    };
    var matches = [];
    if ($scope.search.text.length > 1) {
      matches.push({match : { title: $scope.search.text}});
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

    return Registry.record.search(request)
      .then(function(res){
        $scope.search.looking = false;
        if (res.hits.total == 0) {
          $scope.search.results = [];
        }
        else {
          $scope.search.results = res.hits.hits.reduce(function(result, hit) {
              var registry = hit._source;
              registry.id = hit._id;
              registry.type = hit._type;
              if (hit.highlight) {
                if (hit.highlight.title) {
                    registry.title = hit.highlight.title[0];
                }
                if (hit.highlight.description) {
                    registry.description = hit.highlight.description[0];
                }
              }
              return result.concat(registry);
            }, []);
        }
      })
      .catch(function(err) {
        $scope.search.looking = false;
        $scope.search.results = [];
      });
  };

  $scope.select = function(id) {
    $state.go('app.registry_view_record', {id: id});
  };
}

function RegistryRecordViewController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q) {

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
      $state.go('app.lookup_registry');
    }
  });

  $scope.load = function(id) {
    UIUtils.loading.show();
    $q.all([
      Registry.category.all()
      .then(function(categories) {
        Registry.record.get({id: id})
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
    ]).catch(UIUtils.onError('Could not load registry'));
  };

  $scope.edit = function() {
    $state.go('app.registry_edit_record', {id: $scope.id});
  };
}

function RegistryRecordEditController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, $ionicPopup) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal);

  $scope.walletData = {};
  $scope.formData = {
    isCompany: false
  };
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
      Registry.category.all()
      .then(function(categories) {
        Registry.record.get({id: id})
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
    .catch(UIUtils.onError('Could not load registry'))
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
          Registry.record.add($scope.formData, $scope.walletData.keypair)
          .then(function(id) {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: id})
            resolve();
          })
          .catch(UIUtils.onError('Could not save registry'));
      }
      else { // Update
          Registry.record.update($scope.formData, {id: $scope.id}, $scope.walletData.keypair)
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: $scope.id})
            resolve();
          })
          .catch(UIUtils.onError('Could not update registry'));
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
      Registry.auth.token(walletData.keypair)
      .then(function(token) {
        UIUtils.loading.hide();
        console.log('authentication token is:' + token);
      })
      .catch(onError('Could not computed authentication token'));
    })
    .catch(onError('Could not computed authentication token'));
  };
}