
angular.module('cesium.es.network.services', ['ngApi', 'cesium.es.http.services'])

.factory('esNetwork', function($rootScope, $q, $interval, $timeout, $window, csSettings, csConfig, esHttp, Api, BMA) {
  'ngInject';

  function EsNetwork(id) {

    var
      interval,
      constants = {
        UNKNOWN_BUID: -1
      },
      isHttpsMode = $window.location.protocol === 'https:',
      api = new Api(this, "csNetwork-" + id),

      data = {
        pod: null,
        listeners: [],
        loading: true,
        peers: [],
        filter: {
          endpointFilter: null,
          online: true,
          ssl: undefined,
          tor: undefined
        },
        sort:{
          type: null,
          asc: true,
          compact: true
        },
        groupBy: 'pubkey',
        expertMode: false,
        knownBlocks: [],
        mainBlock: null,
        searchingPeersOnNetwork: false,
        timeout: csConfig.timeout
      },

      // Return the block uid
      buid = function(block) {
        return block && [block.number, block.hash].join('-');
      },

      resetData = function() {
        data.pod = null;
        data.listeners = [];
        data.peers.splice(0);
        data.filter = {
          endpointFilter: null,
          online: true
        };
        data.sort = {
          type: null,
          asc: true
        };
        data.groupBy = 'pubkey';
        data.expertMode = false;
        data.knownBlocks = [];
        data.mainBlock = null;
        data.loading = true;
        data.searchingPeersOnNetwork = false;
        data.timeout = csConfig.timeout;

        data.document = {
          index : csSettings.data.plugins.es && csSettings.data.plugins.es.document && csSettings.data.plugins.es.document.index || 'user',
          type: csSettings.data.plugins.es && csSettings.data.plugins.es.document && csSettings.data.plugins.es.document.type || 'profile'
        };
      },

      hasPeers = function() {
        return data.peers && data.peers.length > 0;
      },

      getPeers = function() {
        return data.peers;
      },

      isBusy = function() {
        return data.loading;
      },

      getKnownBlocks = function() {
        return data.knownBlocks;
      },

      loadPeers = function() {
        data.peers = [];
        data.searchingPeersOnNetwork = true;
        data.loading = true;
        data.pod = data.pod || esHttp;
        var newPeers = [];

        if (interval) {
          $interval.cancel(interval);
        }

        interval = $interval(function() {
          // not same job instance
          if (newPeers.length) {
            flushNewPeersAndSort(newPeers);
          }
          else if (data.loading && !data.searchingPeersOnNetwork) {
            data.loading = false;
            $interval.cancel(interval);
            // The peer lookup end, we can make a clean final report
            sortPeers(true/*update main buid*/);

            console.debug('[network] Finish: {0} peers found.'.format(data.peers.length));
          }
        }, 1000);

        return $q.when()
          .then(function(){
            // online nodes
            if (data.filter.online) {
              return data.pod.network.peers()
                .then(function(res){
                  var jobs = [];
                  _.forEach(res.peers, function(json) {
                    if (json.status !== 'UP') return;
                    jobs.push(addOrRefreshPeerFromJson(json, newPeers));
                  });

                  if (jobs.length) return $q.all(jobs);
                })
                .catch(function(err) {
                  // Log and continue
                  console.error(err);
                });
            }

            // offline nodes
            return data.pod.network.peers()
              .then(function(res){
                var jobs = [];
                _.forEach(res.peers, function(json) {
                  if (json.status === 'UP') return;
                  jobs.push(addOrRefreshPeerFromJson(json, newPeers));
                });
                if (jobs.length) return $q.all(jobs);
              });
          })
          .then(function(){
            data.searchingPeersOnNetwork = false;
          })
          .catch(function(err){
            console.error(err);
            data.searchingPeersOnNetwork = false;
          });
      },

      /**
       * Apply filter on a peer. (peer uid should have been filled BEFORE)
       */
      applyPeerFilter = function(peer) {
        // no filter
        if (!data.filter) return true;

        // Filter on endpoints
        if (data.filter.endpointFilter &&
          (peer.ep && peer.ep.api && peer.ep.api !== data.filter.endpointFilter || !peer.hasEndpoint(data.filter.endpointFilter))) {
          return false;
        }

        // Filter on status
        if (!data.filter.online && peer.status === 'UP') {
          return false;
        }

        // Filter on ssl
        if (angular.isDefined(data.filter.ssl) && peer.isSsl() != data.filter.ssl) {
          return false;
        }

        // Filter on tor
        if (angular.isDefined(data.filter.tor) && peer.isTor() != data.filter.tor) {
          return false;
        }

        return true;
      },

      addOrRefreshPeerFromJson = function(json, list) {
        list = list || data.newPeers;

        var peers = createPeerEntities(json);
        var hasUpdates = false;

        var jobs = peers.reduce(function(jobs, peer) {
            var existingPeer = _.findWhere(data.peers, {id: peer.id});
            var existingMainBuid = existingPeer ? existingPeer.buid : null;
            var existingOnline = existingPeer ? existingPeer.online : false;

            return jobs.concat(
              refreshPeer(peer)
                .then(function (refreshedPeer) {
                  if (existingPeer) {
                    // remove existing peers, when reject or offline
                    if (!refreshedPeer || (refreshedPeer.online !== data.filter.online && data.filter.online !== 'all')) {
                      var existingIndex = data.peers.indexOf(existingPeer);
                      if (existingIndex !== -1) {
                        console.debug('[network] Peer [{0}] removed (cause: {1})'.format(peer.server, !refreshedPeer ? 'filtered' : (refreshedPeer.online ? 'UP': 'DOWN')));
                        data.peers.splice(existingIndex, 1);
                        hasUpdates = true;
                      }
                    }
                    else if (refreshedPeer.buid !== existingMainBuid){
                      console.debug('[network] {0} endpoint [{1}] new current block'.format(
                        refreshedPeer.ep && refreshedPeer.ep.api || '',
                        refreshedPeer.server));
                      hasUpdates = true;
                    }
                    else if (existingOnline !== refreshedPeer.online){
                      console.debug('[network] {0} endpoint [{1}] is now {2}'.format(
                        refreshedPeer.ep && refreshedPeer.ep.api || '',
                        refreshedPeer.server,
                        refreshedPeer.online ? 'UP' : 'DOWN'));
                      hasUpdates = true;
                    }
                    else {
                      console.debug("[ES] [network] {0} endpoint [{1}] unchanged".format(
                        refreshedPeer.ep && refreshedPeer.ep.api || '',
                        refreshedPeer.server));
                    }
                  }
                  else if (refreshedPeer && (refreshedPeer.online === data.filter.online || data.filter.online === 'all')) {
                    console.debug("[ES] [network] {0} endpoint [{1}] is {2}".format(
                      refreshedPeer.ep && refreshedPeer.ep.api || '',
                      refreshedPeer.server,
                      refreshedPeer.online ? 'UP' : 'DOWN'
                    ));
                    list.push(refreshedPeer);
                    hasUpdates = true;
                  }
                })
           );
        }, []);
        return (jobs.length === 1 ? jobs[0] : $q.all(jobs))
          .then(function() {
            return hasUpdates;
          });
      },

      createPeerEntities = function(json, ep) {
        if (!json) return [];
        var peer = new EsPeer(json);

        // Read endpoints
        if (!ep) {
          var endpointsAsString = peer.getEndpoints();
          if (!endpointsAsString) return []; // no BMA

          var endpoints = endpointsAsString.reduce(function (res, epStr) {
            var ep = esHttp.node.parseEndPoint(epStr);
            return ep ? res.concat(ep) : res;
          }, []);

          // recursive call, on each endpoint
          if (endpoints.length > 1) {
            return endpoints.reduce(function (res, ep) {
              return res.concat(createPeerEntities(json, ep));
            }, []);
          }
          else {
            // if only one endpoint: use it and continue
            ep = endpoints[0];
          }
        }
        peer.ep = ep;
        peer.server = peer.getServer();
        peer.dns = peer.getDns();
        peer.blockNumber = peer.block && peer.block.replace(/-.+$/, '');
        peer.id = peer.keyID();
        return [peer];
      },

      refreshPeer = function(peer) {

        // Apply filter
        if (!applyPeerFilter(peer)) return $q.when();

        if (!data.filter.online || (!data.filter.online && peer.status === 'DOWN') || !peer.getHost() /*fix #537*/) {
          peer.online = false;
          return $q.when(peer);
        }

        // App running in SSL: Do not try to access not SSL node,
        if (isHttpsMode && !peer.isSsl()) {
          peer.online = (peer.status === 'UP');
          peer.buid = constants.UNKNOWN_BUID;
          delete peer.version;

          return $q.when(peer);
        }

        // Do not try to access TOR or WS2P endpoints
        if (peer.ep.useTor) {
          peer.online = (peer.status == 'UP');
          peer.buid = constants.UNKNOWN_BUID;
          delete peer.software;
          delete peer.version;
          return $q.when(peer);
        }

        peer.api = peer.api ||  esHttp.lightInstance(peer.getHost(), peer.getPort(), peer.isSsl(), data.timeout);

        // Get current block
        return peer.api.blockchain.current()
          .then(function(block) {
            peer.currentNumber = block.number;
            peer.online = true;
            peer.buid = buid(block);
            peer.medianTime = block.medianTime;
            if (data.knownBlocks.indexOf(peer.buid) === -1) {
              data.knownBlocks.push(peer.buid);
            }
            return peer;
          })
          .catch(function(err) {
            // Special case for currency init (root block not exists): use fixed values
            if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) {
              peer.online = true;
              peer.buid = buid({number:0, hash: BMA.constants.ROOT_BLOCK_HASH});
              peer.difficulty  = 0;
              return peer;
            }
            if (!peer.secondTry) {
              var ep = peer.ep || peer.getEP();
              if (ep.dns && peer.server.indexOf(ep.dns) === -1) {
                // try again, using DNS instead of IPv4 / IPV6
                peer.secondTry = true;
                peer.api = esHttp.lightInstance(ep.dns, peer.getPort(), peer.isSsl(), data.timeout);
                return refreshPeer(peer); // recursive call
              }
            }

            peer.online=false;
            peer.currentNumber = null;
            peer.buid = null;
            return peer;
          })
          .then(function(peer) {
            // Exit if offline
            if (!data.filter.online || !peer || !peer.online) return peer;

            peer.docCount = {};

            return $q.all([
              // Get summary (software and version) - expert mode only
              !data.expertMode ? $q.when() : peer.api.node.summary()
                .then(function(res){
                  peer.software = res && res.duniter && res.duniter.software || undefined;
                  peer.version = res && res.duniter && res.duniter.version || '?';
                })
                .catch(function() {
                  peer.software = undefined;
                  peer.version = '?';
                }),

              // Count documents
              peer.api.record.count(data.document.index,data.document.type)
                .then(function(count){
                  peer.docCount.record = count;
                })
                .catch(function() {
                  peer.docCount.record = undefined;
                }),

              // Count email subscription
              peer.api.subscription.count({recipient: peer.pubkey, type: 'email'})
                .then(function(res){
                  peer.docCount.emailSubscription = res;
                })
                .catch(function() {
                  peer.docCount.emailSubscription = undefined; // continue
                })
            ]);

        })
        .then(function() {
          // Clean the instance
          delete peer.api;
          return peer;
        });
      },

      flushNewPeersAndSort = function(newPeers, updateMainBuid) {
        newPeers = newPeers || data.newPeers;
        if (!newPeers.length) return;
        var ids = _.map(data.peers, function(peer){
          return peer.id;
        });
        var hasUpdates = false;
        var newPeersAdded = 0;
        _.forEach(newPeers.splice(0), function(peer) {
          if (!ids[peer.id]) {
            data.peers.push(peer);
            ids[peer.id] = peer;
            hasUpdates = true;
            newPeersAdded++;
          }
        });
        if (hasUpdates) {
          console.debug('[network] Flushing {0} new peers...'.format(newPeersAdded));
          sortPeers(updateMainBuid);
        }
      },

      computeScoreAlphaValue = function(value, nbChars, asc) {
        if (!value) return 0;
        var score = 0;
        value = value.toLowerCase();
        if (nbChars > value.length) {
          nbChars = value.length;
        }
        score += value.charCodeAt(0);
        for (var i=1; i < nbChars; i++) {
          score += Math.pow(0.001, i) * value.charCodeAt(i);
        }
        return asc ? (1000 - score) : score;
      },

      sortPeers = function(updateMainBuid) {
        // Construct a map of buid, with peer count and medianTime
        var buids = {};
        _.forEach(data.peers, function(peer){
          if (peer.buid) {
            var buid = buids[peer.buid];
            if (!buid || !buid.medianTime) {
              buid = {
                buid: peer.buid,
                medianTime: peer.medianTime,
                count: 0
              };
              buids[peer.buid] = buid;
            }
            // If not already done, try to fill medianTime (need to compute consensusBlockDelta)
            else if (!buid.medianTime && peer.medianTime) {
              buid.medianTime = peer.medianTime;
            }
            if (buid.buid !== constants.UNKNOWN_BUID) {
              buid.count++;
            }
          }
        });
        // Compute pct of use, per buid
        _.forEach(_.values(buids), function(buid) {
          buid.pct = buid.count * 100 / data.peers.length;
        });
        var mainBlock = _.max(buids, function(obj) {
          return obj.count;
        });
        _.forEach(data.peers, function(peer){
          peer.hasMainConsensusBlock = peer.buid == mainBlock.buid;
          peer.hasConsensusBlock = peer.buid && !peer.hasMainConsensusBlock && buids[peer.buid].count > 1;
          if (peer.hasConsensusBlock) {
            peer.consensusBlockDelta = buids[peer.buid].medianTime - mainBlock.medianTime;
          }
        });
        data.peers = _.uniq(data.peers, false, function(peer) {
          return peer.id;
        });
        data.peers = _.sortBy(data.peers, function(peer) {
          var score = 0;
          if (data.sort.type) {
            var sortScore = 0;
            sortScore += (data.sort.type == 'name' ? computeScoreAlphaValue(peer.name, 10, data.sort.asc) : 0);
            sortScore += (data.sort.type == 'software' ? computeScoreAlphaValue(peer.software, 10, data.sort.asc) : 0);
            sortScore += (data.sort.type == 'api') &&
              ((peer.hasEndpoint('ES_SUBSCRIPTION_API') && (data.sort.asc ? 1 : -1) || 0) +
              (peer.hasEndpoint('ES_USER_API') && (data.sort.asc ? 0.01 : -0.01) || 0) +
              (peer.isSsl() && (data.sort.asc ? 0.75 : -0.75) || 0)) || 0;
            sortScore += (data.sort.type == 'doc_count' ? (peer.docCount ? (data.sort.asc ? (1000000000 - peer.docCount) : peer.docCount) : 0) : 0);
            score += (10000000000 * sortScore);
          }
          score += (1000000000 * (peer.online ? 1 : 0));
          score += (100000000  * (peer.hasMainConsensusBlock ? 1 : 0));
          score += (1000000    * (peer.hasConsensusBlock ? buids[peer.buid].pct : 0));
          if (data.expertMode) {
            score += (100     * (peer.difficulty ? (10000-peer.difficulty) : 0));
            score += (1       * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
          }
          else {
            score += (100     * (peer.uid ? computeScoreAlphaValue(peer.uid, 2, true) : 0));
            score += (1       * (!peer.uid ? computeScoreAlphaValue(peer.pubkey, 2, true) : 0));
          }
          return -score;
        });

        if (data.groupBy) {
          var previousPeer;
          data.peers.forEach(function(peer) {
            peer.compacted = (previousPeer && peer[data.groupBy] && peer[data.groupBy] === previousPeer[data.groupBy]);
            previousPeer = peer;
          });
        }

        // Raise event on new main block
        if (updateMainBuid && mainBlock && mainBlock.buid && (!data.mainBlock || data.mainBlock.buid !== mainBlock.buid)) {
          data.mainBlock = mainBlock;
          api.data.raise.mainBlockChanged(mainBlock);
        }

        // Raise event when changed
        api.data.raise.changed(data); // raise event
      },

      removeListeners = function() {
        _.forEach(data.listeners, function(remove){
          remove();
        });
        data.listeners = [];
      },

      addListeners = function() {
        data.listeners = [

          // Listen for new block
          data.pod.websocket.block().onListener(function(block) {
            if (!block || data.loading) return;
            var buid = [block.number, block.hash].join('-');
            if (data.knownBlocks.indexOf(buid) === -1) {
              console.debug('[network] Receiving block: ' + buid.substring(0, 20));
              data.knownBlocks.push(buid);
              // If first block: do NOT refresh peers (will be done in start() method)
              var skipRefreshPeers = data.knownBlocks.length === 1;
              if (!skipRefreshPeers) {
                data.loading = true;
                // We wait 2s when a new block is received, just to wait for network propagation
                $timeout(function() {
                  console.debug('[network] new block received by WS: will refresh peers');
                  loadPeers();
                }, 2000, false /*invokeApply*/);
              }
            }
          }),

          // Listen for new peer
          data.pod.websocket.peer().onListener(function(json) {
            if (!json || data.loading) return;
            var newPeers = [];
            addOrRefreshPeerFromJson(json, newPeers)
              .then(function(hasUpdates) {
                if (!hasUpdates) return;
                if (newPeers.length>0) {
                  flushNewPeersAndSort(newPeers, true);
                }
                else {
                  console.debug('[network] [ws] Peers updated received');
                  sortPeers(true);
                }
              });
          })
        ];
      },

      sort = function(options) {
        options = options || {};
        data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
        data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
        sortPeers(false);
      },

      start = function(pod, options) {
        options = options || {};
        return esHttp.ready()
          .then(function() {
            close();
            resetData();
            data.pod = pod || esHttp;
            data.filter = options.filter ? angular.merge(data.filter, options.filter) : data.filter;
            data.sort = options.sort ? angular.merge(data.sort, options.sort) : data.sort;
            data.expertMode = angular.isDefined(options.expertMode) ? options.expertMode : data.expertMode;
            data.timeout = angular.isDefined(options.timeout) ? options.timeout : csConfig.timeout;
            console.info('[ES] [network] Starting network from [{0}]'.format(data.pod.server));
            var now = Date.now();

            addListeners();

            return loadPeers()
              .then(function(peers){
                console.debug('[ES] [network] Started in '+(Date.now() - now)+'ms');
                return peers;
              });
          });
      },

      close = function() {
        if (data.pod) {
          console.info('[ES] [network-service] Stopping...');
          removeListeners();
          resetData();
        }
      },

      isStarted = function() {
        return !data.pod;
      },

      $q_started = function(callback) {
        if (!isStarted()) { // start first
          return start()
            .then(function() {
              return $q(callback);
            });
        }
        else {
          return $q(callback);
        }
      },

      getMainBlockUid = function() {
        return $q_started(function(resolve, reject){
          resolve (data.mainBuid);
        });
      },

      // Get peers on the main consensus blocks
      getTrustedPeers = function() {
        return $q_started(function(resolve, reject){
          resolve(data.peers.reduce(function(res, peer){
            return (peer.hasMainConsensusBlock && peer.uid) ? res.concat(peer) : res;
          }, []));
        });
      }
      ;

    // Register extension points
    api.registerEvent('data', 'changed');
    api.registerEvent('data', 'mainBlockChanged');
    api.registerEvent('data', 'rollback');

    return {
      id: id,
      data: data,
      start: start,
      close: close,
      hasPeers: hasPeers,
      getPeers: getPeers,
      sort: sort,
      getTrustedPeers: getTrustedPeers,
      getKnownBlocks: getKnownBlocks,
      getMainBlockUid: getMainBlockUid,
      loadPeers: loadPeers,
      isBusy: isBusy,
      // api extension
      api: api
    };
  };

  var service = new EsNetwork('default');

  service.instance = function(id) {
    return new EsNetwork(id);
  };

  return service;
});
