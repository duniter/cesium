angular.module('cesium.es.registry.services', ['ngResource', 'cesium.services', 'cesium.es.http.services'])

.factory('esRegistry', function($q, csSettings, esHttp, esComment) {
  'ngInject';

  function factory(host, port) {

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

    function getCategoriesRequest() {
      var doRequest = esHttp.get(host, port, '/registry/category/_search?sort=order&from=0&size=1000&_source=name,parent');
      return function() {
        return $q(function(resolve, reject) {
          if (categories.length !== 0) {
            resolve(categories);
            return;
          }

          doRequest()
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
    }

    function getCategoryRequest() {
      var doRequest = esHttp.get(host, port, '/registry/category/:id');
      return function(params) {
        return doRequest(params)
          .then(function(hit) {
            var res = hit._source;
            res.id = hit._id;
            return res;
          });
      }
    }

    function getCommonsRequest() {
      var _source = fields.commons.reduce(function(res, field){
        return res + ',' + field;
      }, '').substring(1);
      return esHttp.get(host, port, '/registry/record/:id?_source=' + _source);
    }

    return {
      copy: copy,
      node: {
        server: esHttp.getServer(host, port)
      },
      category: {
        all: getCategoriesRequest(),
        get: getCategoryRequest()
      },
      record: {
        searchText: esHttp.get(host, port, '/registry/record/_search?q=:search'),
        search: esHttp.post(host, port, '/registry/record/_search'),
        get: esHttp.get(host, port, '/registry/record/:id'),
        getCommons: getCommonsRequest(),
        add: esHttp.record.post(host, port, '/registry/record'),
        update: esHttp.record.post(host, port, '/registry/record/:id/_update'),
        remove: esHttp.record.remove(host, port, 'esRegistry', 'record'),
        fields: {
          commons: fields.commons
        },
        picture: {
          all: esHttp.get(host, port, '/registry/record/:id?_source=pictures')
        },
        comment: esComment.instance(host, port, 'registry')
      },
      currency: {
        all: esHttp.get(host, port, '/registry/currency/_search?_source=currencyName,peers.host,peers.port'),
        get: esHttp.get(host, port, '/registry/currency/:id/_source')
      }
    };
  }

  var host = csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null;
  var port = host ? csSettings.data.plugins.es.port : null;

  var service = factory(host, port);
  service.instance = factory;

  return service;
})
;
