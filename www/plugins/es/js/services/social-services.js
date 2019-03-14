angular.module('cesium.es.social.services', ['cesium.es.crypto.services'])

  .factory('SocialUtils', function($filter, $q, CryptoUtils, BMA, csWallet, esCrypto) {
    'ngInject';

    function SocialUtils() {

      var
        regexp = {
          URI: "([a-zA−Z0-9]+)://[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
          EMAIL: "[a-z0-9!#$%&\'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&\'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$",
          PHONE: "[+]?[0-9. ]{9,15}",
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
      regexp.PHONE = exact(regexp.PHONE);
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
          //console.debug("match URI, try to match: " + urlToMatch);
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
        else if (regexp.PHONE.test(url)) {
          type = 'phone';
        }
        if (!type) {
          console.warn("[ES] [social] Unable to detect type of social URL: " + url);
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
          if (social.type == 'curve25519') {
            delete social.issuer;
            if (social.valid) {
              angular.merge(social, getFromUrl(social.url));
            }
          }
          else {
            // Retrieve object from URL, to get the right type (e.g. if new regexp)
            social = getFromUrl(social.url);
          }
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

      function openArray(socials, issuer, recipient) {

        recipient = recipient || csWallet.data.pubkey;

        // Waiting to load crypto libs
        if (!CryptoUtils.isLoaded()) {
          console.debug('[socials] Waiting crypto lib loading...');
          return $timeout(function() {
            return openArray(socials, issuer, recipient);
          }, 100);
        }

        var socialsToDecrypt = _.filter(socials||[], function(social){
          var matches = social.url && social.type == 'curve25519' && regexp.socials.curve25519.exec(social.url);
          if (!matches) return false;
          social.recipient = matches[1];
          social.nonce = matches[2];
          social.url = matches[3];
          social.issuer = issuer;
          social.valid = (social.recipient === recipient);
          return social.valid;
        });
        if (!socialsToDecrypt.length) return $q.when(reduceArray(socials));

        return esCrypto.box.open(socialsToDecrypt, undefined/*=wallet keypair*/, 'issuer', 'url')
          .then(function() {
            // return all socials (encrypted or not)
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
          });
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
