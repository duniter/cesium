angular.module('cesium.es.document.services', ['ngResource', 'cesium.platform', 'cesium.es.http.services'])
  .config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esDocument');
    }

  })

  .factory('esDocument', function($q, $rootScope, $timeout, UIUtils, Api, CryptoUtils,
                                  csPlatform, csConfig, csSettings, csWot, csWallet, esHttp) {
    'ngInject';

    var
      constants = {
        DEFAULT_LOAD_SIZE: 40
      },
      fields = {
        commons: ["issuer", "pubkey", "hash", "time", "recipient", "nonce", "read_signature"],
        peer: ["*"],
        movement: ["*"]
      },
      raw = {
        search: esHttp.post('/:index/:type/_search'),
        searchText: esHttp.get('/:index/:type/_search?q=:text&_source=:source')
      };

    function _initOptions(options) {
      if (!options || !options.index || !options.type) throw new Error('Missing mandatory options [index, type]');

      var side = 'desc';
      if (options.type === 'peer') {
        if (!options.sort || options.sort.time) {
          side = options.sort && options.sort.time || side;
          options.sort = {
            'stats.medianTime': {
              nested_path: 'stats',
              order: side
            }
          };
        }
        options._source = fields.peer;
        options.getTimeFunction = function(doc) {
          doc.time = doc.stats && doc.stats.medianTime;
          return doc.time;
        };
      }
      else if (options.type === 'movement') {
        if (!options.sort || options.sort.time) {
          side = options.sort && options.sort.time || side;
          options.sort = {'medianTime': side};
        }
        options._source = options._source || fields.movement;
        options.getTimeFunction = function(doc) {
          doc.time = doc.medianTime;
          return doc.time;
        };
      }

      return options;
    }

    function _readSearchHits(res, options) {
      options.issuerField = options.issuerField || 'pubkey';

      var hits = (res && res.hits && res.hits.hits || []).reduce(function(res, hit) {
        var doc = hit._source || {};
        doc.docType = doc.type; // Save source.type, before replacement
        doc.index = hit._index;
        doc.type = hit._type;
        doc.id = hit._id;
        doc.pubkey = doc.issuer || options.issuerField && doc[options.issuerField] || doc.pubkey; // need to call csWot.extendAll()
        doc.time = options.getTimeFunction && options.getTimeFunction(doc) || doc.time;
        doc.thumbnail = esHttp.image.fromHit(hit, 'avatar') || esHttp.image.fromHit(hit, 'thumbnail');
        return res.concat(doc);
      }, []);


      var recipients = hits.reduce(function(res, doc) {
        if (doc.recipient) {
          doc.recipient = {
            pubkey: doc.recipient
          };
          return res.concat(doc.recipient);
        }
        return res;
      }, []);

      return csWot.extendAll(hits.concat(recipients))
        .then(function() {
          return  {
            hits: hits,
            took: res.took,
            total: res && res.hits && res.hits.total || 0
          };
        });
    }

    function readSearchHit(hit) {
      var options = _initOptions({
        index: hit._index,
        type: hit._type
      });

      return _readSearchHits({
        hits: {
          hits: [hit]
        }
      }, options)
        .then(function(res) {
          return res.hits[0];
        });
    }

    function search(options) {
      options = _initOptions(options);

      var request = {
        from: options.from || 0,
        size: options.size || constants.DEFAULT_LOAD_SIZE,
        sort: options.sort || {time:'desc'},
        _source: options._source || fields.commons
      };
      if (options.query) {
        request.query = options.query;
      }

      return raw.search(request, {
        index: options.index,
        type: options.type
      })
        .then(function(res) {
          return _readSearchHits(res, options);
        });
    }

    function searchText(queryString, options) {

      options = options || {};

      var request = {
        text: queryString,
        index: options.index || 'user',
        type: options.type || 'profiles',
        from: options.from || 0,
        size: options.size || constants.DEFAULT_LOAD_SIZE,
        sort: options.sort || 'time:desc',
        source: options._source && options._source.join(',') || fields.commons.join(',')
      };

      console.debug('[ES] [wallet] [document] [{0}/{1}] Loading documents...'.format(
        options.index,
        options.type
      ));
      var now = Date.now();

      return raw.searchText(request)
        .then(function(res) {
          return _readSearchHits(res, options);
        })
        .then(function(res) {
          console.debug('[ES] [document] [{0}/{1}] Loading {2} documents in {3}ms'.format(
            options.index,
            options.type,
            res && res.hits && res.hits.length || 0,
            Date.now() - now
          ));
          return res;
        });
    }

    function remove(document, options) {
      if (!document || !document.index || !document.type || !document.id) return $q.reject('Could not remove document: missing mandatory fields');

      return esHttp.record.remove(document.index, document.type)(document.id, options);
    }

    function removeAll(documents, options) {
      if (!documents || !documents.length) return;

      var wallet = options && options.walletId && csWallet.children.get(options.walletId) || csWallet;

      return wallet.auth() // Auth once
        .then(function() {
          // Remove each doc
          return $q.all(documents.reduce(function (res, doc) {
            return res.concat(esHttp.record.remove(doc.index, doc.type)(doc.id, {wallet: wallet}));
          }, []));
        });
    }

    return {
      search: search,
      searchText: searchText,
      remove: remove,
      removeAll: removeAll,
      fields: {
        commons: fields.commons
      },
      fromHit: readSearchHit
    };
  })
;
