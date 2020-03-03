angular.module('cesium.es.like.services', ['ngResource', 'cesium.services',
  'cesium.es.http.services'])

  .factory('esLike', function($q, csWallet, esHttp) {
    'ngInject';


    var constants = {
      KINDS: ['LIKE', 'ABUSE']
    };

    function EsLike(index, type) {

      var that = this;
      that.raw = {
          getSearch: esHttp.get('/like/record/_search?_source=false&q=:q'),
          searchBaseQueryString: 'index:{0} AND type:{1} AND id:'.format(index, type),
          postSearch: esHttp.post("/like/record/_search"),
          postRecord: esHttp.record.post('/{0}/{1}/:id/_like'.format(index, type)),
          removeRecord: esHttp.record.remove('like', 'record')
        };

      function getLikeIds(id, options) {
        options = options || {};
        options.kind = options.kind || 'LIKE';
        var queryString = that.raw.searchBaseQueryString + id;
        if (options.kind) queryString += ' AND kind:' + options.kind.toUpperCase();
        if (options.issuer) queryString += ' AND issuer:' + options.issuer;

        return that.raw.getSearch({q: queryString})
          .then(function(res) {
            return (res && res.hits && res.hits.hits || []).map(function(hit) {
              return hit._id;
            });
          });
      }

      function addLike(id, options) {
        options = options || {};
        options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
        if (!csWallet.isLogin()) return $q.reject('Wallet must be login before sending record to ES node');
        var record = {
          version: 2,
          index: index,
          type: type,
          id: id,
          kind: options.kind
        };
        if (options.comment) record.comment = options.comment;
        if (angular.isDefined(options.level)) record.level = options.level;

        return that.raw.postRecord(record, options);
      }

      function toggleLike(id, options) {
          options = options || {};
          options.kind = options.kind || 'LIKE';
          var pubkey = options.pubkey || options.wallet && options.wallet.data.pubkey || (csWallet.isLogin() && csWallet.data.pubkey);
          if (!pubkey) return $q.reject('User not log in!');
          options.wallet = options.wallet || csWallet.getByPubkey(pubkey);
          return getLikeIds(id, {kind: options.kind, issuer: pubkey})
            .then(function(existingLikeIds) {
              // User already like: so remove it
              if (existingLikeIds && existingLikeIds.length) {
                return $q.all(_.map(existingLikeIds, function(likeId) {
                  return removeLike(likeId, options)
                }))
                  // Return the deletion, as a delta
                  .then(function() {
                    return -1 * existingLikeIds.length;
                  });
              }
              // User not like, so add it
              else {
                return addLike(id, options)
                  // Return the insertion, as a delta
                  .then(function() {
                    return +1;
                  });
              }
          });
      }

      function removeLike(id, options) {
        if (!id) throw new Error("Missing 'id' argument");
        return that.raw.removeRecord(id, options);
      }

      function countLike(id, options) {
        options = options || {};
        options.kind = options.kind || 'LIKE';

        var request = {
          query: {
            bool: {
              filter: [
                {term: {index: index}},
                {term: {type: type}},
                {term: {id: id}},
                {term: {kind: options.kind.toUpperCase()}}
              ]
            }
          },
          size: 0
        };

        // To known if the user already like, add 'should' on issuers
        var issuers = options.issuer ? [options.issuer] : options.issuers;
        if (issuers && issuers.length) {
          request.query.bool.should = {terms: {issuer: issuers}};
          request.size = issuers.length;
          request._source = ["issuer"];
        }

        return that.raw.postSearch(request)
          .then(function(res) {
            var hits = res && res.hits;
            var result = {
              total: hits && hits.total || 0,
              wasHitByPubkey: {},
              wasHitCount: 0
            };

            // Check is issuer is return (because of size=1 and should filter)
            _.forEach(issuers, function(issuer) {
              var issuerHitIndex =  hits ? _.findIndex(hits.hits || [], function(hit) {
                return hit._source.issuer === issuer;
              }) : -1;

              result.wasHitByPubkey[issuer] = issuerHitIndex !== -1 || false;
              result.wasHitCount += issuerHitIndex !== -1 ? 1 : 0;
            })

            return result;
          })
      }

      // Expose functions
      return {
        index: index,
        type: type,
        toggle: toggleLike,
        add: addLike,
        remove: removeLike,
        count: countLike
      };
    }

    return {
      constants: constants,
      instance: EsLike
    };
  })
;
