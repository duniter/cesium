angular.module('cesium.help.services', [])

  .constant('csHelpConstants', {
    wallet: {
      stepCount: 4
    }
  })

.factory('csHelp', function($rootScope, csSettings, UIUtils, csHelpConstants, $controller) {
  'ngInject';


  function createHelptipScope(isTour, helpController) {
    if (!isTour && ($rootScope.tour || !csSettings.data.helptip.enable || UIUtils.screen.isSmall())) {
      return; // avoid other helptip to be launched (e.g. csWallet)
    }
    // Create a new scope for the tour controller
    var helptipScope = $rootScope.$new();
    $controller(helpController||'HelpTipCtrl', { '$scope': helptipScope});
    return helptipScope;
  }

  function startWalletHelpTip(index, isTour) {
    index = angular.isDefined(index) ? index : csSettings.data.helptip.wallet;
    isTour = angular.isDefined(isTour) ? isTour : false;

    if (index < 0 || index >= csHelpConstants.wallet.stepCount) return;

    // Create a new scope for the tour controller
    var helptipScope = createHelptipScope(isTour);
    if (!helptipScope) return; // could be undefined, if a global tour already is already started

    helptipScope.tour = isTour;

    return helptipScope.startWalletTour(index, false)
      .then(function(endIndex) {
        helptipScope.$destroy();
        if (!isTour) {
          csSettings.data.helptip.wallet = endIndex;
          csSettings.store();
        }
      });
  }

  return {
    wallet: {
      tour: function() {
        return startWalletHelpTip(0, true);
      },
      helptip: startWalletHelpTip
    }
  };

});
