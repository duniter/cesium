angular.module('cesium.registry.controllers', ['cesium.services', 'ngSanitize'])

  .config(function($stateProvider, $urlRouterProvider) {
    $stateProvider

    .state('app.registry_lookup', {
      url: "/registry?q",
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

function RegistryCategoryModalController($scope, Registry, $state, $ionicModal, UIUtils) {

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

function RegistryLookupController($scope, $state, $ionicModal, $focus, $q, $timeout, Registry, UIUtils, $sanitize) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal, UIUtils);
  RegistryNewRecordWizardController.call(this, $scope, $ionicModal, $state, UIUtils, $q, $timeout, Registry);

  $scope.search = {
    text: '',
    results: [],
    lastRecords: true,
    category: null,
    location: null,
    options: null
  };

  $scope.$on('$ionicView.enter', function(e, $state) {
    if (!$scope.entered || !$scope.search.results || $scope.search.results.length === 0) {
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
      _source: ["title", "description", "time", "location", "pictures", "issuer", "category"]
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
      matches.push({match : { title: text}});
      matches.push({match : { description: text}});
      matches.push({prefix : { location: text}});
      matches.push({prefix : { issuer: text}});
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
      _source: ["title", "description", "time", "location", "pictures", "issuer", "category"]
    };

    $scope.doRequest(request);
  };

  $scope.doRequest = function(request) {
    $scope.search.looking = true;

    Registry.category.all()
      .then(function(categories) {
        Registry.record.search(request)
          .then(function(res){
            if (res.hits.total === 0) {
              $scope.search.results = [];
            }
            else {
              var items = res.hits.hits.reduce(function(result, hit) {
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
            UIUtils.onError('ERROR.LOAD_IDENTITY_FAILED')(err);
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

function RegistryRecordEditController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, $ionicPopup, $translate, ionicMaterialInk, System) {

  RegistryCategoryModalController.call(this, $scope, Registry, $state, $ionicModal, UIUtils);

  $scope.walletData = {};
  $scope.recordData = {
    isCompany: false
  };
  $scope.recordForm = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];

  $scope.system = System;

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
        if ($scope.pictures.length === 0) {
          $scope.pictures.push({src: imageData});
        }
        else {
          $scope.pictures[0] = {src: imageData};
        }
        UIUtils.loading.hide();
        $scope.$apply();
        resolve();
      });
    });
  };

  $scope.removePicture = function(index){
    $scope.pictures.splice(index, 1);
  };

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
          // Set time (UTC)
          // TODO : use the block chain time
          $scope.recordData.time = Math.floor(moment().utc().valueOf() / 1000);
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

  $scope.selectCategory = function(cat) {
    if (!cat.parent) return;
    $scope.category = cat;
    $scope.recordData.category = cat.id;
    $scope.closeCategoryModal();
  };

  // TODO: remove auto add account when done
  /*$timeout(function() {
    $scope.newRecord();
  }, 400);
  */
}
