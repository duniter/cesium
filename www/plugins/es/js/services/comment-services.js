angular.module('cesium.es.comment.services', ['ngResource', 'cesium.services',
  'cesium.es.http.services', 'cesium.es.profile.services'])

  .factory('esComment', function($rootScope, $q, esHttp, csWallet, csWot) {
    'ngInject';

    function EsComment(index) {

      var
        DEFAULT_SIZE = 20,
        fields = {
          commons: ["issuer", "creationTime", "time", "message", "reply_to"]
        },
        exports = {
          index: index,
          fields: {
            commons: fields.commons
          },
          raw: {
            search: esHttp.post('/'+index+'/comment/_search'),
            remove: esHttp.record.remove(index, 'comment'),
            wsChanges: esHttp.ws('/ws/_changes'),
            add: new esHttp.record.post('/'+index+'/comment', {creationTime: true}),
            update: new esHttp.record.post('/'+index+'/comment/:id/_update', {creationTime: true})
          }
        };

      exports.raw.refreshTreeLinks = function(data) {
        return exports.raw.addTreeLinks(data, true);
      };

      exports.raw.addTreeLinks = function(data, refresh) {
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
            // Need desc, because of size+offset (will be sort in 'asc' order later)
            { "creationTime" : {"order" : "desc"}},
            { "time" : {"order" : "desc"}} // for backward compatibility
          ],
          from: 0,
          size: 1000,
          _source: fields.commons
        };

        console.debug("[ES] [comment] Getting missing comments in tree");
        return exports.raw.search(request)
          .then(function(res){
            if (!res.hits.total) {
              console.error("[ES] [comment] Comments has invalid [reply_to]: " + _.values(incompleteCommentIdByParentIds).join(','));
              return data;
            }

            _.forEach(res.hits.hits, function(hit) {
              var comment = data.mapById[hit._id];
              comment.copyFromJson(hit._source);
              // Parse URL and hashtags
              comment.html = esHttp.util.parseAsHtml(comment.message);
              delete incompleteCommentIdByParentIds[comment.id];
            });

            if (_.size(incompleteCommentIdByParentIds)) {
              console.error("Comments has invalid [reply_to]: " + _.values(incompleteCommentIdByParentIds).join(','));
            }

            return exports.raw.addTreeLinks(data); // recursive call
          });
      };

      exports.raw.loadDataByRecordId = function(recordId, options) {
        options = options || {};
        options.from = options.from || 0;
        options.size = options.size || DEFAULT_SIZE;
        options.loadAvatar = angular.isDefined(options.loadAvatar) ? options.loadAvatar : true;
        options.loadAvatarAllParent = angular.isDefined(options.loadAvatarAllParent) ? (options.loadAvatar && options.loadAvatarAllParent) : false;
        if (options.size < 0) options.size = 1000; // all comments

        var request = {
          query : {
            term: { record : recordId}
          },
          sort : [
            // Need desc, because of size+offset (will be sort in 'asc' order later)
            { "creationTime" : {"order" : "desc"}},
            { "time" : {"order" : "desc"}} // for backward compatibility
          ],
          from: options.from,
          size: options.size,
          _source: fields.commons
        };

        var data = {
          total: 0,
          mapById: {},
          result: [],
          pendings: {}
        };

        // Search comments
        return exports.raw.search(request)
          .then(function(res){
            if (!res.hits.total) return data;
            data.total = res.hits.total;
            data.result = res.hits.hits.reduce(function (result, hit) {
              var comment = new Comment(hit._id, hit._source);
              // Parse URL and hashtags
              comment.html = esHttp.util.parseAsHtml(comment.message);
              // fill map by id
              data.mapById[comment.id] = comment;
              return result.concat(comment);
            }, data.result);

            // Add tree (parent/child) link
            return exports.raw.addTreeLinks(data);
          })

          // Fill avatars (and uid)
          .then(function() {
            if (!options.loadAvatar) return;
            if (options.loadAvatarAllParent) {
              return csWot.extendAll(_.values(data.mapById), 'issuer');
            }
            return csWot.extendAll(data.result, 'issuer');
          })

          // Sort (creationTime asc)
          .then(function() {
            data.result = data.result.sort(function(cm1, cm2) {
              return (cm1.creationTime - cm2.creationTime);
            });
            return data;
          });
      };

      // Add listener to send deletion
      exports.raw.createOnDeleteListener = function(data) {
        return function(comment) {
          var index = _.findIndex(data.result, {id: comment.id});
          if (index === -1) return;
          data.result.splice(index, 1);
          delete data.mapById[comment.id];

          var wallet = !csWallet.isUserPubkey(comment.issuer) ? csWallet.children.getByPubkey(comment.issuer) : csWallet;

          // Send deletion request
          if (wallet) {
            return exports.raw.remove(comment.id)
              .catch(function(err){
                console.error(err);
                throw new Error('COMMENTS.ERROR.FAILED_REMOVE_COMMENT');
              });
          }
          else {
            return $q.reject("No wallet found corresponding to the comment issuer");
          }
        };
      };

      exports.raw.startListenChanges = function(recordId, data, scope) {
        data = data || {};
        data.result = data.result || [];
        data.mapById = data.mapById || {};
        data.pendings = data.pendings || {};

        scope = scope||$rootScope;

        // Add listener to send deletion
        var onRemoveListener = exports.raw.createOnDeleteListener(data);
        _.forEach(data.result, function(comment) {
          comment.addOnRemoveListener(onRemoveListener);
        });

        // Open websocket
        var now = Date.now();
        console.info("[ES] [comment] Starting websocket to listen comments on [{0}/record/{1}]".format(index, recordId.substr(0,8)));
        var wsChanges = esHttp.websocket.changes(index + '/comment');
        return wsChanges.open()

          // Listen changes
          .then(function(){
            console.debug("[ES] [comment] Websocket opened in {0} ms".format(Date.now() - now));
            wsChanges.on(function(change) {
              if (!change) return;
              scope.$applyAsync(function() {
                var comment = data.mapById[change._id];
                if (change._operation === 'DELETE') {
                  if (comment) comment.remove();
                }
                else if (change._source && change._source.record === recordId) {
                  // update
                  if (comment) {
                    comment.copyFromJson(change._source);
                    // Parse URL and hashtags
                    comment.html = esHttp.util.parseAsHtml(comment.message);
                    exports.raw.refreshTreeLinks(data);
                  }
                  // create (if not in pending comment)
                  else if ((!data.pendings || !data.pendings[change._source.creationTime]) && change._source.issuer != csWallet.data.pubkey) {
                    comment = new Comment(change._id, change._source);
                    comment.addOnRemoveListener(onRemoveListener);
                    comment.isnew = true;
                    // Parse URL and hashtags
                    comment.html = esHttp.util.parseAsHtml(comment.message);
                    // fill map by id
                    data.mapById[change._id] = comment;
                    exports.raw.refreshTreeLinks(data)
                      // fill avatars (and uid)
                      .then(function() {
                        return csWot.extend(comment, 'issuer');
                      })
                      .then(function() {
                        data.result.push(comment);
                      });
                  }
                  else {
                    console.debug("Skip comment received by WS (already in pending)");
                  }
                }
              });
            });
          });
      };

      /**
       * Save a comment (add or update)
       * @param recordId
       * @param data
       * @param comment
       * @returns {*}
       */
      exports.raw.save = function(recordId, data, comment) {
        data = data || {};
        data.result = data.result || [];
        data.mapById = data.mapById || {};
        data.pendings = data.pendings || {};

        // Preparing JSON to sent
        var id = comment.id;
        var json = {
          creationTime: id ? comment.creationTime || comment.time/*for compat*/ : moment().utc().unix(),
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

        // Create or update the entity
        var entity;
        if (!id) {
          entity = new Comment(null, json);
          entity.addOnRemoveListener(exports.raw.createOnDeleteListener(data));
          // copy additional wallet data
          entity.uid = csWallet.data.uid;
          entity.name = csWallet.data.name;
          entity.avatar = csWallet.data.avatar;

          entity.isnew = true;
          if (comment.parent) {
            comment.parent.addReply(entity);
          }
          data.result.push(entity);
        }
        else {
          entity = data.mapById[id];
          entity.copy(comment);
        }

        // Parse URL and hashtags
        entity.html = esHttp.util.parseAsHtml(entity.message);

        // Send add request
        if (!id) {
          data.pendings = data.pendings || {};
          data.pendings[json.creationTime] = json;

          return exports.raw.add(json)
            .then(function (id) {
              entity.id = id;
              data.mapById[id] = entity;
              delete data.pendings[json.creationTime];
              return entity;
            });
        }
        // Send update request
        else {
          return exports.raw.update(json, {id: id})
            .then(function () {
              return entity;
            });
        }
      };

      exports.raw.stopListenChanges = function(data) {
        console.debug("[ES] [comment] Stopping websocket on comments");
        _.forEach(data.result, function(comment) {
          comment.cleanAllListeners();
        });
        // Close previous
        exports.raw.wsChanges().close();
      };

      // Expose functions
      exports.load = exports.raw.loadDataByRecordId;
      exports.save = exports.raw.save;
      exports.changes = {
        start: exports.raw.startListenChanges,
        stop: exports.raw.stopListenChanges
      };
      return exports;
    }

    return {
      instance: EsComment
    };
  })
;
