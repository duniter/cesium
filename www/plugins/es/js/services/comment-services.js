angular.module('cesium.es.comment.services', ['ngResource', 'cesium.bma.services', 'cesium.es.http.services'])

.factory('esComment', function($q, BMA, esHttp, esUser) {
  'ngInject';

  function factory(host, port, index) {

    var
      fields = {
        commons: ["issuer", "time", "message"],
      },
      postSearchCommentsRequest = esHttp.post(host, port, '/'+index+'/comment/_search')
      ;

    function getCommentsByRecordRequest() {
      return function(recordId, size) {
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

          postSearchCommentsRequest(request)
          .then(function(res){
            if (res.hits.total === 0) {
              resolve([]);
            }
            else {
              var result = res.hits.hits.reduce(function(result, hit) {
                var comment = hit._source;
                comment.id = hit._id;
                return result.concat(comment);
              }, []);

              // fill avatars (and uid)
              esUser.profile.fillAvatars(result, 'issuer')
                .then(function() {
                  resolve(result);
              })
              .catch(errorFct);
            }
          })
          .catch(errorFct);
        });
    };
    }

    return {
      search: postSearchCommentsRequest,
      all: getCommentsByRecordRequest(),
      add: esHttp.record.post(host, port, '/'+index+'/comment'),
      update: esHttp.record.post(host, port, '/'+index+'/comment/:id/_update'),
      remove: esHttp.record.remove(host, port, index, 'comment'),
      fields: {
        commons: fields.commons
      }
    };
  }

  return {
     instance: factory
   };
})
;
