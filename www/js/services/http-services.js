angular.module('cesium.http.services', ['cesium.cache.services'])

.factory('csHttp', function($http, $q, $timeout, $window, csSettings, csCache, Device) {
  'ngInject';

  var timeout = csSettings.data.timeout;

  var
    sockets = [],
    cachePrefix = 'csHttp'
  ;

  if (!timeout) {
    timeout=4000; // default
  }

  function getServer(host, port) {
    // Remove port if 80 or 443
    return  !host ? null : (host + (port && port != 80 && port != 443 ? ':' + port : ''));
  }

  function getUrl(host, port, path, useSsl) {
    var protocol = (port == 443 || useSsl) ? 'https' : 'http';
    return  protocol + '://' + getServer(host, port) + (path ? path : '');
  }

  function getWsUrl(host, port, path, useSsl) {
    var protocol = (port == 443 || useSsl) ? 'wss' : 'ws';
    return  protocol + '://' + getServer(host, port) + (path ? path : '');
  }

  function processError(reject, data, url, status) {
    if (data && data.message) {
      reject(data);
    }
    else {
      if (status == 404) {
        reject({ucode: 404, message: 'Resource not found' + (url ? ' ('+url+')' : '')});
      }
      else if (url) {
        reject('Error while requesting [' + url + ']');
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
      newUri = newUri.replace(':' + pkey, params[pkey]);
      if (prevURI == newUri) {
        queryParams[pkey] = params[pkey];
      }
    });
    config.params = queryParams;
    return callback(newUri, config);
  }

  function getResource(host, port, path, useSsl, forcedTimeout) {
    // Make sure host is defined - fix #537
    if (!host) {
      return $q.reject('[http] invalid URL from host: ' + host);
    }
    var url = getUrl(host, port, path, useSsl);
    return function(params) {
      return $q(function(resolve, reject) {
        var config = {
          timeout: forcedTimeout || timeout,
          responseType: 'json'
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

  function getResourceWithCache(host, port, path, useSsl, maxAge, autoRefresh, forcedTimeout) {
    var url = getUrl(host, port, path, useSsl);
    maxAge = maxAge || csCache.constants.LONG;
    //console.debug('[http] will cache ['+url+'] ' + maxAge + 'ms' + (autoRefresh ? ' with auto-refresh' : ''));

    return function(params) {
      return $q(function(resolve, reject) {
        var config = {
          timeout: forcedTimeout || timeout,
          responseType: 'json'
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

  function postResource(host, port, path, useSsl, forcedTimeout) {
    var url = getUrl(host, port, path, useSsl);
    return function(data, params) {
      return $q(function(resolve, reject) {
        var config = {
          timeout: forcedTimeout || timeout,
          headers : {'Content-Type' : 'application/json;charset=UTF-8'}
        };

        prepare(url, params, config, function(url, config) {
            $http.post(url, data, config)
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

  function ws(host, port, path, useSsl, timeout) {
    if (!path) {
      console.error('calling csHttp.ws without path argument');
      throw 'calling csHttp.ws without path argument';
    }
    var uri = getWsUrl(host, port, path, useSsl);
    timeout = timeout || csSettings.data.timeout;

    function _waitOpen(self) {
      if (!self.delegate) throw new Error('Websocket not opened');
      if (self.delegate.readyState == 1) {
        return $q.when(self.delegate);
      }
      if (self.delegate.readyState == 3) {
        return $q.reject('Unable to connect to websocket ['+self.delegate.url+']');
      }
      console.debug('[http] Waiting websocket ['+self.path+'] opening...');

      if (self.waitDuration >= timeout) {
        console.debug("[http] Will retry openning websocket later...");
        self.waitRetryDelay = 2000; // 2 seconds
      }

      return $timeout(function(){
        self.waitDuration += self.waitRetryDelay;
        return _waitOpen(self);
      }, self.waitRetryDelay);
    }

    function _open(self, callback, params) {
      if (!self.delegate) {
        self.path = path;
        self.callbacks = [];
        self.waitDuration = 0;
        self.waitRetryDelay = 200;

        prepare(uri, params, {}, function(uri) {
          self.delegate = new WebSocket(uri);
          self.delegate.onerror = function(e) {
            self.delegate.readyState=3;
          };
          self.delegate.onmessage = function(e) {
            var obj = JSON.parse(e.data);
            _.forEach(self.callbacks, function(callback) {
              callback(obj);
            });
          };
          self.delegate.onopen = function(e) {
            console.debug('[http] Listening on websocket ['+self.path+']...');
            sockets.push(self);
            self.delegate.openTime = new Date().getTime();
          };
          self.delegate.onclose = function() {

            // Remove from sockets arrays
            var index = _.findIndex(sockets, function(socket){return socket.path === self.path;});
            if (index >= 0) {
              sockets.splice(index,1);
            }

            // If close event comes from Cesium
            if (self.delegate.closing) {
              self.delegate = null;
            }

            // If unexpected close event, reopen the socket (fix #535)
            else {
              console.debug('[http] Unexpected close of websocket ['+path+'] (open '+ (new Date().getTime() - self.delegate.openTime) +'ms ago): re-opening...');

              self.delegate = null;

              // Loop, but without the already registered callback
              _open(self, null, params);
            }
          };
        });
      }
      if (callback) self.callbacks.push(callback);
      return _waitOpen(self);
    }

    return {
      open: function(params) {
        return _open(this, null, params);
      },
      on: function(callback, params) {
        return _open(this, callback, params);
      },
      send: function(data) {
        var self = this;
        return _waitOpen(self)
          .then(function(){
            self.delegate.send(data);
          });
      },
      close: function() {
        var self = this;
        if (self.delegate) {
          self.delegate.closing = true;
          console.debug('[http] Closing websocket ['+self.path+']...');
          self.delegate.close();
          self.callbacks = [];
        }
      }
    };
  }

  function closeAllWs() {
    if (sockets.length > 0) {
      console.debug('[http] Closing all websocket...');
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

    var result = {
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

  /**
   * Open a URI (url, email, phone, ...)
   * @param event
   * @param link
   * @param type
   */
  function openUri(uri, options) {
    options = options || {};

    if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
      var parts = parseUri(uri);

      if (!parts.protocol && options.type) {
        parts.protocol = (options.type == 'email')  ? 'mailto:' :
          ((options.type == 'phone') ? 'tel:' : '');
        uri = parts.protocol + uri;
      }

      // Check if device is enable, on spcial tel: or mailto: protocole
      var validProtocol = (parts.protocol == 'mailto:' || parts.protocol == 'tel:') && Device.enable;
      if (!validProtocol) {
        if (options.onError && typeof options.onError == 'function') {
          options.onError(uri);
        }
        return;
      }
    }
    // Note: If device is enable, this will use InAppBrowser cordova plugin (=_system)
    $window.open(uri,
        (options.target || (Device.enable ? '_system' : '_blank')),
        'location=yes');
  }

  // Get time (UTC)
  function getDateNow() {
    return Math.floor(moment().utc().valueOf() / 1000);
  }

  function isVersionCompatible(minVersion, actualVersion) {
    // TODO: add implementation
    console.debug('[http] TODO: implement check version [{0}] compatible with [{1}]'.format(actualVersion, minVersion));
    return true;
  }

  var cache = angular.copy(csCache.constants);
  cache.clear = function() {
    console.debug('[http] Cleaning cache...');
    csCache.clear(cachePrefix);
  };

  return {
    get: getResource,
    getWithCache: getResourceWithCache,
    post: postResource,
    ws: ws,
    closeAllWs: closeAllWs,
    getUrl : getUrl,
    getServer: getServer,
    uri: {
      parse: parseUri,
      open: openUri
    },
    date: {
      now: getDateNow
    },
    version: {
      isCompatible: isVersionCompatible
    },
    cache: cache
  };
})
;
