angular.module('cesium.registry.controllers', ['cesium.services', 'ngSanitize', 'cesium.es.controllers'])

  .config(function($menuProvider) {
    'ngInject';
    $menuProvider.addItem({
      text: 'MENU.REGISTRY',
      icon: "ion-ios-book",
      url: '#/app/registry',
      section: $menuProvider.sections.MAIN
    });
  })

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

    .state('app.registry_lookup', {
      url: "/registry?q",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup.html",
          controller: 'RegistryLookupCtrl'
        }
      }
    })

   .state('app.registry_view_record', {
      url: "/registry/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'RegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_add_record', {
      cache: false,
      url: "/registry/add",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'RegistryRecordEditCtrl'
        }
      }
    })

    .state('app.registry_edit_record', {
      cache: false,
      url: "/registry/:id/edit",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
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

function RegistryLookupController($scope, $state, $ionicModal, $focus, $q, $timeout, Registry, UIUtils, $sanitize, ModalUtils, UserService) {
  'ngInject';

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

  /* -- modals -- */

  $scope.showCategoryModal = function(parameters) {
    // load categories
    Registry.category.all()
    .then(function(result){
      // open modal
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
             {categories: result}, {focusFirstInput: true})
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
        ModalUtils.show('plugins/es/templates/registry/modal_record_type.html', 'ESEmptyModalCtrl',
                  null, {focusFirstInput: true, animation: 'slide-in-down'})
        .then(function(type){
          if (type) {
            $state.go('app.registry_edit_record');
          }
        });
    });
  };

 // TODO: remove auto add account when done
 /* $timeout(function() {
    $scope.search.text='lavenier';
    $scope.doSearch();
  }, 400);
  */
}

function RegistryRecordViewController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, BMA) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.hasSelf = false;
  $scope.identity = null;
  $scope.isCompany = false;

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
       $scope.load($state.stateParams.id);
    }
    else {
      $state.go('app.registry_lookup');
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
          if (hit._source.category && hit._source.category.id){
            $scope.category = categories[hit._source.category.id];
          }
          $scope.id= hit._id;
          if (hit._source.pictures) {
            $scope.pictures = hit._source.pictures.reduce(function(res, pic) {
              return res.concat({src: pic.src});
            }, []);
          }
          $scope.canEdit = !$scope.isLogged() || ($scope.formData && $scope.formData.issuer == Wallet.getData().pubkey);

          $scope.isCompany = $scope.category.id == 'particulier';
          if (!$scope.isCompany) {
            BMA.wot.lookup({ search: $scope.formData.issuer })
              .then(function(res){
                $scope.identity = res.results.reduce(function(idties, res) {
                  return idties.concat(res.uids.reduce(function(uids, idty) {
                    return uids.concat({
                      uid: idty.uid,
                      pub: res.pubkey,
                      timestamp: idty.meta.timestamp,
                      sig: idty.self
                    });
                  }, []));
                }, [])[0];
                $scope.hasSelf = ($scope.identity.uid && $scope.identity.timestamp && $scope.identity.sig);
                UIUtils.loading.hide();
              })
              .catch(function(err) {
                if (err && err.ucode == 2001) {
                  $scope.identity = {
                    pub: $scope.formData.issuer
                  };
                  $scope.hasSelf = false;
                  UIUtils.loading.hide();
                }
                else {
                  UIUtils.onError('ERROR.WOT_LOOKUP_FAILED')(err);
                }
              });
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
    ]).catch(UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED'));
  };

  // Edit click
  $scope.edit = function() {
    UIUtils.loading.show();
    $state.go('app.registry_edit_record', {id: $scope.id});
  };

  // Certify click
  $scope.certifyIdentity = function(identity) {
    $scope.loadWallet()
    .then(function(walletData) {
      UIUtils.loading.show();
      Wallet.certify($scope.identity.uid,
                  $scope.identity.pub,
                  $scope.identity.timestamp,
                  $scope.identity.sig)
      .then(function() {
        UIUtils.loading.hide();
        UIUtils.alert.info('INFO.CERTIFICATION_DONE');
      })
      .catch(UIUtils.onError('ERROR.SEND_CERTIFICATION_FAILED'));
    })
    .catch(UIUtils.onError('ERROR.LOGIN_FAILED'));
  };

}

function RegistryRecordEditController($scope, $ionicModal, Wallet, Registry, UIUtils, $state, CryptoUtils, $q, $ionicPopup, $translate, Device,
  $ionicHistory, ModalUtils, UserService) {
  'ngInject';

  $scope.walletData = {};
  $scope.formData = {};
  $scope.recordForm = {};
  $scope.type = null;
  $scope.id = null;
  $scope.isMember = false;
  $scope.category = {};
  $scope.pictures = [];

  $scope.setForm =  function(recordForm) {
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
          $scope.formData = hit._source;
          if (hit._source.category && hit._source.category.id){
            $scope.category = categories[hit._source.category.id];
          }
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
    .catch(UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED'));
  };

  $scope.save = function() {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      $scope.formData.pictures = $scope.pictures.reduce(function(res, pic) {
        return res.concat({src: pic.src});
      }, []);
      if (!$scope.id) { // Create
          Registry.record.add($scope.formData)
          .then(function(id) {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: id});
            resolve();
          })
          .catch(UIUtils.onError('REGISTRY.ERROR.SAVE_RECORD_FAILED'));
      }
      else { // Update
          Registry.record.update($scope.formData, {id: $scope.id})
          .then(function() {
            UIUtils.loading.hide();
            $state.go('app.registry_view_record', {id: $scope.id});
            resolve();
          })
          .catch(UIUtils.onError('REGISTRY.ERROR.SAVE_RECORD_FAILED'));
      }
    });
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

  $scope.cancel = function() {
    $ionicHistory.goBack();
  };

  /* -- modals -- */
  $scope.showCategoryModal = function(parameters) {
    // load categories
    Registry.category.all()
    .then(function(result){
      // open modal
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
             {categories: result}, {focusFirstInput: true})
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.category = cat;
        $scope.formData.category= cat.id;
      }
    });
  };
}
