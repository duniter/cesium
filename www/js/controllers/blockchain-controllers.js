
angular.module('cesium.blockchain.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.blockchain', {
        url: "/blockchain",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/lookup.html",
            controller: 'BlockLookupCtrl'
          }
        },
        data: {
          large: 'app.blockchain_lg'
        }
      })

      .state('app.blockchain_lg', {
        url: "/blockchain/lg",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/lookup_lg.html",
            controller: 'BlockLookupCtrl'
          }
        }
      })

      .state('app.view_currency_block_hash', {
        url: "/:currency/block/:number/:hash",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      })

      .state('app.view_block', {
        url: "/block/:number",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      })

      .state('app.view_block_hash', {
        url: "/block/:number/:hash",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/view_block.html",
            controller: 'BlockViewCtrl'
          }
        }
      });
  })

  .controller('BlockLookupCtrl', BlockLookupController)

  .controller('BlockViewCtrl', BlockViewController)

;

function BlockLookupController($scope, $timeout, $focus, $filter, $state, $anchorScroll, UIUtils, BMA, csCurrency, csWot, csSettings) {
  'ngInject';

  $scope.search = {
    result: [],
    total: 0,
    loading: true,
    loadingMore: false,
    hasMore: false,
    type: 'last'
  };
  $scope.currency = false;
  $scope.entered = false;
  $scope.searchTextId = null;
  $scope.ionItemClass = 'item-border-large';
  $scope.defaultSizeLimit = UIUtils.screen.isSmall() ? 50 : 100;

  /**
   * Enter into the view
   * @param e
   * @param state
   */
  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      if (state && state.stateParams && state.stateParams.q) { // Query parameter
        $scope.search.text = state.stateParams.q;
        if ($scope.search.text && $scope.search.text .trim().length) {
          $scope.search.type='text';
        }
      }
      if (state && state.stateParams && state.stateParams.currency) { // Currency parameter
        $scope.currency = state.stateParams.currency;
      }
      // Load currency if need
      if (!$scope.currency) {
        csCurrency.default()
          .then(function(currency) {
            $scope.currency = currency ? currency.name : null;
            $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
              BMA.instance(currency.peer.host, currency.peer.port) : BMA;

            if (!$scope.currency) {
              UIUtils.alert.error('ERROR.GET_CURRENCY_FAILED');
              return;
            }
            $scope.enter(); // back to enter()
          })
          .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
        return;
      }

      $scope.compactMode = angular.isDefined($scope.compactMode) ? $scope.compactMode : true;
      $scope.expertMode = angular.isDefined($scope.expertMode) ? $scope.expertMode : !UIUtils.screen.isSmall() && csSettings.data.expertMode;

      $scope.doSearch();

      // removeIf(device)
      // Focus on search text (only if NOT device, to avoid keyboard opening)
      if ($scope.searchTextId) {
        $timeout(function(){
          $focus($scope.searchTextId);
        }, 100);
      }
      // endRemoveIf(device)

      $scope.startListenBlock();

      $scope.entered = true;

      $scope.showHelpTip();
    }
    else {
      $scope.startListenBlock();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

  /**
   * Leave the view
   * @param e
   * @param state
   */
  $scope.leave = function() {
    if ($scope.wsBlock) {
      console.info('[block] Stopping websocket on block');
      $scope.wsBlock.close();
      delete $scope.wsBlock;
    }
  };
  $scope.$on('îoncView.leave', $scope.leave);
  $scope.$on('$ionicParentView.leave', $scope.leave);
  $scope.$on('$destroy', $scope.leave);

  $scope.doSearchLast = function() {
    $scope.search.type = 'last';
    return $scope.doSearch();
  };

  $scope.doSearch = function(from) {
    from = angular.isDefined(from) ? from : 0;

    $scope.search.loading = (from === 0);
    $scope.search.hasMore = false;

    var promise;

    // get blocks
    if (from === 0) {
      promise = $scope.node.blockchain.current()
        .then(function(current) {
          var size = current.number < $scope.defaultSizeLimit ? current.number : $scope.defaultSizeLimit;
          return $scope.node.blockchain.blocksSlice({count: size, from: current.number-size})
            .then(function(blocks) {
              blocks.splice(0,0,current);
              return blocks;
            });
        })
        .catch(function(err) {
          // Special case when block #0 not written yet
          if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
            return [];
          }
          throw err;
        });
    }
    else {
      var oldestNumber = $scope.search.results[$scope.search.results.length-1].number;
      var size = oldestNumber < $scope.defaultSizeLimit ? oldestNumber : $scope.defaultSizeLimit;
      promise = $scope.node.blockchain.blocksSlice({count: size, from: oldestNumber-size});
    }

    // process blocks
    return promise
      .then(function(blocks) {
        // If no result
        if (!blocks || !blocks.length) {
          $scope.doDisplayResult([], from, 0);
          $scope.search.loading = false;
          return;
        }

        // Transform to entities
        blocks = blocks.reduce(function(res, json){
          var block = new Block(json);
          block.cleanData(); // release arrays content
          return res.concat(block);
        }, []);

        // Order by number (desc)
        blocks = _.sortBy(blocks, function(b) {
          return -1 * b.number;
        });

        // Prepare then display results
        var total = ((from===0) ? blocks[0].number: $scope.search.results[0].number) + 1;
        return $scope.doPrepareResult(blocks, from)
          .then(function() {
            $scope.doDisplayResult(blocks, from, total);
            $scope.search.loading = false;
          });
      })

      .catch(function(err) {
        UIUtils.onError('BLOCKCHAIN.ERROR.SEARCH_BLOCKS_FAILED')(err);
        $scope.search.loading = false;
      });
  };

  $scope.doPrepareResult = function(blocks, offset) {
    offset = angular.isDefined(offset) ? offset : 0;

    if ($scope.search.type=='last') {

      var previousEmptyBlockDay;
      if (offset > 0 && $scope.search.results.length) {
        var lastBlock = $scope.search.results[$scope.search.results.length-1];
        previousEmptyBlockDay = lastBlock.empty ? lastBlock.day : undefined;
      }

      _.forEach(blocks, function(block, index){
        // If empty
        if (block.empty) {
          // compute the day
          var blockDay = $filter('formatDateShort')(block.medianTime);
          var notFirstEmpty = (index !== 0) || (offset !== 0);
          var previousNotEmptyOrSameDay = !previousEmptyBlockDay || (previousEmptyBlockDay == blockDay);
          block.compacted = notFirstEmpty && previousNotEmptyOrSameDay;
          previousEmptyBlockDay = blockDay;
        }
        else {
          previousEmptyBlockDay = undefined;
        }
      });
    }

    return csWot.extendAll(blocks, 'issuer');
  };

  $scope.doDisplayResult = function(res, offset, total) {
    if (!offset) {
      $scope.search.results = res || [];
    }
    else {
      $scope.search.results = $scope.search.results.concat(res);
    }
    $scope.search.hasMore = total && $scope.search.results.length < total;
    $scope.search.total = total;

    $scope.smallscreen = UIUtils.screen.isSmall();

    // Set Motion
    if (res && res.length) {
      $scope.motion.show({selector: '.list-blocks .item-block'});
    }

    $scope.$broadcast('$$rebind::rebind'); // notify binder
  };

  $scope.showMore = function() {
    var from = $scope.search.results ? $scope.search.results.length : 0;

    $scope.search.loadingMore = true;

    return $scope.doSearch(from)
      .then(function() {
        $scope.search.loadingMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      })
      .catch(function(err) {
        console.error(err);
        $scope.search.loadingMore = false;
        $scope.search.hasMore = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      });
  };

  $scope.startListenBlock = function() {
    if (!$scope.wsBlock) {
      console.info('[block] Starting websocket on block');
      $scope.wsBlock = $scope.node.websocket.block();
    }

    var showBlock = function(block){
      // Force rebind
      $scope.$broadcast('$$rebind::rebind');
      $scope.motion.show({selector: '#block-'+block.number});
    };

    $scope.wsBlock.on(function(json) {
      // Skip if still loading or if filter/sort is not the default (not last blocks)
      if ($scope.search.loading || !json || $scope.search.type != 'last' ||
        ($scope.search.sort && $scope.search.sort != 'desc')) return; // skip

      var block = new Block(json);
      block.cleanData(); // release arrays content

      // Make sure results is init
      $scope.search.results = $scope.search.results || [];

      if (!$scope.search.results.length) {
        console.debug('[ES] [blockchain] new block #{0} received (by websocket)'.format(block.number));
        // add it to result
        $scope.search.total++;
        $scope.search.results.push(block);

        // Prepare the new block, then show it
        $scope.doPrepareResult([block])
          .then(function() {
            return showBlock(block);
          });
      }
      else {
        // Find existing block, by number
        var existingBlock = _.findWhere($scope.search.results, {number: block.number});

        // replace existing block (fork could have replaced previous block)
        if (existingBlock) {
          if (existingBlock.hash != block.hash) {
            console.debug('[ES] [blockchain] block #{0} updated (by websocket)'.format(block.number));
            // Replace existing content
            angular.copy(block, existingBlock);
            // Prepare the new block, then show it
            $scope.doPrepareResult([block, $scope.search.results[1]])
              .then(function() {
                return showBlock(existingBlock);
              });
          }
        }
        else {
          console.debug('[ES] [blockchain] new block #{0} received (by websocket)'.format(block.number));
          // Insert at index 0
          $scope.search.total++;
          $scope.search.results.splice(0, 0, block);

          // Prepare the new block, then show it
          $scope.doPrepareResult([block, $scope.search.results[1]])
            .then(function() {
              return showBlock(block);
            });
        }
      }
    });
  };

  $scope.selectBlock = function(block) {
    if (block.compacted && $scope.compactMode) {
      $scope.toggleCompactMode();
      $timeout(function(){
        $anchorScroll('block-' + block.number);
      }, 900);
    }
    else {
      $state.go('app.view_block_hash', {number: block.number, hash: block.hash});
    }
  };

  $scope.toggleCompactMode = function() {
    $scope.compactMode = !$scope.compactMode;
    $scope.doDisplayResult($scope.search.results, 0, $scope.search.results.length);

    // Workaround to re-initialized the <ion-infinite-loop>
    if (!$scope.search.hasMore && $scope.search.results.length && $scope.search.type == 'last') {
      var lastBlock = $scope.search.results[$scope.search.results.length-1];
      if (lastBlock && lastBlock.number > 0) {
        $timeout(function() {
          $scope.search.hasMore = true;
        }, 500);
      }
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
    $scope.doSearch();
  };

  $scope.showHelpTip = function() {

  };
}


