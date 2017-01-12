angular.module('cesium')

  .component('csAvatar', {
    bindings: {
      avatar: '<',
      icon: '@'
    },
    template:
    '<i ng-if="!$ctrl.avatar" class="item-image icon {{$ctrl.icon}}"></i>' +
    '<i ng-if="$ctrl.avatar" class="item-image avatar" style="background-image: url({{::$ctrl.avatar.src}})"></i>'
  })

  .component('csBadgeCertification', {
    bindings: {
      requirements: '=',
      parameters: '<',
      csId: '@'
    },
    templateUrl: 'templates/common/badge_certification_count.html'
  })
;
