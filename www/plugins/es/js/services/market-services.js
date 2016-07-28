angular.module('cesium.market.services', ['ngResource', 'cesium.services', 'cesium.config', 'cesium.es.services'])

.factory('Market', function($http, $q, CryptoUtils, APP_CONFIG, BMA, ESUtils) {
  'ngInject';

    function Market(server) {

      var
        categories = [],
        fields = {
          commons: ["category", "title", "description", "issuer", "time", "location", "price", "unit", "currency", "thumbnail", "picturesCount"],
          comment: {
            commons: ["issuer", "time", "message"],
          }
        }
      ;

      function getCategories() {
        return $q(function(resolve, reject) {
          if (categories.length !== 0) {
            resolve(categories);
            return;
          }

          ESUtils.get('http://' + server + '/market/category/_search?pretty&from=0&size=1000')()
          .then(function(res) {
            if (res.hits.total === 0) {
                categories = [];
            }
            else {
              categories = res.hits.hits.reduce(function(result, hit) {
                var cat = hit._source;
                cat.id = hit._id;
                return result.concat(cat);
              }, []);
              // add as map also
              _.forEach(categories, function(cat) {
                categories[cat.id] = cat;
              });
            }
            resolve(categories);
          })
          .catch(function(err) {
             reject(err);
           });
        });
      }

      var postSearchComments = ESUtils.post('http://' + server + '/market/comment/_search?pretty');

      function getCommentsByRecord(recordId, size) {
        if (!size) {
          size = 10;
        }
        else if (size < 0) {
          size = 1000;
        }
        return $q(function(resolve, reject) {
          var errorFct = function(err) {
            reject(err);
          };
          var request = {
            sort : [
              { "time" : {"order" : "desc"}}
            ],
            query : {
              constant_score:{
                filter: {
                  term: { record : recordId}
                }
              }
            },
            from: 0,
            size: size,
            _source: fields.comment.commons
          };

          postSearchComments(request)
          .then(function(res){
            if (res.hits.total === 0) {
              resolve([]);
            }
            else {
              BMA.wot.member.uids(true/*cache*/)
              .then(function(uids){
                var result = res.hits.hits.reduce(function(result, hit) {
                  var comment = hit._source;
                  comment.id = hit._id;
                  comment.uid = uids[comment.issuer];
                  return result.concat(comment);
                }, []);

                resolve(result);
              })
              .catch(errorFct);
            }
          })
          .catch(errorFct);
        });
      }

      function getCommons() {
        var _source = fields.commons.reduce(function(res, field){
          return res + ',' + field
        }, '').substring(1);
        return ESUtils.get('http://' + server + '/market/record/:id?_source=' + _source);
      }

      return {
        category: {
          all: getCategories,
          searchText: ESUtils.get('http://' + server + '/market/category/_search?q=:search'),
          search: ESUtils.post('http://' + server + '/market/category/_search?pretty')
        },
        record: {
          searchText: ESUtils.get('http://' + server + '/market/record/_search?q=:search'),
          search: ESUtils.post('http://' + server + '/market/record/_search?pretty'),
          get: ESUtils.get('http://' + server + '/market/record/:id'),
          getCommons: getCommons(),
          add: ESUtils.record.post('http://' + server + '/market/record'),
          update: ESUtils.record.post('http://' + server + '/market/record/:id/_update'),
          fields: {
            commons: fields.commons
          },
          picture: {
            all: ESUtils.get('http://' + server + '/market/record/:record?_source=pictures')
          },
          comment:{
            search: postSearchComments,
            all: getCommentsByRecord,
            add: ESUtils.record.post('http://' + server + '/market/comment'),
            update: ESUtils.record.post('http://' + server + '/market/comment/:id/_update'),
            remove: ESUtils.record.remove('market', 'comment'),
            fields: {
              commons: fields.comment.commons
            }
          }
        }
      };
    }

    var enable = !!APP_CONFIG.DUNITER_NODE_ES;
    if (!enable) {
      return null;
    }

    var service = Market(APP_CONFIG.DUNITER_NODE_ES);

    service.instance = Market;
  return service;
})
;
