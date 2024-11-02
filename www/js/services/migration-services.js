angular.module('cesium.services')
.factory('csMigration', function($http, $translate, $window, $ionicPopup) {
  'ngInject';

  const service = {
    check: checkMigrationState
  };

  // Check migration state
  function checkMigrationState() {
    const primaryUrl = 'https://v2s-migration-state.axiom-team.fr';
    const backupUrl = 'https://v2s-migration-state.duniter.org';
    
    // First attempt
    return $http.get(primaryUrl, {
      timeout: 3000
    })
      .then(function(response) {
        if (response.data && response.data.migration === true) {
          return showMigrationPopup();
        }
      })
      .catch(function() {
        // If first route fails, try backup route
        return $http.get(backupUrl, {
          timeout: 5000
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
          e.preventDefault(); // Do not close popup on tap
          openStore();
        }
      }]
    });
  }

  function getStoreUrls() {
    if (ionic.Platform.isAndroid()) {
      return {
        storeUrl: 'market://details?id=fr.duniter.cesium',
        fallbackUrl: 'https://play.google.com/store/apps/details?id=fr.duniter.cesium'
      };
    }
    if (ionic.Platform.isIOS()) {
      return {
        storeUrl: 'itms-apps://itunes.apple.com/app/id1471028018',
        fallbackUrl: 'https://apps.apple.com/us/app/cesium-%C4%9F1/id1471028018'
      };
    }
    return {
      storeUrl: 'https://cesium.app',
      fallbackUrl: 'https://cesium.app'
    };
  }

  function openStore() {
    const urls = getStoreUrls();
    try {
      // Try to open with InAppBrowser first for better integration
      if (window.cordova && window.cordova.InAppBrowser) {
        cordova.InAppBrowser.open(urls.storeUrl, '_system');
      } else {
        // Fallback to direct window.open for web browsers
        $window.open(urls.storeUrl, '_system');
      }
    } catch(e) {
      // If deep link fails, fallback to direct URL
      console.error('Error opening store:', e);
      if (window.cordova && window.cordova.InAppBrowser) {
        cordova.InAppBrowser.open(urls.fallbackUrl, '_system');
      } else {
        $window.open(urls.fallbackUrl, '_system');
      }
    }
  }

  return service;
});
