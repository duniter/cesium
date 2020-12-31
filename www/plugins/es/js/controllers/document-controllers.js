angular.module('cesium.es.document.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.document_search', {
        url: "/data/search/:index/:type?q&sort",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/document/lookup.html",
            controller: 'ESDocumentLookupCtrl'
          }
        },
        data: {
          silentLocationChange: true
        }
      })
    ;
  })

  .controller('ESDocumentLookupCtrl', ESDocumentLookupController)

  .controller('ESLastDocumentsCtrl', ESLastDocumentsController)
;

function ESDocumentLookupController($scope, $ionicPopover, $location, $timeout,
                                    csSettings, csWallet, UIUtils, esHttp, esDocument) {
  'ngInject';

  $scope.search = $scope.search || {
    loading: true,
    hasMore: false,
    text: undefined,
    index: 'invitation',
    type: 'certification',
    results: [],
    sort: 'time',
    asc: false,
    loadingMore: false
  };
  $scope.entered = false;
  $scope.searchTextId = 'documentSearchText';
  $scope.ionItemClass = 'item-border-large';
  $scope.defaultSizeLimit = $scope.defaultSizeLimit || (UIUtils.screen.isSmall() ? 50 : 100);
  $scope.helptipPrefix = 'helptip-document';
  $scope.compactMode = angular.isDefined($scope.compactMode) ? $scope.compactMode : true;
  $scope._source = $scope._source || ["issuer", "hash", "time", "creationTime", "title", "message", "recipient",
    // Movement fields:
    "medianTime", "amount", "currency", "reference",
    // Pending fields:
    "pubkey", "uid", "blockNumber"
  ];
  $scope.showHeaders = angular.isDefined($scope.showHeaders) ? $scope.showHeaders : true;

  /**
   * Enter into the view
   * @param e
   * @param state
   */
  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      $scope.entered = true;
      $scope.search.index = state.stateParams && state.stateParams.index || $scope.search.index;
      $scope.search.type = state.stateParams && state.stateParams.type || $scope.search.type;
      $scope.search.text = state.stateParams && state.stateParams.q || $scope.search.text;
      $scope.search.sort = state.stateParams && state.stateParams.sort || $scope.search.sort;
      $scope.search.last = !$scope.search.text;
      $scope.load();
    }

    // Reload only if params changed (.e.g if comes from a graph click)
    else if (state.stateParams && state.stateParams.q && $scope.search.text !== state.stateParams.q) {
      $scope.search.text = state.stateParams && state.stateParams.q || $scope.search.text;
      $scope.search.last = !$scope.search.text;
      $scope.load();
    }
    $scope.expertMode = angular.isDefined($scope.expertMode) ? $scope.expertMode : !UIUtils.screen.isSmall() && csSettings.data.expertMode;
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.computeOptions = function(offset, size) {
    var options  = {
      index: $scope.search.index,
      type: $scope.search.type,
      from: offset || 0,
      size: size || $scope.defaultSizeLimit
    };

    // add sort
    if ($scope.search.sort) {
      options.sort = {};
      options.sort[$scope.search.sort] = (!$scope.search.asc ? "desc" : "asc");
    }
    else { // default sort
      options.sort = {time:'desc'};
    }

    // Included fields
    options._source = options._source || $scope._source;

    return options;
  };

  $scope.load = function(offset, size, silent) {
    if ($scope.search.error) return;

    var options = $scope.computeOptions(offset, size);

    $scope.search.loading = !silent;

    var searchFn =  $scope.search.last ?
      esDocument.search(options) :
      esDocument.searchText($scope.search.text||'', options);
    return searchFn
      .then(function(res) {
        if (!offset) {
          $scope.search.results = res.hits;
          $scope.search.took = res.took;
        }
        else {
          $scope.search.results = $scope.search.results.concat(res.hits);
        }
        $scope.search.total = res.total;

        UIUtils.loading.hide();
        $scope.search.loading = false;
        $scope.search.hasMore = res.hits && res.hits.length > 0 && res.total > $scope.search.results.length;

        $scope.updateView();
      })
      .catch(function(err) {
        $scope.search.results = [];
        $scope.search.loading = false;
        $scope.search.error = true;
        $scope.search.hasMore = false;
        UIUtils.onError('DOCUMENT.ERROR.LOAD_DOCUMENTS_FAILED')(err)
          .then(function() {
            $scope.search.error = false;
          });
      });
  };

  $scope.updateView = function() {
    if ($scope.motion && $scope.search.results && $scope.search.results.length) {
      $scope.motion.show({selector: '.list .item.item-document'});
    }
    $scope.$broadcast('$$rebind::rebind'); // notify binder
  };

  $scope.doSearchText = function() {
    $scope.search.last = $scope.search.text ? false : true;
    return $scope.load()
      .then(function() {
        // Update location href
        $location.search({q: $scope.search.text}).replace();
      });
  };

  $scope.doSearchLast = function() {
    $scope.search.last = true;
    $scope.search.text = undefined;
    return $scope.load();
  };

  $scope.removeAll = function() {
    $scope.hideActionsPopover();
    if (!$scope.search.results || !$scope.search.results.length) return;

    return UIUtils.alert.confirm('DOCUMENT.CONFIRM.REMOVE_ALL')
      .then(function(confirm) {
        if (!confirm) return;
        UIUtils.loading.show();
        return esDocument.removeAll($scope.search.results)
          .then(function() {
            $scope.search.loading = false;
            return $timeout(function() {
              UIUtils.toast.show('DOCUMENT.INFO.REMOVED'); // toast
              return $scope.load();
            }, 1000 /*waiting propagation*/);
          })
          .catch(UIUtils.onError('DOCUMENT.ERROR.REMOVE_ALL_FAILED'));
      });
  };

  $scope.remove = function($event, index) {
    var doc = $scope.search.results[index];
    if (!doc || $event.defaultPrevented) return;
    $event.stopPropagation();

    UIUtils.alert.confirm('DOCUMENT.CONFIRM.REMOVE')
      .then(function(confirm) {
        if (!confirm) return;
        return esDocument.remove(doc)
          .then(function () {
            $scope.search.results.splice(index,1); // remove from messages array
            $scope.$broadcast('$$rebind::rebind'); // notify binder
            UIUtils.toast.show('DOCUMENT.INFO.REMOVED'); // toast
          })
          .catch(UIUtils.onError('MESSAGE.ERROR.REMOVE_FAILED'));
      });
  };

  $scope.selectDocument = function(event, doc) {
    console.debug("Selected document: ", doc, esHttp);

    var url = esHttp.getUrl('/{0}/{1}/_search?pretty&q=_id:{2}'.format(doc.index, doc.type, doc.id));
    return $scope.openLink(event, url);
  };

  $scope.toggleCompactMode = function() {
    $scope.compactMode = !$scope.compactMode;
    $scope.updateView();

    // Workaround to re-initialized the <ion-infinite-loop>
    if (!$scope.search.hasMore && $scope.search.results.length && $scope.search.type == 'last') {
      $timeout(function() {
        $scope.search.hasMore = true;
      }, 500);
    }
  };

  $scope.toggleSort = function(sort){
    if ($scope.search.sort === sort && !$scope.search.asc) {
      $scope.search.asc = undefined;
      $scope.search.sort = undefined;
    }
    else {
      $scope.search.asc = ($scope.search.sort === sort) ? !$scope.search.asc : true;
      $scope.search.sort = sort;
    }
    $scope.load();
  };

  $scope.showMore = function() {
    if ($scope.search.loading) return;
    $scope.search.loadingMore = true;
    $scope.load(
      $scope.search.results.length, // from
      $scope.defaultSizeLimit,
      true/*silent*/)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.startListenChanges = function() {
    var now = Date.now();
    var source = $scope.search.index + '/' + $scope.search.type;
    var wsChanges = esHttp.websocket.changes(source);
    return wsChanges.open()
      .then(function(){
        console.debug("[ES] [document] Websocket opened in {0} ms".format(Date.now()- now));
        wsChanges.on(function(change) {
          if (!$scope.search.last || !change) return; // ignore
          esDocument.fromHit(change)
            .then(function(doc) {
              if (change._operation === 'DELETE') {
                $scope.onDeleteDocument(doc);
              }
              else {
                $scope.onNewDocument(doc);
              }
            });
        });
      });
  };

  $scope.onNewDocument = function(document) {
    if (!$scope.search.last || $scope.search.loading) return; // skip
    console.debug("[ES] [document] Detected new document: ", document);
    var index = _.findIndex($scope.search.results, {id: document.id, index: document.index, type: document.type});
    if (index < 0) {
      $scope.search.total++;
      $scope.search.results.splice(0, 0, document);
    }
    else {
      document.updated = true;
      $timeout(function() {
        document.updated = false;
      }, 2000);
      $scope.search.results.splice(index, 1, document);
    }
    $scope.updateView();
  };

  $scope.onDeleteDocument = function(document) {
    if (!$scope.search.last || $scope.search.loading) return; // skip
    $timeout(function() {
      var index = _.findIndex($scope.search.results, {id: document.id, index: document.index, type: document.type});
      if (index < 0) return; // skip if not found
      console.debug("[ES] [document] Detected document deletion: ", document);
      $scope.search.results.splice(index, 1);
      $scope.search.total--;
      $scope.updateView();
    }, 750);
  };

  /* -- Modals -- */

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    UIUtils.popover.show(event, {
      templateUrl: 'plugins/es/templates/document/lookup_popover_actions.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.actionsPopover = popover;
      }
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
      $scope.actionsPopover = null;
    }
  };

  /* -- watch events -- */

  $scope.resetData = function() {
    if ($scope.search.loading) return;
    console.debug("[ES] [document] Resetting data (settings or account may have changed)");
    // Reset all data
    $scope.search.results = [];
    $scope.search.loading = false;
    $scope.search.total = undefined;
    $scope.search.loadingMore = false;
    $scope.entered = false;
    delete $scope.search.limit;
  };

  csWallet.api.data.on.unauth($scope, $scope.resetData);

  // for DEV only
  /*$timeout(function() {
    // launch default action fo DEV
   }, 900);
   */
}


