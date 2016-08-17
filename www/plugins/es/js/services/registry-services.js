angular.module('cesium.es.registry.services', ['ngResource', 'cesium.services', 'cesium.es.http.services'])

.factory('esRegistry', function($q, esHttp, esComment) {
  'ngInject';

    function ESRegistry() {

      var
      categories = [],
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "address", "city", "thumbnail", "picturesCount", "type", "socials"],
        comment: {
          commons: ["issuer", "time", "message"],
        }
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

          esHttp.get('/registry/category/_search?pretty&sort=order&from=0&size=1000&_source=name,parent')()
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

      var getCategoryRequest = esHttp.get('/registry/category/:id');

      function getCategory(id) {
        return getCategoryRequest({id: id})
          .then(function(hit) {
            var res = hit._source;
            res.id = hit._id;
            return res;
          });
      }

      var esCommentNode = esComment.instance('registry');

      function getCommons() {
        var _source = fields.commons.reduce(function(res, field){
          return res + ',' + field;
        }, '').substring(1);
        return esHttp.get('/registry/record/:id?_source=' + _source);
      }

      return {
        copy: copy,
        category: {
          all: getCategories,
          get: getCategory
        },
        record: {
          searchText: esHttp.get('/registry/record/_search?q=:search'),
          search: esHttp.post('/registry/record/_search?pretty'),
          get: esHttp.get('/registry/record/:id'),
          getCommons: getCommons(),
          add: esHttp.record.post('/registry/record'),
          update: esHttp.record.post('/registry/record/:id/_update'),
          remove: esHttp.record.remove('esRegistry', 'record'),
          fields: {
            commons: fields.commons
          },
          picture: {
            all: esHttp.get('/registry/record/:id?_source=pictures')
          },
          comment: esCommentNode
        },
        currency: {
          all: esHttp.get('/registry/currency/_search?_source=currencyName,peers.host,peers.port'),
          get: esHttp.get('/registry/currency/:id/_source')
        }
      };
    }

    var service = ESRegistry();
    service.instance = ESRegistry;

  return service;
})
;
