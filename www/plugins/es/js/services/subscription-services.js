angular.module('cesium.es.subscription.services', ['cesium.services', 'cesium.es.http.services'])
.config(function(PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      // Will force to load this service
      PluginServiceProvider.registerEagerLoadingService('esSubscription');
    }

  })

.factory('esSubscription', function($rootScope, $q, $timeout, esHttp, $state, $sce, $sanitize,
                            esSettings, CryptoUtils, UIUtils, csWallet, csWot, BMA, Device, esWallet) {
  'ngInject';
  var
    constants = {
    },
    regexp = {
    },
    that = this,
    listeners;

  that.raw = {
    getAll: esHttp.get('/subscription/record/_search?_source_excludes=recipientContent&q=issuer::issuer'),
    count: esHttp.get('/subscription/record/_search?size=0&q=issuer::pubkey'),
    add: esHttp.record.post('/subscription/record'),
    update: esHttp.record.post('/subscription/record/:id/_update'),
    category: {
      get: esHttp.get('/subscription/category/:id'),
      all: esHttp.get('/subscription/category/_search?sort=order&from=0&size=1000&_source=name,parent,key')
    }
  };

  function onWalletReset(data) {
    data.subscriptions = null;
  }

  function onWalletLogin(data, deferred) {
    deferred = deferred || $q.defer();
    if (!data || !data.pubkey || !data.keypair) {
      deferred.resolve();
      return deferred.promise;
    }

    console.debug('[ES] [subscription] Loading subscriptions count...');

    // Load subscriptions count
    that.raw.count({pubkey: data.pubkey})
      .then(function(res) {
        data.subscriptions = data.subscriptions || {};
        data.subscriptions.count = res && res.hits && res.hits.total;
        console.debug('[ES] [subscription] Loaded count (' + data.subscriptions.count  + ')');
        deferred.resolve(data);
      });

    return deferred.promise;
  }

  function loadRecordsByPubkey(issuer, keypair) {
    return that.raw.getAll({issuer: issuer})
      .then(function(res) {
        var records = res && res.hits && res.hits.total &&
          res.hits.hits.reduce(function(res, hit) {
            var record = hit._source;
            record.id = hit._id;
            return res.concat(record);
          }, []) || [];

        return esWallet.box.record.open(records, keypair, 'issuer', 'issuerContent')
          .then(function(records) {
            _.forEach(records, function(record) {
              record.content = JSON.parse(record.issuerContent || '{}');
              delete record.issuerContent;
              delete record.recipientContent;
            });
            return records;
          });
      });
  };

  function addRecord(record) {
    if (!record || !record.type || !record.content || !record.recipient) {
      return $q.reject("Missing arguments 'record' or 'record.type' or 'record.content' or 'record.recipient'");
    }

    var issuer = csWallet.data.pubkey;

    var contentStr = JSON.stringify(record.content);

    // Get a unique nonce
    return CryptoUtils.util.random_nonce()
      // Encrypt contents
      .then(function(nonce) {
        return $q.all([
          esWallet.box.record.pack({issuer: issuer, issuerContent: contentStr}, csWallet.data.keypair, 'issuer', 'issuerContent', nonce),
          esWallet.box.record.pack({recipient: record.recipient, recipientContent: contentStr}, csWallet.data.keypair, 'recipient', 'recipientContent', nonce)
        ]);
      })
      // Merge encrypted record
      .then(function(res){
        var encryptedRecord = angular.merge(res[0], res[1]);
        encryptedRecord.type = record.type;

        // Post subscription
        return that.raw.add(encryptedRecord)
          .then(function(id) {
            record.id = id;
            return record;
          });
      })
      ;
  }

  function updateRecord(record) {
    if (!record || !record.content || !record.recipient) {
      return $q.reject("Missing arguments 'record' or 'record.content', or 'record.recipient'");
    }

    var issuer = csWallet.data.pubkey;
    var contentStr = JSON.stringify(record.content);

    // Get a unique nonce
    return CryptoUtils.util.random_nonce()
    // Encrypt contents
      .then(function(nonce) {
        return $q.all([
          esWallet.box.record.pack({issuer: issuer, issuerContent: contentStr}, csWallet.data.keypair, 'issuer', 'issuerContent', nonce),
          esWallet.box.record.pack({recipient: record.recipient, recipientContent: contentStr}, csWallet.data.keypair, 'recipient', 'recipientContent', nonce)
        ]);
      })
      // Merge encrypted record
      .then(function(res){
        var encryptedRecord = angular.merge(res[0], res[1]);
        encryptedRecord.type = record.type;

        // Post subscription
        return that.raw.update(encryptedRecord, {id:record.id})
          .then(function() {
            return record; // return original record
          });
      })
      ;
  }

  function getCategories() {
    if (that.raw.categories && that.raw.categories.length) {
      var deferred = $q.defer();
      deferred.resolve(that.raw.categories);
      return deferred.promise;
    }

    return that.raw.category.all()
      .then(function(res) {
        if (res.hits.total === 0) {
          that.raw.categories = [];
        }
        else {
          var categories = res.hits.hits.reduce(function(result, hit) {
            var cat = hit._source;
            cat.id = hit._id;
            return result.concat(cat);
          }, []);
          // add as map also
          _.forEach(categories, function(cat) {
            categories[cat.id] = cat;
          });
          that.raw.categories = categories;
        }
        return that.raw.categories;
      });
  }

  function getCategory(params) {
    return that.raw.category.get(params)
      .then(function(hit) {
        var res = hit._source;
        res.id = hit._id;
        return res;
      });
  }

  function removeListeners() {
    _.forEach(listeners, function(remove){
      remove();
    });
    listeners = [];
  }

  function addListeners() {
    // Extend
    listeners = [
      csWallet.api.data.on.login($rootScope, onWalletLogin, this),
      csWallet.api.data.on.init($rootScope, onWalletReset, this),
      csWallet.api.data.on.reset($rootScope, onWalletReset, this)
    ];
  }

  function refreshState() {
    var enable = esHttp.alive;
    if (!enable && listeners && listeners.length > 0) {
      console.debug("[ES] [subscription] Disable");
      removeListeners();
      if (csWallet.isLogin()) {
        return onWalletReset(csWallet.data);
      }
    }
    else if (enable && (!listeners || listeners.length === 0)) {
      console.debug("[ES] [subscription] Enable");
      addListeners();
      if (csWallet.isLogin()) {
        return onWalletLogin(csWallet.data);
      }
    }
  }

  // Default actions
  Device.ready().then(function() {
    esHttp.api.node.on.start($rootScope, refreshState, this);
    esHttp.api.node.on.stop($rootScope, refreshState, this);
    return refreshState();
  });

  // Exports
  that.record = {
    load: loadRecordsByPubkey,
    add: addRecord,
    update: updateRecord,
    remove: esHttp.record.remove('subscription', 'record')
  };
  that.category = {
    all: getCategories,
    get: getCategory
  };
  that.constants = constants;

  return that;
})
;
