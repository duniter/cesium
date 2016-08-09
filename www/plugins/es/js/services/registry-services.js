angular.module('cesium.registry.services', ['ngResource', 'cesium.services', 'cesium.es.services'])

.factory('Registry', function($q, APP_CONFIG, ESUtils, CommentService) {
  'ngInject';

    function Registry(server) {

      var
      categories = [],
      fields = {
        commons: ["category", "title", "description", "issuer", "time", "city", "thumbnail", "picturesCount", "type"],
        comment: {
          commons: ["issuer", "time", "message"],
        }
      };

      function getCategories() {
        return $q(function(resolve, reject) {
          if (categories.length !== 0) {
            resolve(categories);
            return;
          }

          ESUtils.get('http://' + server + '/registry/category/_search?pretty&sort=order&from=0&size=1000&_source=name,parent')()
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

      var commentService = CommentService.instance(server, 'registry');

      function getCommons() {
        var _source = fields.commons.reduce(function(res, field){
          return res + ',' + field;
        }, '').substring(1);
        return ESUtils.get('http://' + server + '/registry/record/:id?_source=' + _source);
      }

      return {
        category: {
          all: getCategories
        },
        record: {
          searchText: ESUtils.get('http://' + server + '/registry/record/_search?q=:search'),
          search: ESUtils.post('http://' + server + '/registry/record/_search?pretty'),
          get: ESUtils.get('http://' + server + '/registry/record/:id'),
          getCommons: getCommons(),
          add: ESUtils.record.post('http://' + server + '/registry/record'),
          update: ESUtils.record.post('http://' + server + '/registry/record/:id/_update'),
          remove: ESUtils.record.remove('registry', 'record'),
          fields: {
            commons: fields.commons
          },
          picture: {
            all: ESUtils.get('http://' + server + '/registry/record/:id?_source=pictures')
          },
          comment: commentService
        },
        currency: {
          all: ESUtils.get('http://' + server + '/registry/currency/_search?_source=currencyName,peers.host,peers.port'),
          get: ESUtils.get('http://' + server + '/registry/currency/:id/_source')
        }
      };
    }

    var enable = !!APP_CONFIG.DUNITER_NODE_ES;
    if (!enable) {
      return null;
    }

    var service = Registry(APP_CONFIG.DUNITER_NODE_ES);
    service.instance = Registry;

  return service;
})
;
