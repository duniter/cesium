angular.module('cesium.es.blockchain.services', ['cesium.services', 'cesium.es.http.services'])

.factory('esBlockchain', function($rootScope, $q, $timeout, BMA, csCache, esHttp) {
  'ngInject';

  function EsBlockchain() {

    var
      PUBKEY = BMA.constants.regexp.PUBKEY,
      CONSTANTS = {
        DEFAULT_SEARCH_SIZE: 40,
        ES_CORE_API_ENDPOINT: 'ES_CORE_API( ([a-z_][a-z0-9-_.]*))?( ([0-9.]+))?( ([0-9a-f:]+))?( ([0-9]+))'
      },
      REGEXPS = {
        /* WARNING: keep keys order for UI */
        SEARCH_FILTER: {
          TX_PUBKEY: new RegExp('\\(transactions\\.issuers:('+PUBKEY+') OR transactions\\.outputs:\\*('+PUBKEY+')\\)([ ]+AND)?'),
          ISSUER: new RegExp('issuer:('+PUBKEY+')([ ]+AND)?'),
          MEMBER_FLOWS: new RegExp('\\(_exists_:joiners OR _exists_:leavers OR _exists_:revoked OR _exists_:excluded\\)([ ]+AND)?'),
          EXISTING_TRANSACTION: new RegExp('_exists_:transactions([ ]+AND)?'),
          PERIOD: new RegExp('medianTime:>=?([0-9]+)[ ]+AND[ ]+medianTime:<=?([0-9]+)([ ]+AND)?')
        },
        LAST_AND: /[ ]+AND$/
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
            search: esHttp.post('/:currency/block/_search', csCache.constants.SHORT),
            searchText: esHttp.get('/:currency/block/_search?q=:text'),
            get: esHttp.get('/:currency/block/:number/_source', csCache.constants.SHORT)
          }
        },
        regexp: {
          ES_CORE_API_ENDPOINT: exact(CONSTANTS.ES_CORE_API_ENDPOINT)
        }
      };
    exports.regex = exports.regexp;  // deprecated

    function exact(regexpContent) {
      return new RegExp('^' + regexpContent + '$');
    }

    exports.node.parseEndPoint = function(endpoint) {
      var matches = exports.regexp.ES_CORE_API_ENDPOINT.exec(endpoint);
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
      options.excludeCurrent = angular.isDefined(options.excludeCurrent) ? options.excludeCurrent : true;
      options.fillAvatar = angular.isDefined(options.fillAvatar) ? options.fillAvatar : true;
      options.cleanData = angular.isDefined(options.cleanData) ? options.cleanData : true;

      var hasExcludedCurrent = false;
      var hits = (res && res.hits && res.hits.hits || []).reduce(function(res, hit) {
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
      }, []);
      return {
        hits: hits,
        took: res.took,
        total: res && res.hits && res.hits.total ? (
          hasExcludedCurrent ? res.hits.total-1 : res.hits.total) : 0
      };
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

    exports.block.parseSearchText = function(text, filters) {

      var unparsedText = text;
      filters = _.keys(REGEXPS.SEARCH_FILTER).reduce(function(res, filterType){
        var matches = REGEXPS.SEARCH_FILTER[filterType].exec(unparsedText);
        if (matches) {
          var filterText = matches[0];

          // update rest
          unparsedText = unparsedText.replace(filterText, '');

          filterText = filterText.replace(REGEXPS.LAST_AND, '');

          var filter = {
            type: filterType,
            text: filterText,
            params: matches
          };
          return res.concat(filter);
        }
        return res;
      }, filters||[]);

      return {
        filters: filters,
        text: unparsedText.trim()
      };
    };

    return exports;
  }


  return EsBlockchain();
})
;
