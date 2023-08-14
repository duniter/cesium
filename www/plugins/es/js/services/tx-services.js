angular.module('cesium.es.tx.services', ['ngResource', 'cesium.services', 'cesium.es.http.services', 'cesium.es.wot.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esTx');
    }

  })

  .factory('esTx', function($q, $rootScope, csPlatform, csCurrency, csTx, esHttp, esWot) {
    'ngInject';

    var
      listeners,
      raw = {
        block: {
          search: esHttp.post('/:currency/block/_search')
        }
      };

    function _powBase(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    }

    function onLoadUDs(options, deferred) {
      deferred = deferred || $q.defer();

      options = options || {};
      if (!options.pubkey) deferred.reject('Missing [pubkey] when calling [loadUDs] extension point');

      console.debug('[ES] [tx] Loading UD from time: ' + (options.fromTime || -1));

      $q.all([
          // Get currency
          csCurrency.get(),

          // Get user memberships
          esWot.memberships(options.pubkey)
        ])
        .then(function(res) {
          var currency = res[0] && res[0].name;
          var memberships =  res[1];
          if (!currency || !memberships || !memberships.length) return;

          // Filter memberships using options.fromTime
          if (options.fromTime !== -1) {
            memberships = memberships.reduce(function(res, membership) {
              // Exclude membership periods when BEFORE formTime
              if (membership.leaveTime < options.fromTime) return res;
              // Do a copy, to avoid to change cached data
              return res.concat({
                joinTime: Math.max(membership.joinTime, options.fromTime),
                leaveTime: membership.leaveTime
              });
            }, []);
          }

          return $q.all(memberships.reduce(function(res, membership) {
            var request = {
              query: {
                filtered: {
                  filter: {
                    bool: {
                      must: [
                        {
                          exists: {
                            field: 'dividend'
                          }
                        },
                        {
                          range: {
                            medianTime: {
                              // Fix #736: Add 1 second, because when membership begins in a block with DU, the DU is not received
                              from: membership.joinTime+1,
                              to: membership.leaveTime
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              },
              size: options.size || 10000, // TODO: use scroll ?
              from: options.from || 0,
              sort: {"medianTime" : "desc"},
              _source: ["medianTime", "number", "dividend", "unitbase"]
            };
            return res.concat(raw.block.search(request, {currency: currency}));
          }, []));
        })
        .then(function(res){
          if (!res || !res.length) return;
          return res.reduce(function(uds, res) {

            if (!res.hits.total || !res.hits.hits.length) return res;

            return res.hits.hits.reduce(function(res, hit){
              var block = hit._source;
              var amount = _powBase(block.dividend, block.unitbase);
              return res.concat({
                id: [amount, 'ud', block.medianTime].join(':'),
                time: block.medianTime,
                amount: amount,
                isUD: true,
                block_number: block.number
              });
            }, uds);

          }, []);

        })
        .then(function(res){
          deferred.resolve(res);
        })
        .catch(function(err) {
          deferred.reject(err);
        });

      return deferred.promise;
    }

    function addListeners() {
      // Extend API events
      listeners = [
        csTx.api.data.on.loadUDs($rootScope, onLoadUDs, this)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function refreshState() {
      var enable = esHttp.alive;
      if (!enable && listeners && listeners.length > 0) {
        console.debug("[ES] [tx] Disable");
        removeListeners();
      }
      else if (enable && (!listeners || listeners.length === 0)) {
        console.debug("[ES] [tx] Enable");
        addListeners();
      }
    }

    // Default action
    csPlatform.ready().then(function() {
      esHttp.api.node.on.start($rootScope, refreshState, this);
      esHttp.api.node.on.stop($rootScope, refreshState, this);
      return refreshState();
    });

    // Exports
    return {};
  });
