
angular.module('cesium.network.controllers', ['cesium.services'])

.config(function($stateProvider) {
  'ngInject';

  $stateProvider

     .state('app.view_peer', {
      url: "/network/peer/:server",
      nativeTransitions: {
          "type": "flip",
          "direction": "right"
      },
      views: {
        'menuContent': {
          templateUrl: "templates/network/view_peer.html",
          controller: 'PeerCtrl'
        }
      }
    });
})

.controller('NetworkViewCtrl', NetworkViewController)

.controller('PeerCtrl', PeerController)

;

function NetworkViewController($scope, $timeout, BMA, UIUtils, csSettings, csCurrency, csNetwork) {
  $scope.loadingPeers = true;
  $scope.formData = {
    useRelative: csSettings.data.useRelative
  };

  $scope.screen = UIUtils.screen;

  $scope.$on('$ionicParentView.enter', function(e, state) {
    csCurrency.all()
    .then(function (currencies) {
      if (currencies && currencies.length > 0) {
        $scope.load(currencies[0]);
      }

    })
    .catch(UIUtils.onError('ERROR.GET_CURRENCY_FAILED'));
  });

  $scope.$on('$ionicParentView.beforeLeave', function(){
    csNetwork.close();
  });

  $scope.load = function(currency) {
    $scope.node = !BMA.node.same(currency.peer.host, currency.peer.port) ?
      BMA.instance(currency.peer.host, currency.peer.port) : BMA;

    if ($scope.loadingPeers){
      csNetwork.start($scope.node);

      // Catch event on new peers
      var refreshing = false;
      csNetwork.api.data.on.changed($scope, function(data){
        if (!refreshing) {
          refreshing = true;
          $timeout(function() { // Timeout avoid to quick updates
            console.debug("Updating UI Peers");
            $scope.peers = data.peers;
            // Update currency params

            $scope.loadingPeers = csNetwork.isBusy();
            refreshing = false;
            }, 1100);
        }
      });
      $scope.$on('$destroy', function(){
        csNetwork.close();
      });
    }

    // Show help tip
    $scope.showHelpTip();
  };

  $scope.refresh = function() {
    // Network
    $scope.loadingPeers = true;
    csNetwork.loadPeers();
  };

  // Show help tip
  $scope.showHelpTip = function() {
    if (!$scope.isLogin()) return;
    index = csSettings.data.helptip.currency;
    if (index < 0) return;

    // Create a new scope for the tour controller
    var helptipScope = $scope.createHelptipScope();
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    return helptipScope.startCurrencyTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        csSettings.data.helptip.currency = endIndex;
        csSettings.store();
      });
  };
}
