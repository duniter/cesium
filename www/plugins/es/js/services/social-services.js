angular.module('cesium.es.social.services', ['cesium.es.crypto.services'])

.factory('SocialUtils', function($filter, $q, CryptoUtils, BMA, esCrypto) {
  'ngInject';

    function SocialUtils() {

      var
      regexp = {
        URI: "([a-zA−Z0-9]+)://[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
        EMAIL: "[a-zA-Z0-9-_.]+@[a-zA-Z0-9_.-]+?\\.[a-zA-Z]{2,3}",
        socials: {
          facebook: "https?://((fb.me)|((www.)?facebook.com))",
          twitter: "https?://(www.)?twitter.com",
          googleplus: "https?://plus.google.com(/u)?",
          youtube: "https?://(www.)?youtube.com",
          github: "https?://(www.)?github.com",
          tumblr: "https?://(www.)?tumblr.com",
          snapchat: "https?://(www.)?snapchat.com",
          linkedin: "https?://(www.)?linkedin.com",
          vimeo: "https?://(www.)?vimeo.com",
          instagram: "https?://(www.)?instagram.com",
          wordpress: "https?://([a-z]+)?wordpress.com",
          diaspora: "https?://(www.)?((diaspora[-a-z]+)|(framasphere)).org",
          duniter: "duniter://[a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
          bitcoin: "bitcoin://[a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
          curve25519: "curve25519://(" + BMA.constants.regexp.PUBKEY + "):([a-zA-Z0-9]+)@([a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+)"
        }
      }
      ;

      function exact(regexpContent) {
        return new RegExp("^" + regexpContent + "$");
      }
      regexp.URI = exact(regexp.URI);
      regexp.EMAIL = exact(regexp.EMAIL);
      _.keys(regexp.socials).forEach(function(key){
        regexp.socials[key] = exact(regexp.socials[key]);
      });

      function getTypeFromUrl(url){
        var type;
        if (regexp.URI.test(url)) {
          var protocol = regexp.URI.exec(url)[1];
          var urlToMatch = url;
          if (protocol == 'http' || protocol == 'https') {
            var slashPathIndex = url.indexOf('/', protocol.length + 3);
            if (slashPathIndex > 0) {
              urlToMatch = url.substring(0, slashPathIndex);
            }
          }
          console.log("match URI, try to match: " + urlToMatch);
          _.keys(regexp.socials).forEach(function(key){
            if (regexp.socials[key].test(urlToMatch)) {
              type = key;
              return false; // stop
            }
          });
          if (!type) {
            type = 'web';
          }
        }
        else if (regexp.EMAIL.test(url)) {
          type = 'email';
        }
        if (!type) {
            console.log("match type: " + type);
        }
        return type;
      }

      function getFromUrl(url) {
        url = url ? url.trim() : url;
        if (url && url.length > 0) {
          if (url.startsWith('www.')) {
            url = 'http://' + url;
          }
          return {
            type: getTypeFromUrl(url),
            url: url
          };
        }
        return;
      }

      function reduceArray(socials) {
        if (!socials || !socials.length) return [];
        var map = {};
        socials.forEach(function(social) {
          social = social.type == 'curve25519' ? social : getFromUrl(social.url);
          if (social) {
            var id = $filter('formatSlug')(social.url);
            map[id] = social;
          }
        });
        return _.values(map);
      }

      function createSocialForEncryption(recipient, dataToEncrypt) {
        return {
          recipient: recipient,
          type: 'curve25519',
          url: dataToEncrypt
        };
      }

      function openArray(socials) {

        // Waiting to load crypto libs
        if (!CryptoUtils.isLoaded()) {
          console.debug('[socials] Waiting crypto lib loading...');
          return $timeout(function() {
            return openArray(socials);
          }, 100);
        }

        var encryptedSocials = _.filter(socials||[], function(social){
          var matches = social.url && social.type == 'curve25519' && regexp.socials.curve25519.exec(social.url);
          if (!matches) return false;
          social.recipient = matches[1];
          social.nonce = matches[2];
          social.url = matches[3];
          return true;
        });
        if (!encryptedSocials.length) return $q.when(reduceArray(socials));

        return esCrypto.box.open(encryptedSocials, undefined/*=wallet keypair*/, 'recipient', 'url')
          .then(function() {
            return reduceArray(socials);
          });
      }

      function packArray(socials) {
        // Waiting to load crypto libs
        if (!CryptoUtils.isLoaded()) {
          console.debug('[socials] Waiting crypto lib loading...');
          return $timeout(function() {
            return packArray(socials);
          }, 100);
        }

        var socialsToEncrypt = _.filter(socials||[], function(social){
          return social.type == 'curve25519' && social.url && social.recipient;
        });
        if (!socialsToEncrypt.length) return $q.when(socials);

        return CryptoUtils.util.random_nonce()
            .then(function(nonce) {
              return $q.all(socialsToEncrypt.reduce(function(res, social) {
                return res.concat(esCrypto.box.pack(social, undefined/*=wallet keypair*/, 'recipient', 'url', nonce));
              }, []));
            })
            .then(function(res){
              return res.reduce(function(res, social) {
                return res.concat({
                  type: 'curve25519',
                  url: 'curve25519://{0}:{1}@{2}'.format(social.recipient, social.nonce, social.url)
                });
              }, []);
            })
            ;
      }

      return {
        get: getFromUrl,
        reduce: reduceArray,
        // Encryption
        createForEncryption: createSocialForEncryption,
        open: openArray,
        pack: packArray
      };
    }

    var service = SocialUtils();
    service.instance = SocialUtils;

  return service;
})
;
