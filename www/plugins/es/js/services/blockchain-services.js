angular.module('cesium.es.blockchain.services', ['cesium.services', 'cesium.es.http.services', 'cesium.es.user.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esBlockchain');
    }

  })

.factory('esBlockchain', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, esUser) {
  'ngInject';

  function factory(host, port) {

    var
      CONSTANTS = {
        DEFAULT_SEARCH_SIZE: 40,
        ES_CORE_API_ENDPOINT: "ES_CORE_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))"
      },
      FIELDS = {
        COMMONS: ['number', 'hash', 'medianTime', 'issuer']
      },
      listeners,
      exports = {
        node: {},
        block: {},
        raw: {
          block: {
            search: esHttp.post(host, port, '/:currency/block/_search'),
            searchText: esHttp.get(host, port, '/:currency/block/_search?q=:text'),
            get: esHttp.get(host, port, '/:currency/block/:number/_source')
          }
        },
        regex: {
          ES_CORE_API_ENDPOINT: exact(CONSTANTS.ES_CORE_API_ENDPOINT)
        }
      };

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function copy(otherNode) {
      removeListeners();
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
      addListeners();
    }

    exports.node.parseEndPoint = function(endpoint) {
      var matches = REGEX.ES_CORE_API_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        "dns": matches[2] || '',
        "ipv4": matches[4] || '',
        "ipv6": matches[6] || '',
        "port": matches[8] || 80
      };
    };


    exports.raw.block.processSearchResult = function(res, options) {
      options = options || {};
      options.excludeCurrent = angular.isDefined(options.excludeCurrent) ? options.excludeCurrent : false;
      options.fillAvatar = angular.isDefined(options.fillAvatar) ? options.fillAvatar : true;
      options.cleanData = angular.isDefined(options.cleanData) ? options.cleanData : true;

      var hasExcludedCurrent = false;
      var hits = res && res.hits ? res.hits.hits.reduce(function(res, hit) {
        if (hit._id == 'current' && options.excludeCurrent) {
          hasExcludedCurrent = true;
          return res;
        }
        if (!hit._source) return res;
        var block = new Block(hit._source);
        if (options.cleanData) {
          block.cleanData(); // release data's arrays
        }
        return res.concat(block);
      }, []) : [];
      var result = {
        hits: hits,
        took: res.took,
        total: res && res.hits && res.hits.total ? (
          options.excludeCurrent ? res.hits.total-1 : res.hits.total) : 0
      };

      // Fill avatar
      if (result.hits.length && options.fillAvatar) {
        return esUser.profile.fillAvatars(result.hits, 'issuer')
          .then(function() {
            return result;
          });
      }

      return result;
    };

    exports.block.search = function(currency, options) {
      var request = options ? angular.copy(options) : {};
      delete request.excludeCurrent;
      delete request.fillAvatar;
      delete request.skipData;
      request.from = request.from || 0;
      request.size = request.size || CONSTANTS.DEFAULT_SEARCH_SIZE;
      request._source = request._source || FIELDS.COMMONS;
      if (options._source && options._source == '*') {
        delete request._source;
      }

      return exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          return exports.raw.block.processSearchResult(res, options);
        });
    };

    exports.block.searchText = function(currency, text, options) {
      var request = options || {};
      request.from = request.from || 0;
      request.size = request.size || CONSTANTS.DEFAULT_SEARCH_SIZE;
      request._source = request._source || FIELDS.COMMONS;
      if (options._source && options._source == '*') {
        delete request._source;
      }

      request.currency=currency;
      request.text=text||'';

      return exports.raw.block.searchText(request)
        .then(exports.raw.block.processSearchResult);
    };


    function removeListeners() {
      console.debug("[ES] [blockchain] Disable");
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function addListeners() {
      console.debug("[ES] [blockchain] Enable");

      listeners = [
        //csWot.api.data.on.search($rootScope, onWotSearch, this)
      ];
    }

    function isEnable() {
      return csSettings.data.plugins &&
         csSettings.data.plugins.es &&
         host && csSettings.data.plugins.es.enable;
    }

    function refreshListeners() {
      var enable = isEnable();
      if (!enable && listeners && listeners.length > 0) {
        removeListeners();
      }
      else if (enable && (!listeners || listeners.length === 0)) {
        addListeners();
      }
    }

    // Listen for settings changed
    csSettings.api.data.on.changed($rootScope, function(){
      refreshListeners();
    });

    // Default action
    refreshListeners();

    return exports;
  }

  var host = csSettings.data.plugins && csSettings.data.plugins.es ? csSettings.data.plugins.es.host : null;
  var port = host ? csSettings.data.plugins.es.port : null;

  var service = factory(host, port);
  service.instance = factory;
  return service;
})
;
