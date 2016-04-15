angular.module('cesium.registry.controllers', ['cesium.services', 'ngSanitize'])

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
      url: "/registry/:id/:title",
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
    })
    ;
  })

 .controller('RegistryLookupCtrl', RegistryLookupController)

 .controller('RegistryRecordViewCtrl', RegistryRecordViewController)

 .controller('RegistryRecordEditCtrl', RegistryRecordEditController)

;

function RegistryCategoryModalController($scope, Registry, $state, $ionicModal, ionicMaterialInk) {

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
      $scope.categories.search.text = '';
      $scope.categories.search.results = categories;
      $scope.categories.all = categories;
      ionicMaterialInk.displayEffect();
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

function RegistryLookupController($scope, $state, $ionicModal, $focus, $q, $timeout, Registry, UIUtils, $sanitize, ionicMaterialMotion, ionicMaterialInk) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal, ionicMaterialInk);
  RegistryNewRecordWizardController.call(this, $scope, $ionicModal, $state, UIUtils, $q, $timeout, Registry);

  $scope.search = {
    text: '',
    results: {},
    category: null,
    options: null
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
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

  $scope.searchChanged = function() {
    $scope.search.typing = $scope.search.text;
    $scope.search.looking = true;
    $timeout(
      function() {
        if ($scope.search.typing == $scope.search.text) {
          $scope.search.typing = null;
          if (!$scope.search.options) {
            $scope.search.options = false;
          }
          $scope.doSearch();
        }
      },
      1000);
  };

  $scope.searchLocationChanged = function() {
    $scope.search.typing = $scope.search.location;
    $scope.search.looking = true;
    $timeout(
      function() {
        if ($scope.search.typing == $scope.search.location) {
          $scope.search.typing = null;
          $scope.doSearch();
        }
      },
      1000);
  };

  $scope.doSearch = function() {
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
      _source: ["title", "description", "time", "location", "pictures", "issuer", "isCompany", "category"]
    };
    var text = $scope.search.text.toLowerCase();
    var matches = [];
    var filters = [];
    if ($scope.search.text.length > 1) {
      matches.push({match : { title: text}});
      matches.push({match : { description: text}});
      matches.push({prefix : { issuer: text}});
      if (!$scope.search.options) {
        matches.push({match: { location: text}});
      }
    }
    if ($scope.search.options && $scope.search.category) {
      filters.push({term: { category: $scope.search.category.id}});
    }
    if ($scope.search.options && $scope.search.location && $scope.search.location.length > 0) {
      filters.push({match_phrase: { location: $scope.search.location}});
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

    Registry.category.all()
      .then(function(categories) {
        Registry.record.search(request)
          .then(function(res){
            $scope.search.looking = false;
            if (res.hits.total === 0) {
              $scope.search.results = [];
            }
            else {
              $scope.search.results = res.hits.hits.reduce(function(result, hit) {
                  var registry = hit._source;
                  registry.id = hit._id;
                  registry.type = hit._type;
                  registry.urlTitle = registry.title;
                  if (registry.category) {
                    registry.category = categories[registry.category];
                  }
                  if (hit.highlight) {
                    if (hit.highlight.title) {
                        registry.title = hit.highlight.title[0];
                    }
                    if (hit.highlight.description) {
                        registry.description = hit.highlight.description[0];
                    }
                    if (hit.highlight.location) {
                        registry.description = hit.highlight.location[0];
                    }
                  }
                  return result.concat(registry);
                }, []);

              // Set Motion
              $timeout(function() {
                ionicMaterialMotion.fadeSlideInRight({
                  startVelocity: 3000
                });
              }, 100);

              // Set Ink
              ionicMaterialInk.displayEffect();
            }
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
    $state.go('app.registry_view_record', {id: id, title: title});
  };

 // TODO: remove auto add account when done
 /* $timeout(function() {
    $scope.search.text='lavenier';
    $scope.doSearch();
  }, 400);
  */
}

function RegistryRecordViewController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, BMA, ionicMaterialInk) {

  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.hasSelf = false;
  $scope.identity = null;

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
          $scope.canEdit = !$scope.isLogged() || ($scope.formData && $scope.formData.issuer == Wallet.getData().pubkey);

          if (!$scope.formData.isCompany) {
            BMA.wot.lookup({ search: $scope.formData.issuer })
              .then(function(res){
                $scope.identity = res.results.reduce(function(idties, res) {
                  return idties.concat(res.uids.reduce(function(uids, idty) {
                    return uids.concat({
                      uid: idty.uid,
                      pub: res.pubkey,
                      sigDate: idty.meta.timestamp,
                      sig: idty.self
                    });
                  }, []));
                }, [])[0];
                $scope.hasSelf = ($scope.identity.uid && $scope.identity.sigDate && $scope.identity.sig);
                UIUtils.loading.hide();
              })
              .catch(UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED'));
          }
          else {
            $scope.hasSelf = false;
            $scope.identity = null;
            UIUtils.loading.hide();
          }
        });
      })
    ]).catch(UIUtils.onError('Could not load registry'));
  };

  // Edit click
  $scope.edit = function() {
    UIUtils.loading.show();
    $state.go('app.registry_edit_record', {id: $scope.id});
  };

  // Sign click
  $scope.signIdentity = function(identity) {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.show();
      Wallet.sign($scope.identity.uid,
                  $scope.identity.pub,
                  $scope.identity.sigDate,
                  $scope.identity.sig)
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.alertInfo('INFO.CERTIFICATION_DONE');
      })
      .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

}

