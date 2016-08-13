angular.module('cesium.es.registry.controllers', ['cesium.es.services', 'cesium.es.common.controllers'])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';

    $stateProvider

    .state('app.registry_lookup', {
      url: "/registry?q&category&location&type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/lookup.html",
          controller: 'ESRegistryLookupCtrl'
        }
      }
    })

   .state('app.registry_view_record', {
      url: "/registry/view/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/view_record.html",
          controller: 'ESRegistryRecordViewCtrl'
        }
      }
    })

    .state('app.registry_add_record', {
      cache: false,
      url: "/registry/add/:type",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      }
    })

    .state('app.registry_edit_record', {
      cache: false,
      url: "/registry/edit/:id/:title",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/registry/edit_record.html",
          controller: 'ESRegistryRecordEditCtrl'
        }
      }
    })
    ;
  })

 .controller('ESRegistryLookupCtrl', ESRegistryLookupController)

 .controller('ESRegistryRecordViewCtrl', ESRegistryRecordViewController)

 .controller('ESRegistryRecordEditCtrl', ESRegistryRecordEditController)

;

function ESRegistryLookupController($scope, $state, $focus, $q, $timeout, esRegistry, UIUtils, $sanitize, ModalUtils, $filter, BMA) {
  'ngInject';

  $scope.search = {
    text: '',
    results: [],
    lastRecords: true,
    type: null,
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
      if ($state.stateParams && $state.stateParams.q) {
        $scope.search.text=$state.stateParams.q;
        runSearch = true;
      }

      // Search on type
      if ($state.stateParams && $state.stateParams.type) {
        $scope.search.type = $state.stateParams.type;
        hasOptions = runSearch = true;
      }

      // Search on location
      if ($state.stateParams && $state.stateParams.location) {
        $scope.search.location = $state.stateParams.location;
        hasOptions = runSearch = true;
      }

      // Search on category
      if ($state.stateParams && $state.stateParams.category) {
        esRegistry.category.get($state.stateParams.category)
        .then(function(cat) {
          $scope.search.category = cat;
          hasOptions = runSearch = true;
          finishEntered();
        })
        .catch(UIUtils.onError("REGISTRY.ERROR.LOAD_CATEGORY_FAILED"));
      }
      else {
        finishEntered();
      }
    }
    $scope.showFab('fab-add-registry-record');
    $focus('registrySearchText');
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
          description : {}
        }
      },
      from: 0,
      size: 20,
      _source: esRegistry.record.fields.commons
    };
    var text = $scope.search.text.trim();
    var matches = [];
    var filters = [];
    if (text.length > 1) {
      // pubkey : use a special 'term', because of 'non indexed' field
      if (BMA.regex.PUBKEY.test(text /*case sensitive*/)) {
        matches = [];
        filters.push({term : { issuer: text}});
        filters.push({term : { pubkey: text}});
      }
      else {
        text = text.toLowerCase();
        var matchFields = ["title", "description", "city", "address"];
        matches.push({multi_match : { query: text,
          fields: matchFields,
          type: "phrase_prefix"
        }});
        matches.push({match : { title: text}});
        matches.push({match : { description: text}});
        matches.push({prefix : { city: text}});
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
    if ($scope.search.options && $scope.search.type) {
      filters.push({term: { type: $scope.search.type}});
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
      filters.push({match_phrase: { city: $scope.search.location}});
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
      _source: esRegistry.record.fields.commons
    };

    $scope.doRequest(request);
  };

  $scope.doRequest = function(request) {
    $scope.search.looking = true;

    esRegistry.category.all()
      .then(function(categories) {
        esRegistry.record.search(request)
          .then(function(res){
            if (res.hits.total === 0) {
              $scope.search.results = [];
            }
            else {
              var formatSlug = $filter('formatSlug')
              var records = res.hits.hits.reduce(function(result, hit) {
                  var record = hit._source;
                  record.id = hit._id;
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
  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/registry/modal_record_type.html', 'ESEmptyModalCtrl')
    .then(function(type){
      if (type) {
        $scope.search.type = type;
        $scope.doSearch();
      }
    });
  };

  $scope.showCategoryModal = function(parameters) {
    // load categories
    esRegistry.category.all()
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
        ModalUtils.show('plugins/es/templates/registry/modal_record_type.html', 'ESEmptyModalCtrl')
        .then(function(type){
          if (type) {
            $state.go('app.registry_add_record', {type: type});
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

function ESRegistryRecordViewController($scope, Wallet, esRegistry, UIUtils, $state, $q, BMA, $timeout, esHttp) {
  'ngInject';

  $scope.formData = {};
  $scope.id = null;
  $scope.category = {};
  $scope.pictures = [];
  $scope.canEdit = false;
  $scope.loading = true;

  ESCommentsController.call(this, $scope, Wallet, UIUtils, $q, $timeout, esHttp, esRegistry);

  $scope.$on('$ionicView.enter', function(e, $state) {
    if ($state.stateParams && $state.stateParams.id) { // Load by id
      if ($scope.loading) { // prevent reload if same id
        $scope.load($state.stateParams.id);
      }
    }
    else {
      $state.go('app.registry_lookup');
    }
  });

  $scope.load = function(id) {
    $q.all([
      esRegistry.category.all()
      .then(function(categories) {
        esRegistry.record.getCommons({id: id})
        .then(function (hit) {
          $scope.id= hit._id;
          $scope.formData = hit._source;
          if (hit._source.category && hit._source.category.id){
            $scope.category = categories[hit._source.category.id];
          }
          if (hit._source.thumbnail) {
            $scope.thumbnail = UIUtils.image.fromAttachment(hit._source.thumbnail);
          }
          else {
            delete $scope.thumbnail;
          }
          $scope.canEdit = Wallet.isUserPubkey($scope.formData.issuer);

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
            UIUtils.ink();
          }, 10);
          UIUtils.loading.hide();
          $scope.loading = false;
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
      }),

      // Load pictures
      esRegistry.record.picture.all({id: id})
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
          selector: '.card-gallery, .card-comment, .lazy-load .item'
        });
      }, 10);
    })
    .catch(function(err) {
      $scope.pictures = [];
      $scope.comments = [];
      UIUtils.onError('esRegistry.ERROR.LOAD_RECORD_FAILED')(err);
    });
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

function ESRegistryRecordEditController($scope, Wallet, esRegistry, UIUtils, $state, $q, $translate, Device,
  $ionicHistory, ModalUtils, $focus, $timeout) {
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
    $scope.loadWallet()
    .then(function(walletData) {
      $scope.walletData = walletData;
      if ($state.stateParams && $state.stateParams.id) { // Load by id
        $scope.load($state.stateParams.id);
      }
      else {
        if ($state.stateParams && $state.stateParams.type) {
          $scope.formData.type=$state.stateParams.type;
        }
        $scope.loading = false;
        UIUtils.loading.hide();
        UIUtils.motion.ripple();
      }
      $focus('registry-record-title');
    });
  });

  $scope.load = function(id) {
    esRegistry.category.all()
    .then(function(categories) {
      esRegistry.record.get({id: id})
      .then(function (hit) {
        $scope.formData = hit._source;
        $scope.id= hit._id;
        if (hit._source.category && hit._source.category.id){
          $scope.category = categories[hit._source.category.id];
        }
        if (hit._source.pictures && hit._source.pictures.reduce) {
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
      .catch(UIUtils.onError('REGISTRY.ERROR.LOAD_RECORD_FAILED'));
    })
    .catch(UIUtils.onError('REGISTRY.ERROR.LOAD_CATEGORY_FAILED'));
  };

  $scope.needCategory = function() {
    return $scope.formData.type && ($scope.formData.type=='company' || $scope.formData.type=='shop');
  };

  $scope.save = function() {
    $scope.form.$submitted=true;
    if(!$scope.form.$valid ||
       (!$scope.category.id &&
        ($scope.formData.type === 'shop' || $scope.formData.type === 'company'))) {
      return;
    }

    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      var doFinishSave = function(formData) {
        if (!$scope.needCategory()) {
          delete formData.category;
        }
        if (!$scope.id) { // Create
            esRegistry.record.add(formData)
            .then(function(id) {
              UIUtils.loading.hide();
              $state.go('app.registry_view_record', {id: id});
              resolve();
            })
            .catch(UIUtils.onError('REGISTRY.ERROR.SAVE_RECORD_FAILED'));
        }
        else { // Update
            esRegistry.record.update(formData, {id: $scope.id})
            .then(function() {
              UIUtils.loading.hide();
              $state.go('app.registry_view_record', {id: $scope.id});
              resolve();
            })
            .catch(UIUtils.onError('REGISTRY.ERROR.SAVE_RECORD_FAILED'));
        }
      }

      // Resize pictures
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
        if ($scope.formData.thumbnail) {
          // FIXME: this is a workaround to allow content deletion
          // Is it a bug in the ES attachment-mapper ?
          $scope.formData.thumbnail = {
            _content: ''
          };
        }
        $scope.formData.pictures = [];
        doFinishSave($scope.formData);
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
  $scope.showRecordTypeModal = function() {
    ModalUtils.show('plugins/es/templates/registry/modal_record_type.html', 'ESEmptyModalCtrl')
    .then(function(type){
      if (type) {
        $scope.formData.type = type;
      }
    });
  };


  $scope.showCategoryModal = function(parameters) {
    // load categories
    esRegistry.category.all()
    .then(function(result){
      // open modal
      return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
             {categories: result}, {focusFirstInput: true})
    })
    .then(function(cat){
      if (cat && cat.parent) {
        $scope.category = cat;
        $scope.formData.category = cat;
      }
    });
  };
}
