angular.module('cesium.es.blockchain.services', ['cesium.services', 'cesium.es.http.services', 'cesium.es.user.services'])

.factory('esBlockchain', function($rootScope, $q, $timeout, esHttp, csConfig, csSettings, esUser) {
  'ngInject';

  function EsBlockchain() {

    var
      CONSTANTS = {
        DEFAULT_SEARCH_SIZE: 40,
        ES_CORE_API_ENDPOINT: 'ES_CORE_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))'
      },
      FIELDS = {
        MINIMAL: ['number', 'hash', 'medianTime', 'issuer'],
        COMMONS: ['number', 'hash', 'medianTime', 'issuer', 'currency', 'version', 'powMin', 'dividend', 'membersCount', 'identities', 'joiners', 'actives', 'leavers', 'revoked', 'excluded', 'certifications', 'transactions']
      },
      exports = {
        node: {},
        block: {},
        raw: {
          block: {
            search: esHttp.post('/:currency/block/_search'),
            searchText: esHttp.get('/:currency/block/_search?q=:text'),
            get: esHttp.get('/:currency/block/:number/_source')
          }
        },
        regex: {
          ES_CORE_API_ENDPOINT: exact(CONSTANTS.ES_CORE_API_ENDPOINT)
        }
      };

    function exact(regexpContent) {
      return new RegExp('^' + regexpContent + '$');
    }

    exports.node.parseEndPoint = function(endpoint) {
      var matches = REGEX.ES_CORE_API_ENDPOINT.exec(endpoint);
      if (!matches) return;
      return {
        dns: matches[2] || '',
        ipv4: matches[4] || '',
        ipv6: matches[6] || '',
        port: matches[8] || 80
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
      request._source = options._source || FIELDS.COMMONS;
      if (options._source && options._source == '*') {
        delete request._source;
      }

      return exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          return exports.raw.block.processSearchResult(res, options);
        });
    };

    exports.block.searchText = function(currency, text, options) {
      if (options && angular.isUndefined(options.excludeCurrent)) {
        options.excludeCurrent = true;
      }
      var request = options ? angular.copy(options) : {};
      delete request.excludeCurrent;
      delete request.fillAvatar;
      delete request.skipData;
      request.from = request.from || 0;
      request.size = request.size || CONSTANTS.DEFAULT_SEARCH_SIZE;
      request._source = options._source || FIELDS.COMMONS.join(',');
      if (options._source && options._source == '*') {
        delete request._source;
      }

      request.currency=currency;
      request.text=text||'';

      return exports.raw.block.searchText(request)
        .then(function(res) {
          return exports.raw.block.processSearchResult(res, options);
        });
    };

    return exports;
  }

  return EsBlockchain();
})
;
