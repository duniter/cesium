angular.module('cesium.market.services', ['ngResource', 'cesium.services', 'cesium.config', 'cesium.es.services', 'cesium.comment.services'])

.factory('Market', function($http, $q, APP_CONFIG, ESUtils, CommentService) {
  'ngInject';

    function Market(server) {

      var
      categories = [],
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "location", "price", "unit", "currency", "thumbnail", "picturesCount"]
      };

      function getCategories() {
        return $q(function(resolve, reject) {
          if (categories.length !== 0) {
            resolve(categories);
            return;
          }

          ESUtils.get('http://' + server + '/market/category/_search?pretty&sort=order&from=0&size=1000&_source=name,parent')()
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

      var commentService = CommentService.instance(server, 'market');

      function getCommons() {
        var _source = fields.commons.reduce(function(res, field){
          return res + ',' + field;
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
            all: ESUtils.get('http://' + server + '/market/record/:id?_source=pictures')
          },
          comment: commentService
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
