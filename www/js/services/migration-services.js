angular.module('cesium.services')
.factory('csMigration', function($http, $translate, $window, $ionicPopup) {
  'ngInject';

  const service = {
    check: checkMigrationState
  };

  // Check migration state
  function checkMigrationState() {
    // Skip migration check if not on mobile platform
    if (!ionic.Platform.isAndroid() && !ionic.Platform.isIOS()) {
      return Promise.resolve();
    }

    const primaryUrl = 'https://v2s-migration-state.axiom-team.fr';
    const backupUrl = 'https://v2s-migration-state.duniter.org';
    
    // First attempt
    return $http.get(primaryUrl, {
      timeout: 2000
    })
      .then(function(response) {
        if (response.data && response.data.migration === true) {
          return showMigrationPopup();
        }
      })
      .catch(function() {
        // If first route fails, try backup route
        return $http.get(backupUrl, {
          timeout: 3000
        })
          .then(function(response) {
            if (response.data && response.data.migration === true) {
              return showMigrationPopup();
            }
          })
          .catch(function(err) {
            // If both routes fail, log error and continue
            console.error('[migration] Error checking migration state:', err);
            // Let the app continue normally
            return Promise.resolve();
          });
      });
  }

  function showMigrationPopup() {
    return $ionicPopup.show({
      title: '<h3 class="text-center"><strong>' + $translate.instant('MIGRATION.UPDATE_REQUIRED') + '</strong></h3>',
      template: '<div class="text-center migration-message">' +
               '<p class="padding">' + $translate.instant('MIGRATION.UPDATE_REQUIRED_MESSAGE') + '</p>' +
               '</div>',
      cssClass: 'update-required migration-popup',
      backdropClickToClose: false,
      hardwareBackButtonClose: false,
      buttons: [{
        text: '<b>' + $translate.instant('MIGRATION.UPDATE_ACTION') + '</b>',
        type: 'button-positive button-large',
        onTap: function(e) {
          e.preventDefault();
          var storeUrl = ionic.Platform.isAndroid() ?
            'https://play.google.com/store/apps/details?id=fr.duniter.cesium' :
            'https://apps.apple.com/us/app/cesium-%C4%9F1/id1471028018';
          $window.open(storeUrl, '_system');
        }
      }]
    });
  }

  return service;
});