function ESLastDocumentsController($scope, $controller, $timeout, $state, $filter) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESDocumentLookupCtrl', {$scope: $scope}));

  $scope.search = {
    loading: true,
    hasMore: true,
    text: undefined,
    index: 'user,page,group', type: 'profile,record,comment',
    results: undefined,
    sort: 'time',
    asc: false
  };
  $scope.expertMode = false;
  $scope.defaultSizeLimit = 20;
  $scope._source = ["issuer", "hash", "time", "creationTime", "title", "avatar._content_type", "city", "message", "record", "type"];
  $scope.showHeaders = false;

  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.selectDocument = function(event, doc) {
    if (!doc || !event || event.defaultPrevented) return;
    event.stopPropagation();
    var anchor;
    if (doc.index === "user" && doc.type === "profile") {
      $state.go('app.wot_identity', {pubkey: doc.pubkey, uid: doc.name});
    }
    else if (doc.index === "page" && doc.type === "record") {
      $state.go('app.view_page', {title: doc.title, id: doc.id});
    }
    else if (doc.index === "page" && doc.type === "comment") {
      anchor = $filter('formatHash')(doc.id);
      $state.go('app.view_page_anchor', {title: doc.title, id: doc.record, anchor: anchor});
    }
    else if (doc.index === "group" && doc.type === "record") {
      $state.go('app.view_group', {title: doc.title, id: doc.id});
    }
    else if (doc.index === "group" && doc.type === "comment") {
      anchor = $filter('formatHash')(doc.id);
      $state.go('app.view_group_anchor', {title: doc.title, id: doc.record, anchor: anchor});
    }
    else {
      console.warn("Click on this kind of document not implement yet!", doc);
    }
  };

  // Override parent function computeOptions
  var inheritedComputeOptions = $scope.computeOptions;
  $scope.computeOptions = function(offset, size){
    // Cal inherited function
    var options = inheritedComputeOptions(offset, size);

    if (!options.sort || options.sort.time) {
      var side = options.sort && options.sort.time || side;
      options.sort = [
        //{'creationTime': side},
        {'time': side}
      ];
    }

    options._source = options._source || $scope._source;

    options.getTimeFunction = function(doc) {
      doc.time = doc.creationTime || doc.time;
      return doc.time;
    };
    return options;
  };

  // Listen for changes
  $timeout(function() {
    $scope.startListenChanges();
  }, 1000);
}
