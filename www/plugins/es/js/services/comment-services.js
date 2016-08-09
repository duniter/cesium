angular.module('cesium.comment.services', ['ngResource', 'cesium.services', 'cesium.config', 'cesium.es.services'])

.factory('CommentService', function($http, $q, APP_CONFIG, BMA, ESUtils) {
  'ngInject';

    function CommentService(server, index) {

      var
      fields = {
        commons: ["issuer", "time", "message"],
      };

      var postSearchComments = ESUtils.post('http://' + server + '/'+index+'/comment/_search?pretty');

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
            _source: fields.commons
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

      return {

        search: postSearchComments,
        all: getCommentsByRecord,
        add: ESUtils.record.post('http://' + server + '/'+index+'/comment'),
        update: ESUtils.record.post('http://' + server + '/'+index+'/comment/:id/_update'),
        remove: ESUtils.record.remove(index, 'comment'),
        fields: {
          commons: fields.commons
        }
      };
    }

    var enable = !!APP_CONFIG.DUNITER_NODE_ES;
    if (!enable) {
      return null;
    }

    var service = {};

    service.instance = CommentService;
  return service;
})
;
