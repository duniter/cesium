angular.module('cesium.es.social.services', ['ngResource'])

.factory('SocialUtils', function($filter) {
  'ngInject';

    function SocialUtils() {

      var
      regex = {
        URI: "([a-z]+)://[ a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+",
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
          bitcoin: "bitcoin://[a-zA-Z0-9-_:/;*?!^\\+=@&~#|<>%.]+"
        }
      }
      ;

      function exact(regexpContent) {
        return new RegExp("^" + regexpContent + "$");
      }
      regex.URI = exact(regex.URI);
      regex.EMAIL = exact(regex.EMAIL);
      _.keys(regex.socials).forEach(function(key){
        regex.socials[key] = exact(regex.socials[key]);
      });

      function getTypeFromUrl(url){
        var type;
        if (regex.URI.test(url)) {
          var protocol = regex.URI.exec(url)[1];
          var urlToMatch = url;
          if (protocol == 'http' || protocol == 'https') {
            var slashPathIndex = url.indexOf('/', protocol.length + 3);
            if (slashPathIndex > 0) {
              urlToMatch = url.substring(0, slashPathIndex);
            }
          }
          console.log("match URI, try to match: " + urlToMatch);
          _.keys(regex.socials).forEach(function(key){
            if (regex.socials[key].test(urlToMatch)) {
              type = key;
              return false; // stop
            }
          });
          if (!type || type === null) {
            type = 'web';
          }
        }
        else if (regex.EMAIL.test(url)) {
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
        var map = {};
        socials.forEach(function(social) {
          social = getFromUrl(social.url);
          if (social) {
            var id = $filter('formatSlug')(social.url);
            map[id] = social;
          }
        });
        return _.values(map);
      }

      return {
        get: getFromUrl,
        reduce: reduceArray
      };
    }

    var service = SocialUtils();
    service.instance = SocialUtils;

  return service;
})
;
