angular.module('cesium.user.services', ['cesium.services', 'cesium.es.services'])

.factory('UserService', function(APP_CONFIG, $rootScope, ESUtils) {
  'ngInject';

    function UserService(server) {

      return {
        profile: {
          get: ESUtils.get('http://' + server + '/user/profile/:id'),
          add: ESUtils.record.post('http://' + server + '/user/profile'),
          update: ESUtils.record.post('http://' + server + '/user/profile/:id/_update'),
          avatar: ESUtils.get('http://' + server + '/user/profile/:id?_source=avatar')
        }
      };
    }

    var enable = !!APP_CONFIG.DUNITER_NODE_ES;
    if (!enable) {
      return null;
    }

    var service = UserService(APP_CONFIG.DUNITER_NODE_ES);
    service.instance = UserService;

  return service;
})
;
