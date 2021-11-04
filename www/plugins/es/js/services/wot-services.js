angular.module('cesium.es.wot.services', ['ngResource', 'cesium.es.http.services'])

  .factory('esWot', function($rootScope, $q, esHttp, csCache) {
    'ngInject';

    var
      cachePrefix = 'esWot-',
      membershipsCache = csCache.get(cachePrefix + 'memberships-', csCache.constants.MEDIUM),
      raw = {
          user: {
            event: esHttp.post('/user/event/_search')
          }
        };

    function loadMemberships(pubkey, options) {
      options = options || {};

      var result = (options.cache !== false) ? membershipsCache.get(pubkey) : null;
      if (result) return $q.when(result);

      // Get user events on membership state
      var request = {
        "size": 1000,
        "query": {
          "bool": {
            "filter": [
              {"term": {"recipient" : pubkey }},
              {"terms": {"code" : ["MEMBER_JOIN","MEMBER_ACTIVE","MEMBER_LEAVE","MEMBER_EXCLUDE","MEMBER_REVOKE"] }}
            ]
          }
        },
        "sort" : [
          { "time" : {"order" : "asc"}}
        ],
        _source: ["code", "time"]
      };

      return raw.user.event(request)

        .then(function(res) {
          if (!res.hits || !res.hits.total) return;

          // Compute member periods
          var lastJoinTime;
          var result = res.hits.hits.reduce(function(res, hit){
            var isMember = hit._source.code === 'MEMBER_JOIN' || hit._source.code === 'MEMBER_ACTIVE';
            // If join
            if (isMember && !lastJoinTime) {
              lastJoinTime = hit._source.time;
            }
            // If leave
            else if (!isMember && lastJoinTime) {
              // Add an entry
              res = res.concat({
                joinTime: lastJoinTime,
                leaveTime: hit._source.time
              });
              lastJoinTime = 0; // reset
            }
            return res;
          }, []);

          if (lastJoinTime) {
            // Add last entry if need
            result.push({
              joinTime: lastJoinTime,
              leaveTime: moment().utc().unix()
            });
          }

          // Put in the cache
          membershipsCache.put(pubkey, result);

          return result;
        });
    }

    function cleanAllCache() {
      console.debug("[ES] [wot] Cleaning cache {prefix: '{0}'}...".format(cachePrefix));
      csCache.clear(cachePrefix);
    }

    // Listen if node changed
    esHttp.api.node.on.stop($rootScope, cleanAllCache, this);

    return {
      memberships: loadMemberships,
      cache: {
        clearAll: cleanAllCache
      }
    };
  });
