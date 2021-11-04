angular.module('cesium.graph.data.services', ['cesium.wot.services', 'cesium.es.http.services', 'cesium.es.wot.services'])

  .factory('gpData', function($rootScope, $q, $timeout, csHttp, esHttp, BMA, csWot, csCache, esWot) {
    'ngInject';

    var
      cachePrefix = 'gpData-',
      currencyCache = csCache.get(cachePrefix + 'currency-', csCache.constants.SHORT),
      exports = {
        node: {},
        wot: {},
        blockchain: {},
        docstat: {},
        synchro: {
          execution: {}
        },
        raw: {
          block: {
            search: esHttp.post('/:currency/block/_search')
          },
          blockstat: {
            search: esHttp.post('/:currency/blockstat/_search')
          },
          movement: {
            search: esHttp.post('/:currency/movement/_search')
          },
          user: {
            event: esHttp.post('/user/event/_search?pretty')
          },
          docstat: {
            search: esHttp.post('/document/stats/_search')
          },
          synchro: {
            search: esHttp.post('/:currency/synchro/_search')
          }

        },
        regex: {
        }
      };

    function _powBase(amount, base) {
      return base <= 0 ? amount : amount * Math.pow(10, base);
    }

    function rawLightInstance(host, port, useSsl, timeout) {
      port = port || 80;
      useSsl = angular.isDefined(useSsl) ? useSsl : (port == 443);

      return {
        docstat: {
          search: csHttp.post(host, port, '/document/stats/_search', useSsl, timeout)
        },
        synchro: {
          search: csHttp.post(host, port, '/:currency/synchro/_search', useSsl, timeout)
        }
      };
    }

    function _initRangeOptions(options) {
      options = angular.copy(options);
      options.maxRangeSize = options.maxRangeSize || 30;
      options.defaultTotalRangeCount = options.defaultTotalRangeCount || options.maxRangeSize*2;

      options.rangeDuration = options.rangeDuration || 'day';
      options.endTime = angular.isDefined(options.endTime) ? options.endTime : moment().utc().add(1, options.rangeDuration).unix();
      options.startTime = angular.isDefined(options.startTime) ? options.startTime :
        moment.unix(options.endTime).utc().subtract(options.defaultTotalRangeCount, options.rangeDuration).unix();
      // Make to sure startTime is never before the currency starts - fix #483
      if (options.firstBlockTime && options.startTime < options.firstBlockTime) {
        options.startTime = options.firstBlockTime;
      }
      return options;
    }

    function _getManyRanges(options) {

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);
      var result = [];
      var ranges = [];
      while (from.isBefore(to)) {

        ranges.push({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (ranges.length === options.maxRangeSize) || !from.isBefore(to);
        if (flush) {
          result.push(ranges);
          ranges = [];
        }
      }

      if (ranges.length) {
        result.push(ranges);
      }

      return result;
    }

    /**
     * Graph: "blocks count by issuer"
     * @param currency
     * @returns {*}
     */
    exports.blockchain.countByIssuer = function(currency, options) {
      options = options || {};

      var filters = [];
      if (options.startTime > 0) {
        // Round to hour, to be able to use cache
        var startTime = Math.floor(options.startTime / 60 / 60 ) * 60 * 60;
        filters.push({range: {time: {gte: startTime}}});
      }

      var request = {
        size: 0,
        aggs: {
          blocksByIssuer: {
            terms: {
              field: 'issuer',
              size: 0
            }
          }
        }
      };

      if (filters.length) {
        request.query = {bool: {}};
        request.query.bool.filter = filters;
      }

      var params = {
        currency: currency,
        request_cache: angular.isDefined(options.cache) ? options.cache : true // enable by default
      };

      return exports.raw.block.search(request, params)
        .then(function(res) {
          var aggs = res.aggregations;
          if (!aggs.blocksByIssuer || !aggs.blocksByIssuer.buckets || !aggs.blocksByIssuer.buckets.length) return;

          var result = {
            blockCount: res.hits.total
          };
          result.data = (aggs.blocksByIssuer.buckets || []).reduce(function(res, agg) {
              return res.concat(agg.doc_count);
            }, []);
          result.issuers = (aggs.blocksByIssuer.buckets || []).reduce(function(res, agg) {
            return res.concat({pubkey: agg.key});
          }, []);

          return csWot.extendAll(result.issuers)
            .then(function() {
              // Set labels, using name, uid or pubkey
              result.labels = result.issuers.reduce(function(res, issuer) {
                return res.concat(issuer.name || issuer.uid || issuer.pubkey.substr(0,8));
              }, []);
              return result;
            });
        });
      };

    /**
     * All block with dividend
     * @param currency
     * @returns {*}
     */
    exports.blockchain.withDividend = function(currency, options) {
      options = options || {};
      var withCache = angular.isDefined(options.withCache) ? options.withCache : true; // enable by default

      var cacheKey = [currency, JSON.stringify(options)].join('-');
      if (withCache) {
        var result = currencyCache.get(cacheKey);
        if (result) {
          // should be already a promise (previous call still running)
          if (!result.blocks) {
            var deferred = $q.defer();
            result.then(function(res) {
              //console.debug("[graph] Detected a duplicated request on monetaryMass [" + currency + "]: will use same request result");
              deferred.resolve(res);
              return res;
            });
            return deferred.promise;
          }
          console.debug("[graph] monetaryMass for [" + currency + "] found in cache");
          return $q.when(result);
        }
      }

      var request = {
        query: {
          filtered: {
            filter: {
              bool: {
                must: [
                  {
                    exists: {
                      field: 'dividend'
                    }
                  }
                ]
              }
            }
          }
        },
        size: options.size || 10000,
        from: options.from || 0,
        _source: ["medianTime", "number", "dividend", "monetaryMass", "membersCount", "unitbase"],
        sort: {
          "medianTime" : "asc"
        }
      };

      var promise = $q.all([
        // Get the current block (if need)
        options.withCurrent ?
          BMA.blockchain.current()
          .catch(function(err) {
            // Special case when currency not started
            if (err && err.ucode == BMA.errorCodes.NO_CURRENT_BLOCK) return undefined;
            throw err;
          }) : $q.when(),
        // Send search request to the ES node
        exports.raw.block.search(request, {currency: currency})
      ])
        .then(function(res) {
          var currentBlock = res[0];
          res = res[1];
          if (!res.hits.total || !res.hits.hits.length) return;

          var result = {};
          result.blocks = res.hits.hits.reduce(function(res, hit){
            var block = hit._source;

            // Apply unitbase on dividend
            block.dividend = _powBase(block.dividend, block.unitbase);
            delete block.unitbase;

            return res.concat(block);
          }, []);

          // Add current block
          if (currentBlock) {
            var deltaWithLastDividend = result.blocks.length && (currentBlock.medianTime - result.blocks[result.blocks.length-1].medianTime);
            if (deltaWithLastDividend && deltaWithLastDividend >= 60*60) {
              // Apply unitbase on dividend
              currentBlock.dividend = _powBase(currentBlock.dividend, currentBlock.unitbase);
              delete currentBlock.unitbase;
              result.blocks.push(currentBlock);
            }
          }

          result.times = result.blocks.reduce(function(res, block){
            return res.concat(block.medianTime);
          }, []);

          // replace promise in cache, with data
          currencyCache.put(cacheKey, result);
          return result;
        });
      currencyCache.put(cacheKey, promise);

      return promise;
    };

    /**
     * Graph: "tx count"
     * @param currency
     * @returns {*}
     */
    exports.blockchain.txCount = function(currency, options) {

      options = _initRangeOptions(options);

      var jobs = [];

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);
      var ranges = [];
      while(from.isBefore(to)) {

        ranges.push({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (ranges.length === options.maxRangeSize) || !from.isBefore(to);
        if (flush) {
          var request = {
            size: 0,
            aggs: {
              tx: {
                range: {
                  field: "medianTime",
                  ranges: ranges
                },
                aggs: {
                  txCount : {
                    stats: {
                      field : "txCount"
                    }
                  },
                  txAmount : {
                    stats: {
                      field : "txAmount"
                    }
                  }
                }

              }
            }

          };

          if (options.issuer) {
            request.query = {bool: {filter: {term: {issuer: options.issuer}}}};
          }
          // prepare next loop
          ranges = [];

          if (jobs.length === 10) {
            console.error('Too many parallel jobs!');
            from = moment.unix(options.endTime).utc(); // stop while
          }
          else {
            jobs.push(
              exports.raw.blockstat.search(request, {currency: currency})
                .then(function (res) {
                  var aggs = res.aggregations;
                  if (!aggs.tx || !aggs.tx.buckets || !aggs.tx.buckets.length) return;
                  return (aggs.tx.buckets || []).reduce(function (res, agg) {
                    return res.concat({
                      from: agg.from,
                      to: agg.to,
                      count: agg.txCount.sum||0,
                      amount: agg.txAmount.sum || 0,
                      avgByBlock: Math.round(agg.txCount.avg * 100) / 100,
                      maxByBlock: agg.txCount.max
                    });
                  }, []);
                })
            );
          }
        }
      } // loop

      return $q.all(jobs)
        .then(function(res) {
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          res = _.sortBy(res, 'from');

          return {
            count: _.pluck(res, 'count'),
            avgByBlock: _.pluck(res, 'avgByBlock'),
            maxByBlock: _.pluck(res, 'maxByBlock'),
            amount:  res.reduce(function(res, hit){
              return res.concat(hit.amount/100);
            }, []),
            times: _.pluck(res, 'from')
          };
        });
    };

    /**
     * Graph: "block count"
     * @param currency
     * @returns {*}
     */
    exports.node.blockCount = function(currency, pubkey) {

      var request = {
        size: 0,
        query: {bool: {filter: {term: {issuer: pubkey}}}}
      };

      return exports.raw.block.search(request, {currency: currency})
        .then(function (res) {
          return res.hits.total;
        });
    };


    exports.raw.movement.getByRange = function(currency, pubkey, ranges) {
      if (!pubkey) {
        throw new Error('Missing \'pubkey\' argument!');
      }
      var request = {
        size: 0,
        query: {
          bool: {
            should: [
              {term: {recipient: pubkey}},
              {term: {issuer: pubkey}}
            ]
          }
        },
        aggs: {
          tx: {
            range: {
              field: "medianTime",
              ranges: ranges
            },
            aggs: {
              received: {
                filter: {term: {recipient: pubkey}},
                aggs: {
                  received_stats: {
                    stats: {
                      field: "amount"
                    }
                  }
                }
              },
              sent: {
                filter: {term: {issuer: pubkey}},
                aggs: {
                  sent_stats: {
                    stats: {
                      field: "amount"
                    }
                  }
                }
              }
            }

          }
        }
      };

      return exports.raw.movement.search(request, {currency: currency})
        .then(function(res) {
          var aggs = res.aggregations;
          if (!aggs.tx || !aggs.tx.buckets || !aggs.tx.buckets.length) return;
          return (aggs.tx.buckets || []).reduce(function (res, agg) {
            var sent = agg.sent.sent_stats;
            var received = agg.received.received_stats;
            return res.concat({
              from: agg.from,
              to: agg.to,
              sent: sent.sum ? (-sent.sum / 100) : 0,
              received: received.sum ? (received.sum / 100) : 0
            });
          }, []);
        });
    };

    exports.raw.movement.getUds = function(currency, ranges, fromMapping) {
      var request = {
        size: 0,
        query: {
          bool: {
            should: [
              {exists: {field: 'dividend'}}
            ]
          }
        },
        aggs: {
          ud: {
            range: {
              field: 'medianTime',
              ranges: ranges
            },
            aggs: {
              ud_stats: {
                stats: {
                  field: 'dividend'
                }
              },
              unitbase_stats: {
                stats: {
                  field: 'unitbase'
                }
              }
            }
          }
        }
      };

      return exports.raw.block.search(request, {currency: currency})
        .then(function(res) {
          var aggs = res.aggregations;
          if (!aggs.ud || !aggs.ud.buckets || !aggs.ud.buckets.length) return;
          return (aggs.ud.buckets || []).reduce(function (res, agg) {
            var from = fromMapping[agg.from];
            res[from] = _powBase(agg.ud_stats.sum, agg.unitbase_stats.min) / 100;
            return res;
          }, {});
        });
    };

    /**
     * Graph: "tx amount"
     * @param currency
     * @returns {*}
     */
    exports.blockchain.movement = function(currency, options) {

      options = _initRangeOptions(options);
      options.withUD = angular.isDefined(options.withUD) ? options.withUD : true;

      var jobs = [];

      // If need and missing: load membership periods
      if (options.withUD && !options.memberships) {
        return esWot.memberships(options.pubkey)
          .then(function(res) {
            options.memberships = res || [];
            // loop, with membership filled
            return exports.blockchain.movement(currency, options);
          });
      }

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);

      var ranges = [];
      var udRanges = [];
      var udFromMapping = {};
      var memberships = angular.copy(options.memberships).reverse();
      var membership = memberships.pop();

      function addRange(range) {
        ranges.push(range);
        var member = membership && membership.joinTime < range.to;
        if (member) {
          var udRange = {
            from: Math.max(membership.joinTime, range.from),
            to: Math.min(membership.leaveTime, range.to)
          };
          udRanges.push(udRange);
          udFromMapping[udRange.from] = range.from;
          while (membership && (membership.leaveTime && membership.leaveTime < range.to)) {
            membership = memberships.pop();
          }
        }
      }

      // Add a range to get TX before startTime
      addRange({
        from: 0,
        to: from.unix()
      });

      while(from.isBefore(to)) {

        addRange({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (!jobs.length && ranges.length == options.maxRangeSize+1) ||
          (jobs.length && ranges.length == options.maxRangeSize) ||
          !from.isBefore(to);
        if (flush) {
          if (udRanges.length) {
            jobs.push($q.all([
              exports.raw.movement.getUds(currency, udRanges, udFromMapping),
              exports.raw.movement.getByRange(currency, options.pubkey, ranges)
            ])
            .then(function(res){
              var udsMap = res[0];
              res = res[1];
              // fill UD
              res.forEach(function(hit){
                hit.ud = (udsMap[hit.from]) || 0;
              });
              return res;
            }));
          }
          else {
            jobs.push(exports.raw.movement.getByRange(currency, options.pubkey, ranges)
              .then(function(res){
                // fill UD
                res.forEach(function(hit){
                  hit.ud = 0;
                });
                return res;
              }));
          }

          // reset ranges for the next loop
          ranges = [];
        }
      } // loop

      return $q.all(jobs)
        .then(function(res) {
          // concat all results
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          if (!res.length) return;

          // Sort by 'from' field
          res = _.sortBy(res, 'from');

          // First item should be history (tx before startTime)
          var history = res.splice(0,1)[0];
          var balance = history.received + history.sent + history.ud;

          return {
            times: _.pluck(res, 'from'),
            ud: _.pluck(res, 'ud'),
            sent: _.pluck(res, 'sent'),
            received: _.pluck(res, 'received'),
            balance: res.reduce(function(res, hit){
              balance += hit.received + hit.sent + hit.ud;
              return res.concat(balance);
            }, [])
          };
        });
    };


    /**
     * Graph: "tx count"
     * @param currency
     * @returns {*}
     */
    exports.wot.certifications = function(options) {

      options = _initRangeOptions(options);

      return csWot.load(options.pubkey)
        .then(function(idty) {
          if (!idty) return;
          var res = {};
          _.forEach(idty.given_cert||[], function(cert){
            var truncTime = moment.unix(cert.time).utc().startOf(options.rangeDuration).unix();
            res[truncTime] = res[truncTime] || {time:truncTime,given:0,received:0};
            res[truncTime].given++;
          });
          _.forEach(idty.received_cert||[], function(cert){
            var truncTime = moment.unix(cert.time).utc().startOf(options.rangeDuration).unix();
            res[truncTime] = res[truncTime] || {time:truncTime,given:0,received:0};
            res[truncTime].received++;
          });

          // Sort by time
          res = _.sortBy(_.values(res), 'time');

          // create final result
          var result = {
            times: _.pluck(res, 'time'),
            deltaGiven: _.pluck(res, 'given'),
            deltaReceived: _.pluck(res, 'received')
          };
          var sum = 0;
          result.given = result.deltaGiven.reduce(function(res, delta) {
            sum += delta;
            return res.concat(sum);
          }, []);
          sum = 0;
          result.received = result.deltaReceived.reduce(function(res, delta) {
            sum += delta;
            return res.concat(sum);
          }, []);
          return result;

        });
    };


    exports.wot.memberships = function(options) {

      options = options || {};

      // Get user events on membership state
      var request = {
        "size": 1000,
        "query": {
          "bool": {
            "filter": [
              {"term": {"recipient" : options.pubkey }},
              {"terms": {"code" : ["MEMBER_JOIN","MEMBER_ACTIVE","MEMBER_LEAVE","MEMBER_EXCLUDE","MEMBER_REVOKE"] }}
            ]
          }
        },
        "sort" : [
          { "time" : {"order" : "asc"}}
        ],
        _source: ["code", "time"]
      };

      return exports.raw.user.event(request)

        .then(function(res) {
          if (!res.hits || !res.hits.total) return;

          // Compute member periods
          var lastJoinTime;
          var result = res.hits.hits.reduce(function(res, hit){
            var isMember = hit._source.code == 'MEMBER_JOIN' || hit._source.code == 'MEMBER_ACTIVE';
            // If join
            if (isMember && !lastJoinTime) {
              lastJoinTime = hit._source.time;
            }
            // If leave
            else if (!isMember && lastJoinTime) {
              // Add an entry
              res = res.concat({
                joinTime: lastJoinTime,
                leaveTime: hit._source.time
              });
              lastJoinTime = 0; // reset
            }
            return res;
          }, []);

          if (lastJoinTime) {
            // Add last entry if need
            result.push({
              joinTime: lastJoinTime,
              leaveTime: moment().utc().unix()
            });
          }

          return result;
        });
    };

    /**
     * Graph: "statictics on ES documents"
     * @param currency
     * @returns {*}
     */
    exports.docstat.get = function(options) {

      options = _initRangeOptions(options);

      if (options.server) {
        var serverParts = options.server.split(':');
        var host = serverParts[0];
        var port = serverParts[1] || 80;
        searchRequest = rawLightInstance(host, port, options.useSsl).docstat.search;
      }

      var filters = [];
      if (options.index) {
        console.debug('[graph] filter on index:', options.index);
        filters.push({term : { index: options.index}});
      }
      if (options.types) {
        console.debug('[graph] filter on types:', options.types);
        filters.push({terms : { type: options.types}});
      }
      var request = {
        size: 0,
        aggs: {
          range: {
            range: {
              field: "time",
              ranges: [] // Will be replace
            }
          }
        }
      };


      if (options.queryNames) {
        console.debug('[graph] filter on queryNames:', options.queryNames);
        filters.push({terms : { queryName: options.queryNames }});
        request.aggs.range.aggs = {
          queryName: {
            terms: {
              field: "queryName",
              size: 0
            },
            aggs: {
              max: {
                max: {
                  field: "count"
                }
              }
            }
          }
        };
      }
      else {
        request.aggs.range.aggs = {
          index: {
            terms: {
              field: "index",
              size: 0
            },
            aggs: {
              type: {
                terms: {
                  field: "type",
                  size: 0
                },
                aggs: {
                  max: {
                    max: {
                      field: "count"
                    }
                  }
                }
              }
            }
          }
        };
      }

      // Add filter on request
      if (filters.length > 0) {
        request.query = request.query || {};
        request.query.bool = request.query.bool || {};
        request.query.bool.filter =  filters;
      }

      var params = {
        request_cache: angular.isDefined(options.cache) ? options.cache : true // enable by default
      };

      var indices = {};
      var processSearchResult = function (res) {
        var aggs = res.aggregations;
        return _.map(aggs.range && aggs.range.buckets || [], function (agg) {
          var item = { from: agg.from, to: agg.to };
          if (agg.queryName) {
            _.forEach(agg.queryName && agg.queryName.buckets || [], function (agg) {
              var key = agg.key;
              item[key] = agg.max.value;
              if (!indices[key]) indices[key] = true;
            });
          }
          else{
            _.forEach(agg.index && agg.index.buckets || [], function (agg) {
              var key = agg.key;
              if (agg.max) {
                item[key] = agg.max.value;
                if (!indices[key]) indices[key] = true;
              } else {
                _.forEach(agg.type && agg.type.buckets || [], function (agg) {
                  var typeKey = key + '_' + agg.key;
                  item[typeKey] = agg.max.value;
                  if (!indices[typeKey]) indices[typeKey] = true;
                });
              }
            });
          }
          return item;
        });
      };

      var jobs = _.map(_getManyRanges(options), function(ranges) {
        var req = angular.copy(request);
        req.aggs.range.range.ranges = ranges;

        // Execute request
        return exports.raw.docstat.search(req, params)
          .then(processSearchResult);
      });

      return $q.all(jobs)
        .then(function(res) {
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          res = _.sortBy(res, 'from');

          return _.keys(indices).reduce(function(series, index) {
            series[index] = _.pluck(res, index);
            return series;
          }, {
            times: _.pluck(res, 'from')
          });
        });
    };


    /**
     * Graph: "statictics on ES documents"
     * @param currency
     * @returns {*}
     */
    exports.synchro.execution.get = function(options) {

      options = _initRangeOptions(options);

      var searchRequest = exports.raw.synchro.search;
      if (options.server) {
        var serverParts = options.server.split(':');
        var host = serverParts[0];
        var port = serverParts[1] || 80;
        searchRequest = rawLightInstance(host, port, options.useSsl).synchro.search;
      }

      var jobs = [];

      var from = moment.unix(options.startTime).utc().startOf(options.rangeDuration);
      var to = moment.unix(options.endTime).utc().startOf(options.rangeDuration);
      var ranges = [];
      var processSearchResult = function (res) {
        var aggs = res.aggregations;

        return (aggs.range && aggs.range.buckets || []).reduce(function (res, agg) {
          var item = {
            from: agg.from,
            to: agg.to,
            inserts: agg.result.inserts.value,
            updates: agg.result.inserts.value,
            deletes: agg.result.deletes.value,
            duration: agg.duration.value
          };
          _.forEach(agg.api && agg.api.buckets || [], function (api) {
            item[api.key] = api.peer_count && api.peer_count.value || 0;
            if (!apis[api.key]) apis[api.key] = true;
          });

          return res.concat(item);
        }, []);
      };

      while(from.isBefore(to)) {

        ranges.push({
          from: from.unix(),
          to: from.add(1, options.rangeDuration).unix()
        });

        // Flush if max range count, or just before loop condition end (fix #483)
        var flush = (ranges.length === options.maxRangeSize) || !from.isBefore(to);
        if (flush) {
          var request = {
            size: 0,
            aggs: {
              range: {
                range: {
                  field: "time",
                  ranges: ranges
                },
                aggs: {
                  api: {
                    terms: {
                      field: "api",
                      size: 0
                    },
                    aggs: {
                      peer_count: {
                        cardinality: {
                          field: "peer"
                        }
                      }
                    }
                  },
                  duration: {
                    sum: {
                      field: "executionTime"
                    }
                  },
                  result: {
                    nested: {
                      path: "result"
                    },
                    aggs: {
                      inserts : {
                        sum: {
                          field : "result.inserts"
                        }
                      },
                      updates : {
                        sum: {
                          field : "result.updates"
                        }
                      },
                      deletes : {
                        sum: {
                          field : "result.deletes"
                        }
                      }
                    }
                  }
                }
              }
            }

          };

          // prepare next loop
          ranges = [];
          var apis = {};

          if (jobs.length === 10) {
            console.error('Too many parallel jobs!');
            from = moment.unix(options.endTime).utc(); // stop while
          }
          else {
            jobs.push(
              searchRequest(request, {currency: options.currency})
                .then(processSearchResult)
            );
          }
        }
      } // loop

      return $q.all(jobs)
        .then(function(res) {
          res = res.reduce(function(res, hits){
            if (!hits || !hits.length) return res;
            return res.concat(hits);
          }, []);

          res = _.sortBy(res, 'from');

          var series = {
            times: _.pluck(res, 'from'),
            inserts: _.pluck(res, 'inserts'),
            updates: _.pluck(res, 'updates'),
            deletes: _.pluck(res, 'deletes'),
            duration: _.pluck(res, 'duration')
          };

          _.keys(apis).forEach(function(api) {
            series[api] = _.pluck(res, api);
          });

          return series;
        });
    };

    function cleanAllCache() {
      console.debug("[graph] Cleaning cache {prefix: '{0}'}...".format(cachePrefix));
      csCache.clear(cachePrefix);
    }

    // Listen if node changed
    esHttp.api.node.on.stop($rootScope, cleanAllCache, this);

    return exports;
  })

;
