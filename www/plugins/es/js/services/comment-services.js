angular.module('cesium.es.comment.services', ['ngResource', 'cesium.bma.services', 'cesium.wallet.services', 'cesium.es.http.services'])

.factory('esComment', function($rootScope, $q, UIUtils, BMA, esHttp, esUser, csWallet) {
  'ngInject';

  function factory(host, port, wsPort, index) {

    const
      defaultSizeLimit = 20,
      fields = {
        commons: ["issuer", "time", "message", "reply_to"],
      };

    var
      that,
      pendings = {};
      searchRequest = esHttp.post(host, port, '/'+index+'/comment/_search'),
      deleteRequest = esHttp.record.remove(host, port, index, 'comment'),
      wsChanges = esHttp.ws('ws://' + esHttp.getServer(host, wsPort) + '/ws/_changes');

    console.log("Creating JS comment service for index: " + index);

    function refreshTreeLinks(data) {
      return addTreeLinks(data, true);
    }

    function addTreeLinks(data, refresh) {
      data = data || {};
      data.result = data.result || [];
      data.mapById = data.mapById || {};

      var incompleteCommentIdByParentIds = {};
      _.forEach(_.values(data.mapById), function(comment) {
        if (comment.reply_to && !comment.parent) {
          var parent = data.mapById[comment.reply_to];
          if (!parent) {
            parent = new Comment(comment.reply_to);
            incompleteCommentIdByParentIds[parent.id] = comment.id;
            data.mapById[parent.id] = parent;
          }
          if (!refresh || !parent.containsReply(comment)) {
            parent.addReply(comment);
          }
        }
      });

      if (!_.size(incompleteCommentIdByParentIds)) {
        var deferred = $q.defer();
        deferred.resolve(data);
        return deferred.promise;
      }

      var request = {
        query : {
          terms: {
            _id: _.keys(incompleteCommentIdByParentIds)
          }
        },
        sort : [
          { "time" : {"order" : "desc"}}
        ],
        from: 0,
        size: 1000,
        _source: fields.commons
      };

      console.debug("[ES] [comment] Getting missing comments in tree");
      return searchRequest(request)
        .then(function(res){
          if (!res.hits.total) {
            console.error("[ES] [comment] Comments has invalid [reply_to]: " + _.values(incompleteCommentIdByParentIds).join(','));
            return data;
          }

          _.forEach(res.hits.hits, function(hit) {
            var comment = data.mapById[hit._id];
            comment.copyFromJson(hit._source);
            delete incompleteCommentIdByParentIds[comment.id];
          });

          if (_.size(incompleteCommentIdByParentIds)) {
            console.error("Comments has invalid [reply_to]: " + _.values(incompleteCommentIdByParentIds).join(','));
          }

          return addTreeLinks(data); // recursive call
        });
    }

    function loadDataByRecordId(recordId, options) {
      options = options || {};
      options.from = options.from || 0;
      options.size = options.size || defaultSizeLimit;
      options.loadAvatar = angular.isDefined(options.loadAvatar) ? options.loadAvatar : true;
      options.loadAvatarAllParent = angular.isDefined(options.loadAvatarAllParent) ? (options.loadAvatar && options.loadAvatarAllParent) : false;
      if (options.size < 0) options.size = defaultSizeLimit;

      var request = {
        query : {
          term: { record : recordId}
        },
        sort : [
          { "time" : {"order" : "desc"}}
        ],
        from: options.from,
        size: options.size,
        _source: fields.commons
      };

      var data = {
        mapById: {},
        result: [],
        pendings: {}
      };

      // Search comments
      return searchRequest(request)
        .then(function(res){
          if (!res.hits.total) return data;

          data.result = res.hits.hits.reduce(function (result, hit) {
            var comment = new Comment(hit._id, hit._source);
            data.mapById[comment.id] = comment; // fill map by id
            return result.concat(comment);
          }, data.result);

          // Add tree (parent/child) link
          return addTreeLinks(data);
        })

        // Fill avatars (and uid)
        .then(function() {
          if (!options.loadAvatar) return;
          if (options.loadAvatarAllParent) {
            return esUser.profile.fillAvatars(_.values(data.mapById), 'issuer');
          }
          return esUser.profile.fillAvatars(data.result, 'issuer');
        })

        // Sort (time asc)
        .then(function() {
          data.result = data.result.sort(function(cm1, cm2) {
            return (cm1.time - cm2.time);
          });
          return data;
        });
    }

    // Add listener to send deletion
    function createOnDeleteListener(data) {
      return function(comment) {
        var index = _.findIndex(data.result, {id: comment.id});
        if (index === -1) return;
        data.result.splice(index, 1);
        delete data.mapById[comment.id];
        // Send deletion request
        if (comment.issuer === csWallet.data.pubkey) {
          deleteRequest(comment.id, csWallet.data.keypair)
            .catch(function(err){
              console.error(err);
              throw new Error('MARKET.ERROR.FAILED_REMOVE_COMMENT');
            });
        }
      };
    }

    function startListenChanges(recordId, data) {
      data = data || {};
      data.result = data.result || [];
      data.mapById = data.mapById || {};
      data.pendings = data.pendings || {};

      // Add listener to send deletion
      var onRemoveListener = createOnDeleteListener(data);
      _.forEach(data.result, function(comment) {
        comment.addOnRemoveListener(onRemoveListener);
      });

      // Open websocket
      var time = new Date().getTime();
      console.info("[ES] [comment] Starting websocket to listen comments on [{0}/record/{1}]".format(index, recordId.substr(0,8)));
      return wsChanges.open()

        // Define source filter
        .then(function(sock) {
          return sock.send(index + '/comment');
        })

        // Listen changes
        .then(function(){
          console.debug("[ES] [comment] Websocket opened in {0} ms".format(new Date().getTime() - time));
          wsChanges.on(function(change) {
            if (!change) return;
            if (change._operation === 'DELETE') {
              var comment = data.mapById[change._id];
              if (comment) {
                $rootScope.$apply(function() {
                  comment.remove();
                });
              }
            }
            else if (change._source && change._source.record === recordId) {
              console.debug("Received new: " + change._id);
              var comment = data.mapById[change._id];
              if (!comment) { // new comment
                // Check if not in pending comment
                if (data.pendings && data.pendings[change._source.time] && change._source.issuer === csWallet.data.pubkey) {
                  console.debug("Skip comment received by WS (already in pending)");
                  return;
                }
                comment = new Comment(change._id, change._source);
                comment.addOnRemoveListener(onRemoveListener);
                comment.isnew = true;
                data.mapById[change._id] = comment;
                refreshTreeLinks(data)
                  // fill avatars (and uid)
                  .then(function() {
                    return esUser.profile.fillAvatars([comment], 'issuer');
                  })
                  .then(function() {
                    data.result.push(comment);
                  })
              }
              else {
                comment.copyFromJson(change._source);
                refreshTreeLinks(data);
              }
            }
          })
        });
    }

    /**
     * Save a comment (add or update)
     * @param recordId
     * @param data
     * @param comment
     * @returns {*}
     */
    function save(recordId, data, comment) {
      data = data || {};
      data.result = data.result || [];
      data.mapById = data.mapById || {};
      data.pendings = data.pendings || {};

      var json = {
        time: comment.time,
        message: comment.message,
        record: recordId,
        issuer: csWallet.data.pubkey
      };
      if (comment.reply_to || comment.parent) {
        json.reply_to = comment.reply_to || comment.parent.id;
      }
      else {
        json.reply_to = null; // force to null because ES ignore missing field, when updating
      }

      if (!comment.id) {
        json.time = esHttp.date.now();

        data.pendings = data.pendings || {};
        data.pendings[json.time] = json;

        var commentObj = new Comment(null, json);
        commentObj.addOnRemoveListener(createOnDeleteListener(data));
        // copy additional wallet data
        commentObj.uid = csWallet.data.uid;
        commentObj.name = csWallet.data.name;
        commentObj.avatar = csWallet.data.avatar;

        commentObj.isnew = true;
        if (comment.parent) {
          comment.parent.addReply(commentObj);
        }
        data.result.push(commentObj);

        return that.raw.add(json)
          .then(function(id) {
            commentObj.id = id;
            data.mapById[id] = commentObj;
            delete data.pendings[json.time];
            return commentObj;
          });
      }
      // Update
      else {
        var commentObj = data.mapById[comment.id];
        commentObj.copy(comment);
        return that.raw.update(json, {id: comment.id});
      }
    }

    function stopListenChanges(data) {
      console.debug("[ES] [comment] Stopping websocket on comments");
      _.forEach(data.result, function(comment) {
        comment.cleanAllListeners();
      });
      // Close previous
      wsChanges.close();
    }

    that = {
      id: index,
      search: searchRequest,
      load: loadDataByRecordId,
      save: save,
      remove: deleteRequest,
      raw: {
        add: new esHttp.record.post(host, port, '/'+index+'/comment'),
        update: new esHttp.record.post(host, port, '/'+index+'/comment/:id/_update')
      },
      changes: {
        start: startListenChanges,
        stop: stopListenChanges
      },
      fields: {
        commons: fields.commons
      }
    };
    return that;
  }

  return {
     instance: factory
   };
})
;
