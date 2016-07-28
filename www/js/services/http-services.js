angular.module('cesium.http.services', ['ngResource'])

.factory('HttpUtils', function($http, $q, APP_CONFIG) {
  'ngInject';

  function HttpUtils(timeout) {

    var
    errorCodes = {
      },
    constants = {
      CACHE_TIME_MS: 60000
    },
    sockets = []
    ;

    if (!timeout) {
      timeout=4000;
    }

    function processError(reject, data, uri) {
      if (data && data.message) {
        reject(data);
      }
      else {
        if (uri) {
          reject('Error from node (' + uri + ')');
        }
        else {
          reject('Unknown error from node');
        }
      }
    }

    function prepare(uri, params, config, callback) {
      var pkeys = [], queryParams = {}, newUri = uri;
      if (typeof params == 'object') {
        pkeys = _.keys(params);
      }

      _.forEach(pkeys, function(pkey){
        var prevURI = newUri;
        newUri = newUri.replace(new RegExp(':' + pkey), params[pkey]);
        if (prevURI == newUri) {
          queryParams[pkey] = params[pkey];
        }
      });
      config.params = queryParams;
      callback(newUri, config);
    }

    function getResource(uri) {
      return function(params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout
          };

          prepare(uri, params, config, function(uri, config) {
              $http.get(uri, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                processError(reject, data, uri);
              });
          });
        });
      };
    }

    function postResource(uri) {
      return function(data, params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout,
            headers : {'Content-Type' : 'application/json'}
          };

          prepare(uri, params, config, function(uri, config) {
              $http.post(uri, data, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                processError(reject, data);
              });
          });
        });
      };
    }

    function ws(uri) {
      var sock = null;
      return {
        on: function(type, callback) {
          if (!sock) {
            sock = new WebSocket(uri);
            sockets.push(this);
          }
          sock.onmessage = function(e) {
            callback(JSON.parse(e.data));
          };
        },
        close: function(type, callback) {
          if (!!sock) {
            sock.close();
            sock = null;
          }
        }
      };
    }

    function closeAllWs() {
      if (sockets.length > 0) {
        _.forEach(sockets, function(sock) {
          sock.close();
        });
        sockets = []; // Reset socks list
      }
    }

    return {
      get: getResource,
      post: postResource,
      ws: ws,
      closeAllWs: closeAllWs
    };
  }

  var service = HttpUtils(APP_CONFIG.TIMEOUT);
  service.instance = HttpUtils;
  return service;
})
;
