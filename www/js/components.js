angular.module('cesium.components', [])

  .component('csBadgeCertification', {
    bindings: {
      requirements: '=',
      parameters: '<',
      csId: '@'
    },
    templateUrl: 'templates/common/badge_certification_count.html'
  })

  .component('csBadgeGivenCertification', {
    bindings: {
      identity: '=',
      parameters: '<',
      csId: '@'
    },
    templateUrl: 'templates/common/badge_given_certification_count.html'
  })

  .component('csSortIcon', {
    bindings: {
      asc: '=',
      sort: '=',
      toggle: '<'
    },
    template:
    '<i class="ion-chevron-up" ng-class="{gray: !$ctrl.asc || $ctrl.sort != $ctrl.toggle}" style="position: relative; left: 5px; top:-5px; font-size: 9px;"></i>' +
    '<i class="ion-chevron-down" ng-class="{gray : $ctrl.asc || $ctrl.sort != $ctrl.toggle}" style="position: relative; left: -2.6px; top: 3px; font-size: 9px;"></i>'
  })

;
