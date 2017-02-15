angular.module('cesium.http.services', ['ngResource', 'cesium.cache.services'])

.factory('csHttp', function($http, $q, csSettings, csCache, $timeout) {
  'ngInject';

  function factory(timeout) {

    var
      sockets = [],
      cachePrefix = 'csHttp'
    ;

    if (!timeout) {
      timeout=4000; // default
    }

    function getServer(host, port) {
      return  !host ? null : (host + (port ? ':' + port : ''));
    }

    function getUrl(host, port, path) {
      var protocol = (port == 443 ? 'https' : 'http');
      return  protocol + '://' + getServer(host, port) + (path ? path : '');
    }

    function processError(reject, data, url, status) {
      if (data && data.message) {
        reject(data);
      }
      else {
        if (status == 404) {
          reject({ucode: 404, message: 'Resource not found ' + (url ? ' ('+url+')' : '')});
        }
        if (url) {
          reject('Error from node (' + url + ')');
        }
        else {
          reject('Unknown error from node');
        }
      }
    }

    function prepare(url, params, config, callback) {
      var pkeys = [], queryParams = {}, newUri = url;
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
      return callback(newUri, config);
    }


    function getResource(host, port, path) {
      var url = getUrl(host, port, path);
      return function(params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout
          };

          prepare(url, params, config, function(url, config) {
              $http.get(url, config)
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                processError(reject, data, url, status);
              });
          });
        });
      };
    }

    function getResourceWithCache(host, port, path, maxAge, autoRefresh) {
      var url = getUrl(host, port, path);
      maxAge = maxAge || csCache.constants.LONG;
      //console.debug('[http] will cache ['+url+'] ' + maxAge + 'ms' + (autoRefresh ? ' with auto-refresh' : ''));

      return function(params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout
          };
          if (autoRefresh) { // redo the request if need
            config.cache = csCache.get(cachePrefix, maxAge, function (key, value) {
                console.debug('[http] Refreshing cache for ['+key+'] ');
                $http.get(key, config)
                  .success(function (data) {
                    config.cache.put(key, data);
                });
              });
          }
          else {
            config.cache = csCache.get(cachePrefix, maxAge);
          }

          prepare(url, params, config, function(url, config) {
            $http.get(url, config)
              .success(function(data) {
                resolve(data);
              })
              .error(function(data, status) {
                processError(reject, data, url, status);
              });
          });
        });
      };
    }

    function postResource(host, port, path) {
      var url = getUrl(host, port, path);
      return function(data, params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout,
            headers : {'Content-Type' : 'application/json'}
          };

          prepare(url, params, config, function(url, config) {
              $http.post(url, data, config)
              .success(function(data) {
                resolve(data);
              })
              .error(function(data, status) {
                processError(reject, data, status);
              });
          });
        });
      };
    }

    function ws(uri) {
      var sock = null;
      var callbacks = [];

      function _waitOpen() {
        if (!sock) throw new Error('Websocket not opened');
        if (sock && sock.readyState === 1) {
          return $q.when(sock);
        }
        return $timeout(_waitOpen, 100);
      }

      function _open(self, callback, params) {
        if (!sock) {
          prepare(uri, params, {}, function(uri) {
            sock = new WebSocket(uri);
            sockets.push(self);
          });
          sock.onerror = function(e) {
            console.error(e);
          };
          sock.onmessage = function(e) {
            var obj = JSON.parse(e.data);
            _.forEach(callbacks, function(callback) {
              callback(obj);
            });
          };
        }
        if (callback) callbacks.push(callback);
        return _waitOpen();
      }

      return {
        open: function(params) {
          return _open(this, null, params);
        },
        on: function(callback, params) {
          return _open(this, callback, params);
        },
        send: function(data) {
          return _waitOpen()
            .then(function(){
              sock.send(data);
            });
        },
        close: function() {
          if (sock) {
            sock.close();
            sock = null;
            callbacks = [];
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

    // See doc : https://gist.github.com/jlong/2428561
    function parseUri(uri) {
      var protocol;
      if (uri.startsWith('duniter://')) {
        protocol = 'duniter';
        uri = uri.replace('duniter://', 'http://');
      }

      var parser = document.createElement('a');
      parser.href = uri;

      var pathname = parser.pathname;
      if (pathname && pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }

      result = {
        protocol: protocol ? protocol : parser.protocol,
        hostname: parser.hostname,
        host: parser.host,
        port: parser.port,
        username: parser.username,
        password: parser.password,
        pathname: pathname,
        search: parser.search,
        hash: parser.hash
      };
      parser.remove();
      return result;
    }

    return {
      get: getResource,
      getWithCache: getResourceWithCache,
      post: postResource,
      ws: ws,
      closeAllWs: closeAllWs,
      getUrl : getUrl,
      getServer: getServer,
      uri: {
        parse: parseUri
      },
      cache: csCache.constants
    };
  }

  return factory(csSettings.data.timeout);
})
;
