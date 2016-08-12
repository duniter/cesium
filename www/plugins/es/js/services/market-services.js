angular.module('cesium.es.market.services', ['ngResource', 'cesium.services', 'cesium.config', 'cesium.es.http.services', 'cesium.es.comment.services'])

.factory('esMarket', function($http, $q, esHttp, esComment) {
  'ngInject';

    function ESMarket(server) {

      var
      categories = [],
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "location", "price", "unit", "currency", "thumbnail", "picturesCount"]
      };

      function copy(otherNode) {
        if (!!this.instance) {
          var instance = this.instance;
          angular.copy(otherNode, this);
          this.instance = instance;
        }
        else {
          angular.copy(otherNode, this);
        }
      }

      function getCategories() {
        return $q(function(resolve, reject) {
          if (categories.length !== 0) {
            resolve(categories);
            return;
          }

          esHttp.get('/market/category/_search?pretty&sort=order&from=0&size=1000&_source=name,parent')()
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

      var esCommentNode = esComment.instance('market');

      function getCommons() {
        var _source = fields.commons.reduce(function(res, field){
          return res + ',' + field;
        }, '').substring(1);
        return esHttp.get('/market/record/:id?_source=' + _source);
      }

      return {
        copy: copy,
        category: {
          all: getCategories,
          searchText: esHttp.get('/market/category/_search?q=:search'),
          search: esHttp.post('/market/category/_search?pretty')
        },
        record: {
          searchText: esHttp.get('/market/record/_search?q=:search'),
          search: esHttp.post('/market/record/_search?pretty'),
          get: esHttp.get('/market/record/:id'),
          getCommons: getCommons(),
          add: esHttp.record.post('/market/record'),
          update: esHttp.record.post('/market/record/:id/_update'),
          fields: {
            commons: fields.commons
          },
          picture: {
            all: esHttp.get('/market/record/:id?_source=pictures')
          },
          comment: esCommentNode
        }
      };
    }

    var service = ESMarket();

    service.instance = ESMarket;
  return service;
})
;
