angular.module('cesium.es.controllers', ['cesium.services', 'ngSanitize'])

 .controller('ESPicturesEditCtrl', ESPicturesEditController)

 .controller('ESCategoryModalCtrl', ESCategoryModalController)

 .controller('ESEmptyModalCtrl', ESEmptyModalController)

;


function ESPicturesEditController($scope, $ionicModal, Wallet, Market, UIUtils, $state, CryptoUtils, $q, $ionicPopup, Device, $timeout, ModalUtils) {
  'ngInject';

  $scope.selectNewPicture = function() {
    if ($scope.isDeviceEnable()){
      openPicturePopup();
    }
    else {
      var fileInput = angular.element(document.querySelector('#editMarket #pictureFile'));
      if (fileInput && fileInput.length > 0) {
        fileInput[0].click();
      }
    }
  };

  $scope.openPicturePopup = function() {
    Device.camera.getPicture()
    .then(function(imageData) {
      $scope.pictures.push({src: "data:image/png;base64," + imageData});
      $scope.$apply();
    })
    .catch(UIUtils.onError('ERROR.TAKE_PICTURE_FAILED'));
  };

  $scope.fileChanged = function(event) {
    UIUtils.loading.show();
    return $q(function(resolve, reject) {
      var file = event.target.files[0];
      UIUtils.image.resizeFile(file)
      .then(function(imageData) {
        $scope.pictures.push({src: imageData});
        UIUtils.loading.hide();
        //$scope.$apply();
        resolve();
      });
    });
  };

  $scope.removePicture = function(index){
    $scope.pictures.splice(index, 1);
  };

  $scope.favoritePicture = function(index){
    if (index > 0) {
      var item = $scope.pictures[index];
      $scope.pictures.splice(index, 1);
      $scope.pictures.splice(0, 0, item);
    }
  };
}


function ESCategoryModalController($scope, UIUtils, $timeout, parameters) {
  'ngInject';

  $scope.loading = true;
  $scope.allCategories = [];
  $scope.categories = [];
  this.searchText = '';

  $scope.afterLoad = function(result) {
    $scope.categories = result;
    $scope.allCategories = result;
    $scope.loading = false;
    $timeout(function() {
      UIUtils.ink();
    }, 10);
  }

  this.doSearch = function() {
    var searchText = this.searchText.toLowerCase().trim();
    if (searchText.length > 1) {
      $scope.loading = true;
      $scope.categories = $scope.allCategories.reduce(function(result, cat) {
        if (cat.parent && cat.name.toLowerCase().search(searchText) != -1) {
            return result.concat(cat);
        }
        return result;
      }, []);

      $scope.loading = false;
    }
    else {
      $scope.categories = $scope.allCategories;
    }
  };

  // load categories
  if (parameters && parameters.categories) {
    $scope.afterLoad(parameters.categories);
  }
  else if (parameters && parameters.load) {
    parameters.load()
    .then(function(res){
      $scope.afterLoad(res);
    })
  }

}


function ESEmptyModalController($scope, parameters) {

}
