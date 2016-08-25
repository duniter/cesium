angular.module('cesium.http.services', ['ngResource', 'angular-cache'])

.factory('csHttp', function($http, $q, csSettings, CacheFactory) {
  'ngInject';

  function factory(timeout) {

    var
      sockets = [],
      constants = {
        cache: {
          LONG: 1 * 60  * 60 * 1000 /*5 min*/,
          SHORT: csSettings.data.cacheTimeMs
        }
      }
    ;

    if (!timeout) {
      timeout=4000; // default
    }

    function getServer(host, port) {
      return  !host ? null : (host + (port ? ':' + port : ''));
    }

    function getUrl(host, port, path) {
      var protocol = (port === 443 ? 'https' : 'http');
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

    function getOrCreateCache(maxAge, onExpire){
      var cacheName = 'csHttp-' + maxAge;
      if (!onExpire) {
        return CacheFactory.get(cacheName) ||
          CacheFactory.createCache(cacheName, {
            maxAge: maxAge,
            deleteOnExpire: 'aggressive',
            //cacheFlushInterval: 60 * 60 * 1000, //  clear itself every hour
            recycleFreq: Math.max(maxAge - 1000, 5 * 60 * 1000 /*5min*/),
            storageMode: 'memory'
              // FIXME : enable this when cache is cleaning on rollback
              //csSettings.data.useLocalStorage ? 'localStorage' : 'memory'
          });
      }
      else {
        var counter = 1;
        while(CacheFactory.get(cacheName + counter)) {
          counter++;
        }
        return CacheFactory.createCache(cacheName + counter, {
            maxAge: maxAge,
            deleteOnExpire: 'aggressive',
            //cacheFlushInterval: 60 * 60 * 1000, // This cache will clear itself every hour
            recycleFreq: maxAge,
            onExpire: onExpire,
            storageMode: 'memory'
              // FIXME : enable this when cache is cleaning on rollback
              //csSettings.data.useLocalStorage ? 'localStorage' : 'memory'
          });
      }
    }

    function getResourceWithCache(host, port, path, maxAge, autoRefresh) {
      var url = getUrl(host, port, path);
      maxAge = maxAge || constants.cache.LONG;
      console.debug('[http] will cache ['+url+'] ' + maxAge + 'ms' + (autoRefresh ? ' with auto-refresh' : ''));

      return function(params) {
        return $q(function(resolve, reject) {
          var config = {
            timeout: timeout
          };
          if (autoRefresh) { // redo the request if need
            config.cache = getOrCreateCache(maxAge, function (key, value) {
                console.debug('[http] Refreshing cache for ['+key+'] ');
                $http.get(key, config)
                  .success(function (data) {
                    config.cache.put(key, data);
                });
              });
          }
          else {
            config.cache = getOrCreateCache(maxAge);
          }

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

    function clearAllCache() {
      console.debug("[http] cleaning all caches");
      var cache = CacheFactory.get('csHttp-' + constants.cache.SHORT);
      if (cache) {
        console.debug("[http] cleaning cache " + constants.cache.SHORT)
        cache.removeAll();
      }
      cache = CacheFactory.get('csHttp-' + constants.cache.LONG);
      if (cache) {
        cache.removeAll();
      }
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
              .success(function(data, status, headers, config) {
                resolve(data);
              })
              .error(function(data, status, headers, config) {
                processError(reject, data, status);
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
      cache: {
        LONG : constants.LONG,
        SHORT: constants.SHORT,
        clearAll: clearAllCache
      }
    };
  }

  return factory(csSettings.data.timeout);
})
;
