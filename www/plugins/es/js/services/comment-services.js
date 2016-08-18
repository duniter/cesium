angular.module('cesium.es.comment.services', ['ngResource', 'cesium.bma.services', 'cesium.es.http.services'])

.factory('esComment', function($q, BMA, esHttp) {
  'ngInject';

  function ESComment(index) {

    var
    fields = {
      commons: ["issuer", "time", "message"],
    };

    var postSearchComments = esHttp.post('/'+index+'/comment/_search?pretty');

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
      add: esHttp.record.post('/'+index+'/comment'),
      update: esHttp.record.post('/'+index+'/comment/:id/_update'),
      remove: esHttp.record.remove(index, 'comment'),
      fields: {
        commons: fields.commons
      }
    };
  }

  return {
     instance: ESComment
   };
})
;
