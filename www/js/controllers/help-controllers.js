
angular.module('cesium.help.controllers', ['cesium.services'])

  .config(function($stateProvider) {
    'ngInject';

    $stateProvider

      .state('app.help', {
        url: "/help?anchor",
        views: {
          'menuContent': {
            templateUrl: "templates/help/view_help.html",
            controller: 'HelpCtrl'
          }
        }
      })

      .state('app.help_anchor', {
        url: "/help/:anchor",
        views: {
          'menuContent': {
            templateUrl: "templates/help/view_help.html",
            controller: 'HelpCtrl'
          }
        }
      })

    ;


  })

  .controller('HelpCtrl', HelpController)

  .controller('HelpModalCtrl', HelpModalController)

;


function HelpController($scope, $state, $timeout, $anchorScroll, csSettings) {
  'ngInject';

  $scope.$on('$ionicView.enter', function(e) {
    $scope.locale = csSettings.data.locale.id;
    if ($state.stateParams && $state.stateParams.anchor) {
      $timeout(function () {
        $anchorScroll($state.stateParams.anchor);
      }, 100);
    }
  });
}

function HelpModalController($scope, $timeout, $anchorScroll, csSettings, parameters) {
  'ngInject';

  $scope.locale = csSettings.data.locale.id;

  if (parameters && parameters.anchor) {
    $timeout(function() {
      $anchorScroll(parameters.anchor);
    }, 100);
  }
}
