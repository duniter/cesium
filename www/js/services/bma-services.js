//var Base58, Base64, scrypt_module_factory = null, nacl_factory = null;

angular.module('cesium.bma.services', ['cesium.http.services', 'ngResource',
    'cesium.config'])

.factory('BMA', function($q, APP_CONFIG, HttpUtils) {
  'ngInject';

  function BMA(server) {

    var
    errorCodes = {
        NO_MATCHING_IDENTITY: 2001,
        UID_ALREADY_USED: 2003,
        NO_MATCHING_MEMBER: 2004,
        NO_IDTY_MATCHING_PUB_OR_UID: 2021,
        MEMBERSHRIP_ALREADY_SEND: 2007
      },
    regex = {
      USER_ID: "[A-Za-z0-9_-]*",
      PUBKEY: "[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{43,44}",
      COMMENT: "[ a-zA-Z0-9-_:/;*\\[\\]()?!^\\+=@&~#{}|\\\\<>%.]*",
      URI: "duniter://[a-zA-Z0-9-.]+.[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+"
    },
    constants = {
      CACHE_TIME_MS: 60000
    },
    data = {
      blockchain: {
        current: null
      },
      wot: {
        members: [],
        memberUidsByPubkey: []
      }
    };

    this.getBlockchainBlock = HttpUtils.get('http://' + server + '/blockchain/block/:block');
    this.getBlockchainWithUd = HttpUtils.get('http://' + server + '/blockchain/with/ud');
    this.getBlockchainCurrentNoCache = HttpUtils.get('http://' + server + '/blockchain/current');
    this.getMembersNoCache = HttpUtils.get('http://' + server + '/wot/members');

    function exact(regexpContent) {
      return new RegExp("^" + regexpContent + "$");
    }

    function copy(otherNode) {
      if (!!this.instance) {
        var instance = this.instance;
        angular.copy(otherNode, this);
        this.instance = instance;
      }
      else {
        angular.copy(otherNode, this);
      }
    }


    function getBlockchainCurrent(cache) {
      return $q(function(resolve, reject) {
        var now = new Date();
        if (cache && data.blockchain.current !== null &&
            (now.getTime() - data.blockchain.current.timestamp) <= constants.CACHE_TIME_MS) {
          resolve(data.blockchain.current.result);
          return;
        }
        getBlockchainCurrentNoCache()
        .then(function(block) {
          data.blockchain.current = {
            result: block,
            timestamp: now.getTime()
          };
          resolve(block);
        });
      });
    }


    function getMembers(cache) {
      return $q(function(resolve, reject) {
        var now = new Date();
        if (cache && data.wot && data.wot.members && data.wot.members.length > 0 &&
            (now.getTime() - data.wot.membersTimestamp) <= constants.CACHE_TIME_MS){
          resolve(data.wot.members);
        }
        else {
          getMembersNoCache()
          .then(function(json){
            data.wot.members = json.results;
            data.wot.membersTimestamp = now.getTime();
            resolve(data.wot.members);
          })
          .catch(function(err) {
            data.wot.members = [];
            data.wot.membersTimestamp = now.getTime();
            reject(err);
          });
        }
      });
    }

    function getMemberByPubkey(pubkey, cache) {
      if (cache == "undefined") {
        cache = true;
      }
      return $q(function(resolve, reject) {
        getMemberUidsByPubkey(cache)
        .then(function(memberUidsByPubkey){
          var uid = memberUidsByPubkey[pubkey];
          resolve({
            pubkey: pubkey,
            uid: (uid ? uid : null)
          });
        })
        .catch(function(err) {
          reject(err);
        });
      });
    }

    function getMemberUidsByPubkey(cache) {
      return $q(function(resolve, reject) {
        var now = new Date();
        if (cache && data.wot && data.wot.member && data.wot.memberUidsByPubkey && data.wot.memberUidsByPubkey.length > 0 &&
            (now.getTime() - data.wot.memberUidsByPubkeyTimestamp) <= constants.CACHE_TIME_MS){
          resolve(data.wot.memberUidsByPubkey);
        }
        else {
          getMembers(false/* no cache*/)
          .then(function(members){
            var result = {};
            data.wot.members.forEach(function(member){
              result[member.pubkey] = member.uid;
            });
            data.wot.memberUidsByPubkey = result;
            data.wot.memberUidsByPubkeyTimestamp = now.getTime();
            resolve(result);
          })
          .catch(function(err) {
            reject(err);
          });
        }
      });
    }

    function getBlockchainLastUd(cache) {
      return $q(function(resolve, reject) {
        var now = new Date();
        if (cache && data.blockchain && data.blockchain.lastUd && (now.getTime() - data.blockchain.lastUdTimestamp) <= constants.CACHE_TIME_MS){
          resolve(data.blockchain.lastUd);
        }
        else {
          getBlockchainWithUd()
          .then(function(res){
            if (res.result.blocks.length) {
              var lastBlockWithUD = res.result.blocks[res.result.blocks.length - 1];
              return getBlockchainBlock({ block: lastBlockWithUD })
                .then(function(block){
                  var currentUD = (block.unitbase > 0) ? block.dividend * Math.pow(10, block.unitbase) : block.dividend;
                  resolve(currentUD);
                });
            }
          })
          .catch(function(err) {
            reject(err);
          });
        }
      });
    }

    function resetWotData() {
      data.wot = {};
    }

    function resetData() {
      resetWotData();
    }

    return {
      node: {
        summary: HttpUtils.get('http://' + server + '/node/summary'),
        url: server
      },
      wot: {
        lookup: HttpUtils.get('http://' + server + '/wot/lookup/:search'),
        member: {
          all: getMembers,
          uids: getMemberUidsByPubkey,
          get: getMemberByPubkey
        },
        requirements: HttpUtils.get('http://' + server + '/wot/requirements/:pubkey'),
        add: HttpUtils.post('http://' + server + '/wot/add'),
        certify: HttpUtils.post('http://' + server + '/wot/certify')
      },
      network: {
        peering: {
          peers: HttpUtils.get('http://' + server + '/network/peering/peers')
        },
        peers: HttpUtils.get('http://' + server + '/network/peers')
      },
      currency: {
        parameters: HttpUtils.get('http://' + server + '/blockchain/parameters')
      },
      blockchain: {
        current: getBlockchainCurrent,
        block: getBlockchainBlock,
        membership: HttpUtils.post('http://' + server + '/blockchain/membership'),
        stats: {
          ud: getBlockchainWithUd,
          tx: HttpUtils.get('http://' + server + '/blockchain/with/tx')
        },
        lastUd: getBlockchainLastUd
      },
      tx: {
        sources: HttpUtils.get('http://' + server + '/tx/sources/:pubkey'),
        process: HttpUtils.post('http://' + server + '/tx/process'),
        history: {
          all: HttpUtils.get('http://' + server + '/tx/history/:pubkey'),
          times: HttpUtils.get('http://' + server + '/tx/history/:pubkey/times/:from/:to'),
          blocks: HttpUtils.get('http://' + server + '/tx/history/:pubkey/blocks/:from/:to')
        }
      },
      ud: {
        history: HttpUtils.get('http://' + server + '/ud/history/:pubkey')
      },
      websocket: {
        block: function() {
          return HttpUtils.ws('ws://' + server + '/ws/block');
        },
        peer: function() {
          return HttpUtils.ws('ws://' + server + '/ws/peer');
        },
        close : HttpUtils.closeAllWs
      },
      copy: copy,
      cache: {
        all: {
          reset: resetData
        },
        wot: {
          reset: resetWotData
        }
      },
      errorCodes: errorCodes,
      regex: {
        USER_ID: exact(regex.USER_ID),
        COMMENT: exact(regex.COMMENT),
        PUBKEY: exact(regex.PUBKEY),
        URI: exact(regex.URI)
      }
    };
  }

  var service = BMA(APP_CONFIG.DUNITER_NODE, APP_CONFIG.TIMEOUT);
  service.instance = BMA;
  return service;
})
;
