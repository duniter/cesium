angular.module('cesium.es.document.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.document_search', {
        url: "/data/search/:index/:type?q",
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

;

function ESDocumentLookupController($scope, $ionicPopover, $location, $timeout,
                                    csSettings, csWallet, UIUtils, esHttp, esDocument) {
  'ngInject';

  $scope.search = {
    loading: true,
    hasMore: true,
    text: undefined,
    index: 'invitation',
    type: 'certification',
    results: undefined,
    sort: 'time',
    asc: false
  };
  $scope.entered = false;
  $scope.searchTextId = 'documentSearchText';
  $scope.ionItemClass = 'item-border-large';
  $scope.defaultSizeLimit = UIUtils.screen.isSmall() ? 50 : 100;
  $scope.helptipPrefix = 'helptip-document';

  $scope.$on('$ionicView.enter', function(e, state) {

    if (!$scope.entered) {
      $scope.entered = true;
      $scope.search.index = state.stateParams && state.stateParams.index || $scope.search.index;
      $scope.search.type = state.stateParams && state.stateParams.type || $scope.search.type;
      $scope.search.text = state.stateParams && state.stateParams.q || $scope.search.text;

      $scope.search.last = !$scope.search.text;
      $scope.load();
    }
    $scope.expertMode = angular.isDefined($scope.expertMode) ? $scope.expertMode : !UIUtils.screen.isSmall() && csSettings.data.expertMode;
  });

  $scope.load = function(size, offset) {
    if ($scope.search.error) return;

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

    $scope.search.loading = true;

    var searchFn =  $scope.search.last ?
      esDocument.search(options) :
      esDocument.searchText($scope.search.text||'', options);
    return searchFn
      .then(function(res) {
        $scope.search.results = res.hits;
        $scope.search.total = res.total;
        $scope.search.took = res.took;

        UIUtils.loading.hide();
        $scope.search.loading = false;

        if (res.hits && res.hits.length > 0) {
          $scope.motion.show({selector: '.list .item.item-document'});
          $scope.search.hasMore = res.total > $scope.search.results.length;
        }
        else {
          $scope.search.hasMore = false;
        }

        $scope.$broadcast('$$rebind::rebind'); // notify binder
      })
      .catch(function(err) {
        $scope.search.results = [];
        $scope.search.loading = false;
        $scope.search.error = true;
        UIUtils.onError('DOCUMENT.ERROR.LOAD_DOCUMENTS_FAILED')(err)
          .then(function() {
            $scope.search.error = false;
          });
      });
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

  $scope.remove = function(index) {
    var doc = $scope.search.results[index];
    if (!doc) return;

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

  /* -- Modals -- */

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    if (!$scope.actionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/document/lookup_popover_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.actionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.actionsPopover.remove();
        });
        $scope.actionsPopover.show(event);
      });
    }
    else {
      $scope.actionsPopover.show(event);
    }
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };

  /* -- watch events -- */

  // Watch unauth
  $scope.onUnauth = function() {
    // Reset all data
    $scope.search.results = undefined;
    $scope.search.loading = false;
    $scope.entered = false;
  };
  csWallet.api.data.on.unauth($scope, $scope.onUnauth);

  // for DEV only
  /*$timeout(function() {
    // launch default action fo DEV
   }, 900);
   */
}
