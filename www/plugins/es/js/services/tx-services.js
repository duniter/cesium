angular.module('cesium.es.tx.services', ['ngResource', 'cesium.services', 'cesium.es.http.services', 'cesium.es.wot.services'])

  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esTx');
    }

  })

  .factory('esTx', function($q, $rootScope, csCurrency, csTx, esHttp, esWot) {
    'ngInject';

    var
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

          console.debug(memberships);

          // Filter memberships using options.fromTime
          if (options.fromTime !== -1) {
            memberships = memberships.reduce(function(res, membership) {
              if (membership.leaveTime < options.fromTime) return res;
              membership.joinTime = Math.max(membership.joinTime, options.fromTime);
              return res.concat(membership);
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
          return res.reduce(function(uds, res){

            if (!res.hits.total || !res.hits.hits.length) return res;

            return uds.concat(res.hits.hits.reduce(function(res, hit){
              var block = hit._source;
              return res.concat({
                time: block.medianTime,
                amount: _powBase(block.dividend, block.unitbase),
                isUD: true,
                block_number: block.number
              });
            }, []));

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

    // Register extensions
    csTx.api.data.on.loadUDs($rootScope, onLoadUDs, this);

    // Exports
    return {};
  });