function BlockViewController($scope, $ionicPopover, $state, UIUtils, BMA, csCurrency, csWot, csSettings) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};
  $scope.compactMode = true; // TODO change to true

  /**
   * Enter on view
   */
  $scope.enter = function(e, state) {
    if (!$scope.loading) return; // call once

    $scope.currency = state && state.stateParams ? state.stateParams.currency : undefined;
    $scope.number = state && state.stateParams && angular.isDefined(state.stateParams.number) ? state.stateParams.number : 'current';
    $scope.hash = state && state.stateParams && state.stateParams.hash ? state.stateParams.hash : undefined;

    if (!$scope.currency) {
      csCurrency.default()
        .then(function (currency) {
          if (currency) {
            $scope.currency = currency.name;
            $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
              BMA.instance(currency.peer.host, currency.peer.port) : BMA;
            $scope.load();
          }
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
    }
    else {
      $scope.node = BMA;
      $scope.load();
    }
  };
  $scope.$on('$ionicView.enter', $scope.enter);

  /**
   * Leave the view
   */
  $scope.leave = function() {
    //console.debug("Leaving view peer...");
  };
  $scope.$on('$ionicParentView.beforeLeave', $scope.leave);

  $scope.load = function() {
    if (!$scope.number) return;

    var promise = $scope.number == 'current' ?
      $scope.node.blockchain.current() :
      $scope.node.blockchain.block({block: $scope.number});

    return  promise
      .then(function(json) {
        var block = new Block(json);
        block.parseData();
        if (!block || !angular.isDefined(block.number) || !block.hash) {
          $scope.loading = false;
          UIUtils.alert.error('ERROR.GET_BLOCK_FAILED');
          return;
        }
        if ($scope.hash && block.hash != $scope.hash) {
          $scope.loading = false;
          UIUtils.alert.error('ERROR.INVALID_BLOCK_HASH');
          return;
        }

        var users = [];
        if (block.joiners.length) {
          users = users.concat(block.joiners);
        }
        if (block.certifications.length) {
          users = block.certifications.reduce(function(res, cert) {
            cert.to = {
              pubkey: cert.to
            };
            cert.from = {
              pubkey: cert.from
            };
            return res.concat(cert.to , cert.from);
          }, users);
          block.certifications = _.groupBy(block.certifications, function(cert) {
            return cert.to.pubkey;
          });
        }
        if (block.transactions.length) {
          users = block.transactions.reduce(function(res, tx) {
            tx.issuers = tx.issuers.reduce(function(res, issuer) {
              return res.concat({pubkey: issuer});
            }, []);

            // Parse unlockConditions
            _.forEach(tx.outputs||[], function(output) {
              if (output.unlockCondition) {
                angular.merge(output, BMA.tx.parseUnlockCondition(output.unlockCondition));
              }
            });

            return res.concat(tx.issuers.concat(tx.outputs||[]));
          }, users);
        }

        var issuer = {pubkey: block.issuer};
        users.push(issuer);
        return csWot.extendAll(users)
          .then(function() {
            $scope.updateView({block: block, issuer: issuer});
          });
      })
      .catch(function(err) {
        $scope.loading = false;
        UIUtils.onError('ERROR.GET_BLOCK_FAILED')(err);
      });
  };

  $scope.updateView = function(data) {
    $scope.formData = data.block;
    //angular.copy(data.block, $scope.formData);
    $scope.issuer = data.issuer;
    $scope.loading = false;
  };

  $scope.toggleCompactMode = function() {
    $scope.compactMode = !$scope.compactMode;
  };

  /* -- popover -- */

  var paddingIndent = 10;

  $scope.toUnlockUIArray = function(unlockTreeItem, leftPadding, operator) {
    leftPadding = leftPadding || paddingIndent;

    // If operator (AND, OR)
    if (unlockTreeItem.children && (unlockTreeItem.type == 'AND' || unlockTreeItem.type == 'OR')) {
      return unlockTreeItem.children.reduce(function(res, child, index){
        if (child.children && index > 0) {
          // Add space between expression block
          res = res.concat({
            style: {
              'padding-left': leftPadding + 'px',
              'padding-top': '10px',
              'padding-bottom': '10px'
            },
            operator: unlockTreeItem.type
          });

          return res.concat($scope.toUnlockUIArray(child, leftPadding + paddingIndent));
        }
        return res.concat($scope.toUnlockUIArray(child, leftPadding + paddingIndent, index && unlockTreeItem.type));
      }, []);
    }

    return {
      style: {
        'padding-left': leftPadding + 'px'
      },
      operator: operator,
      type: unlockTreeItem.type,
      value: unlockTreeItem.value
    };
  };

  $scope.showUnlockConditionPopover = function(output, event) {
    if (!output.unlockTree) return;

    // Convert condition into UI array
    $scope.popoverData = $scope.popoverData || {};
    $scope.popoverData.unlockConditions = $scope.toUnlockUIArray(output.unlockTree);

    // Open popover
    if (!$scope.unlockConditionPopover) {
      $ionicPopover.fromTemplateUrl('templates/blockchain/unlock_condition_popover.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.unlockConditionPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.unlockConditionPopover.remove();
        });
        $scope.unlockConditionPopover.show(event);
      });
    }
    else {
      $scope.unlockConditionPopover.show(event);
    }
  };

  $scope.hideUnlockConditionsPopover = function() {
    if ($scope.unlockConditionPopover) {
      $scope.unlockConditionPopover.hide();
      if ($scope.popoverData) {
        delete $scope.popoverData.unlockConditions;
      }
    }
  };

  $scope.goState = function(stateName, stateParams) {
    $scope.hideUnlockConditionsPopover();
    $state.go(stateName, stateParams);
  };

  /* -- help tip -- */

  // Show help tip
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    index = csSettings.data.helptip.block;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    /*return helptipScope.startBlockTour(index, false)
     .then(function(endIndex) {
     helptipScope.$destroy();
     csSettings.data.helptip.block = endIndex;
     csSettings.store();
     });*/
  };
}

