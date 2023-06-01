
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

      .state('app.server_blockchain', {
        url: "/network/peer/:server/blockchain?ssl&tor&path",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/lookup.html",
            controller: 'BlockLookupCtrl'
          }
        },
        data: {
          large: 'app.server_blockchain_lg'
        }
      })

      .state('app.server_blockchain_lg', {
        url: "/network/peer/:server/blockchain/lg?ssl&tor&path",
        views: {
          'menuContent': {
            templateUrl: "templates/blockchain/lookup_lg.html",
            controller: 'BlockLookupCtrl'
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
      })

      .state('app.view_server_block_hash', {
        url: "/network/peer/:server/block/:number/:hash?ssl&tor&path",
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
  $scope.node = {};
  $scope.currency = false;
  $scope.entered = false;
  $scope.searchTextId = null;
  $scope.ionItemClass = 'item-border-large';
  $scope.defaultSizeLimit = UIUtils.screen.isSmall() ? 50 : 100;
  $scope.helptipPrefix = 'helptip-network';
  $scope.listeners = [];

  /**
   * Enter into the view
   * @param e
   * @param state
   */
  $scope.enter = function(e, state) {
    if (!$scope.entered) {
      if (state && state.stateParams && state.stateParams.q) { // Query parameter
        $scope.search.text = state.stateParams.q;
        if ($scope.search.text && $scope.search.text.trim().length) {
          $scope.search.type='text';
        }
      }

      // Load from server if need
      if (state && state.stateParams && state.stateParams.server) {
        var useSsl = state.stateParams.ssl == "true";
        var useTor = state.stateParams.tor == "true";
        var path = state.stateParams.path || '';

        var node = {
          server: state.stateParams.server,
          host: state.stateParams.server,
          path: path,
          useSsl: useSsl,
          useTor: useTor
        };
        var serverParts = state.stateParams.server.split(':', 2);
        if (serverParts.length === 2) {
          node.host = serverParts[0];
          node.port = serverParts[1];
        }
        else {
          node.port = node.port || (node.useSsl ? 443 : 80);
        }

        if (BMA.node.same(node)) {
          $scope.node = BMA;
        }
        else {
          $scope.node = useTor ?
              // For TOR, use a web2tor to access the endpoint
              BMA.instance(node.host + ".to", 443, node.path, true/*ssl*/, 600000 /*long timeout*/) :
              BMA.instance(node.host, node.port, node.path, node.useSsl);
          return $scope.node.blockchain.parameters()
            .then(function(json) {
              $scope.currency = json.currency;
              $scope.enter(); // back to enter()
            });
        }
      }

      // Load currency if need
      if (!$scope.currency) {
        return csCurrency.get()
          .then(function(currency) {
            $scope.currency = currency ? currency.name : null;
            $scope.node = currency.node ? currency.node : BMA;

            if (!$scope.currency) {
              UIUtils.alert.error('ERROR.GET_CURRENCY_FAILED');
              return;
            }
            $scope.enter(); // back to enter(), with no stateParams
          })
          .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
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

      $scope.addListeners();

      $scope.entered = true;

      $scope.showHelpTip();
    }
    else {
      $scope.addListeners();
    }
  };
  //$scope.$on('$ionicView.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);


  /**
   * Leave the view
   * @param e
   * @param state
   */
  $scope.leave = function() {
    $scope.removeListeners();
  };
  //$scope.$on('$ionicView.leave', $scope.leave);
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
      promise = $scope.node.blockchain.current(false)
        .then(function(current) {
          var size = current.number < $scope.defaultSizeLimit ? current.number : $scope.defaultSizeLimit;
          return $scope.node.blockchain.blocksSlice({count: size, from: current.number-size})
            .then(function(blocks) {
              if (!!blocks) blocks.splice(0,0,current);
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

  var formatDateShort = $filter('formatDateShort');

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
          var blockDay = formatDateShort(block.medianTime);
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
    $scope.search.total = total || $scope.search.total;

    $scope.smallscreen = UIUtils.screen.isSmall();

    $scope.$broadcast('$$rebind::rebind'); // notify binder

    // Set Motion
    if (res && res.length) {
      $scope.motion.show({selector: '.list-blocks .item-block'});
    }
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

  $scope.removeListeners = function() {
    if ($scope.listeners.length) {
      console.debug("[block] Closing listeners");
      _.forEach($scope.listeners, function(remove){
        remove();
      });
      $scope.listeners = [];
    }
  };

  $scope.addListeners = function() {
    if ($scope.listeners.length) return; // already started

    console.debug("[block] Starting listeners");
    if ($scope.node === BMA) {
      $scope.listeners = [
        csCurrency.api.data.on.newBlock($scope, $scope.onBlock)
      ];
    }
    else {
      $scope.listeners = [
        $scope.node.websocket.block().onListener(function(json) {
          // Skip if WS closed (after leave view - should never happen) or invalid json
          if (!json) return;
          var block = new Block(json);
          block.cleanData(); // Remove unused content (arrays...)
          $scope.onBlock(block);
        })
      ];
    }
  };

  $scope.onBlock = function(block) {
    // Skip if still loading or if filter/sort is not the default (not last blocks)
    if ($scope.search.loading || $scope.search.type !== 'last' ||
      ($scope.search.sort && $scope.search.sort !== 'desc')) return; // skip

    // Make sure results is init
    $scope.search.results = $scope.search.results || [];

    if (!$scope.search.results.length) {
      console.debug('[blockchain] new block #{0} received (by websocket)'.format(block.number));
      // add it to result
      $scope.search.total++;
      $scope.search.results.push(block);

      // Prepare the new block, then show it
      $scope.doPrepareResult([block])
        .then(function() {
          return $scope.showBlock(block);
        });
    }
    else {
      // Find existing block, by number
      var existingBlock = _.findWhere($scope.search.results, {number: block.number});

      // replace existing block (fork could have replaced previous block)
      if (existingBlock) {
        if (existingBlock.hash !== block.hash) {
          console.debug('[blockchain] block #{0} updated (by websocket)'.format(block.number));
          // Replace existing content
          angular.copy(block, existingBlock);
          // Prepare the new block, then show it
          $scope.doPrepareResult([block, $scope.search.results[1]])
            .then(function() {
              return $scope.showBlock(existingBlock);
            });
        }
      }
      else {
        console.debug('[blockchain] new block #{0} received (by websocket)'.format(block.number));
        // Insert at index 0
        $scope.search.total++;
        $scope.search.results.splice(0, 0, block);

        // Prepare the new block, then show it
        $scope.doPrepareResult([block, $scope.search.results[1]])
          .then(function() {
            return $scope.showBlock(block);
          });
      }
    }
  };

  $scope.showBlock = function(block){
    // Force rebind
    $scope.$broadcast('$$rebind::rebind');
    $scope.motion.show({selector: '#block-'+block.number});
  };

  $scope.selectBlock = function(block) {
    if (block.compacted && $scope.compactMode) {
      $scope.toggleCompactMode();
      $timeout(function(){
        $anchorScroll('block-' + block.number);
      }, 900);
    }
    else if (BMA.node.same($scope.node)) {
      $state.go('app.view_block_hash', {number: block.number, hash: block.hash});
    }
    else {
      $state.go('app.view_server_block_hash', {server: $scope.node.server, ssl: $scope.node.useSsl, number: block.number, hash: block.hash});
    }
  };

  $scope.toggleCompactMode = function() {
    $scope.compactMode = !$scope.compactMode;
    $scope.doDisplayResult($scope.search.results, 0, $scope.search.total/*keep previous total*/);

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
    // TODO
  };
}


function BlockViewController($scope, $ionicPopover, $state, UIUtils, BMA, csCurrency, csWot) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = {};
  $scope.compactMode = true; // TODO change to true

  $scope.$on('$ionicView.beforeEnter', function (event, viewData) {
    // Enable back button (workaround need for navigation outside tabs - https://stackoverflow.com/a/35064602)
    viewData.enableBack = UIUtils.screen.isSmall() ? true : viewData.enableBack;
  });

  /**
   * Enter on view
   */
  $scope.enter = function(e, state) {
    if (!$scope.loading) return; // call once

    if (state) {
      $scope.number = state.stateParams && angular.isDefined(state.stateParams.number) ? state.stateParams.number : 'current';
      $scope.hash = state.stateParams && state.stateParams.hash ? state.stateParams.hash : undefined;

      // Load from server if need
      if (state.stateParams && state.stateParams.server) {
        var useSsl = state.stateParams.ssl == "true";
        var useTor = state.stateParams.tor == "true";
        var path = state.stateParams.path || '';

        var node = {
          server: state.stateParams.server,
          host: state.stateParams.server,
          path: path,
          useSsl: useSsl,
          useTor: useTor
        };
        var serverParts = state.stateParams.server.split(':', 2);
        if (serverParts.length == 2) {
          node.host = serverParts[0];
          node.port = serverParts[1];
        }
        else {
          node.port = node.port || (node.useSsl ? 443 : 80);
        }

        if (BMA.node.same(node)) {
          $scope.node = BMA;
        }
        else {
          $scope.node = useTor ?
            // For TOR, use a web2tor to access the endpoint
            BMA.instance(node.host + ".to", 443, node.path, true/*ssl*/, 600000 /*long timeout*/) :
            BMA.instance(node.host, node.port, node.path, node.useSsl);
          return $scope.node.blockchain.parameters()
            .then(function (json) {
              $scope.currency = json.currency;
              $scope.enter(); // back to enter(), with no stateParams
            });
        }
      }
    }

    if (!$scope.currency || !$scope.node) {
      csCurrency.get()
        .then(function (currency) {
          if (currency) {
            $scope.currency = currency.name;
            $scope.node = currency.node;
            $scope.load();
          }
        })
        .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
    }
    else {
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
    UIUtils.popover.show(event, {
      templateUrl: 'templates/blockchain/unlock_condition_popover.html',
      scope: $scope,
      autoremove: true,
      afterShow: function(popover) {
        $scope.unlockConditionPopover = popover;
      }
    });
  };

  $scope.hideUnlockConditionsPopover = function() {
    if ($scope.unlockConditionPopover) {
      $scope.unlockConditionPopover.hide();
      $scope.unlockConditionPopover = null;
    }
  };

  $scope.goState = function(stateName, stateParams) {
    $scope.hideUnlockConditionsPopover();
    $state.go(stateName, stateParams);
  };

  /* -- manage link to raw document -- */

  $scope.openRawBlock = function(event) {
    return $scope.openLink(event, $scope.node.url + '/blockchain/block/' + $scope.formData.number);
  };

  /* -- help tip -- */

  // Show help tip
  $scope.showHelpTip = function(index) {
    // No helptip here (done in network controller)
  };
}