function RegistryRecordEditController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, $ionicPopup, $translate, ionicMaterialInk) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal, ionicMaterialInk);

  $scope.walletData = {};
  $scope.recordData = {
    isCompany: false
  };
  $scope.recordForm = {};
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

  $scope.setRecordForm =  function(recordForm) {
    $scope.recordForm = recordForm;
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    $scope.loadWallet()
    .then(function(walletData) {
      $scope.walletData = walletData;
      if ($state.stateParams && $state.stateParams.id) { // Load by id
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
      Registry.category.all()
      .then(function(categories) {
        Registry.record.get({id: id})
        .then(function (hit) {
          $scope.recordData = hit._source;
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
    .catch(UIUtils.onError('Could not load registry'));
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.recordData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
          Registry.record.add($scope.recordData, $scope.walletData.keypair)
          .then(function(id) {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: id});
            resolve();
          })
          .catch(UIUtils.onError('Could not save registry'));
      }
      else { // Update
          Registry.record.update($scope.recordData, {id: $scope.id}, $scope.walletData.keypair)
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: $scope.id});
            resolve();
          })
          .catch(UIUtils.onError('Could not update registry'));
      }
    });
  };

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.category = cat;
    $scope.recordData.category = cat.id;
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
      };
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

function RegistryNewRecordWizardController($scope, $ionicModal, $state, UIUtils, $q, $timeout, Registry) {

  $scope.recordData = {
    isCompany: null
  };
  $scope.recordForm = {};
  $scope.pictures = [];
  $scope.slides = {
    slider: null,
    options: {
      loop: false,
      effect: 'slide',
      speed: 500
    }
  };

  // Called to navigate to the main app
  $scope.cancel = function() {
    if ($scope.newRecordModal) {
      $scope.newRecordModal.hide();
      $scope.newRecordModal.remove();
      $scope.newRecordModal = null;
      $timeout(function(){
        $scope.recordData = {
          isCompany: null
        };
        $scope.recordForm = {};
        $scope.pictures = [];
        $scope.slides.slider.destroy();
        delete $scope.slides.slider;
      }, 200);
    }
  };

  $scope.setRecordForm =  function(recordForm) {
    $scope.recordForm = recordForm;
  };

  $scope.slidePrev = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slidePrev();
    $scope.slides.slider.lockSwipes();
  };

  $scope.slideNext = function() {
    $scope.slides.slider.unlockSwipes();
    $scope.slides.slider.slideNext();
    $scope.slides.slider.lockSwipes();
  };

  $scope.newRecord = function() {
    var showModal = function() {
      $scope.loadWallet()
        .then(function(walletData) {
          $scope.walletData = walletData;
          $scope.slides.slider.slideTo(0);
          $scope.slides.slider.lockSwipes();
          UIUtils.loading.hide();
          $scope.newRecordModal.show();
          // TODO: remove default
          /*$timeout(function() {
            $scope.recordData.title="Benoit Lavenier";
            $scope.recordData.description="J'aime le Sou !";
            $scope.setIsCompany(false);
          }, 300);*/
        });
    };

    if (!$scope.newRecordModal) {
      UIUtils.loading.show();
      // Create the account modal that we will use later
      $ionicModal.fromTemplateUrl('templates/registry/new_record_wizard.html', {
        scope: $scope,
        animation: 'slide-in-down'
      }).then(function(modal) {
        $scope.newRecordModal = modal;
        $scope.newRecordModal.hide()
        .then(function(){
          showModal();
        });

      });
    }
    else {
      showModal();
    }
  };

  $scope.setIsCompany = function(bool) {
    $scope.recordData.isCompany = bool;
    $scope.slideNext();
  };

  $scope.doNewRecord = function() {
    $scope.recordForm.$submitted=true;
    if(!$scope.recordForm.$valid) {
      return;
    }

    UIUtils.loading.show();
    return $q(function(resolve, reject) {
          $scope.recordData.pictures = $scope.pictures.reduce(function(res, pic) {
            return res.concat({src: pic.src});
          }, []);
          Registry.record.add($scope.recordData, $scope.walletData.keypair)
          .then(function(id) {
            $scope.cancel();
            $state.go('app.registry_view_record', {id: id});
            resolve();
          })
          .catch(UIUtils.onError('Could not save registry'));
    });
  };

  //Cleanup the modal when hidden
  $scope.$on('newRecordModal.hidden', function() {
    $scope.cancel();
  });

  // TODO: remove auto add account when done
  /*$timeout(function() {
    $scope.newRecord();
  }, 400);
  */
}
