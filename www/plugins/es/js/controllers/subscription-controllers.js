angular.module('cesium.es.subscription.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider.state('app.edit_subscriptions', {
      cache: false,
      url: "/wallet/subscriptions",
      views: {
        'menuContent': {
          templateUrl: "plugins/es/templates/subscription/edit_subscriptions.html",
          controller: 'ViewSubscriptionsCtrl'
        }
      }
    });

  })

 .controller('ViewSubscriptionsCtrl', ViewSubscriptionsController)

 .controller('ModalEmailSubscriptionsCtrl', ModalEmailSubscriptionsController)

;

function ViewSubscriptionsController($scope, $rootScope, $translate, $ionicPopup, UIUtils, ModalUtils, csSettings, esSubscription) {

  $scope.popupData = {}; // need for the node popup
  $scope.search = {
    results: [],
    loading: true
  };
  $scope.emailFrequencies = [
    {id: "daily", label: "daily"},
    {id: "weekly", label: "weekly"}
  ];

  $scope.onEnter = function() {
    $scope.loading = true;
    $scope.loadWallet({minData: true})
      .then(function() {
        UIUtils.loading.hide();
        return $scope.load();
      })
      .catch(function(err){
        if (err == 'CANCELLED') {
          return UIUtils.loading.hide();
        }
        UIUtils.onError('SUBSCRIPTION.ERROR.LOAD_SUBSCRIPTIONS_FAILED')(err);
      });
  };
  $scope.$on('$ionicView.enter', $scope.onEnter);

  $scope.load = function() {
    $scope.loading = true; // to avoid the call of doSave()
    return esSubscription.record.load($rootScope.walletData.pubkey, $rootScope.walletData.keypair)
      .then(function(results) {
        // Group by type
        results = _.groupBy((results || []), function(record) {
          return record.type;
        });
        results = _.keys(results).reduce(function(res, type) {
          return res.concat({type: type, items: results[type]});
        }, []);
        // Display result
        $scope.updateView(results);
      })
      .catch(function(err){
        UIUtils.loading.hide(10);
        if (err && err.ucode == 404) {
          $scope.updateView({});
          $scope.existing = false;
        }
        else {
          UIUtils.onError('PROFILE.ERROR.LOAD_PROFILE_FAILED')(err);
        }
      });
  };

  $scope.updateView = function(results) {
    if (results) {
      $scope.search.results = results;
    }

    if ($scope.search.results && $scope.search.results.length) {
      $scope.motion.show();
    }
    $scope.search.loading = false;
  };

  $scope.addSubscription = function() {
    var type;
    $scope.showCategoryModal()
      .then(function(cat) {
        if (!cat) return;
        type = cat.id;
        // get subscription parameters
        if (type == 'email') {
          return $scope.showEmailModal();
        }
      })
      .then(function(content) {
        UIUtils.loading.hide();
        if (!content) return;

        esSubscription.record.add(type, content)
          .then(function(record) {
            $scope.search.results = $scope.search.results || [];
            var subscriptions = _.findWhere($scope.search.results, {type: type});
            if (!subscriptions) {
              subscriptions = {type: type, items:[]};
              $scope.search.results.push(subscriptions);
            }
            subscriptions.items.push(record);
            $rootScope.walletData.subscriptions = $rootScope.walletData.subscriptions || {count: 0};
            $rootScope.walletData.subscriptions.count++;
            $scope.updateView();
          });
      });
  };

  $scope.editSubscription = function(record) {

    // get subscription parameters
    var promise;
    if (record.type == 'email') {
      promise = $scope.showEmailModal(record.content);
    }
    if (!promise) return;
    return promise
      .then(function(content) {
        UIUtils.loading.hide();
        if (!content) return;
        record.content = angular.copy(content);
        record.recipient = record.content.recipient;
        delete record.content.recipient;
        return esSubscription.record.update(record)
          .then(function() {
            $scope.updateView();
          });
      });
  };

  $scope.deleteSubscription = function(record) {
    if (!record || !record.id) return;

    esSubscription.record.remove(record.id);
    var subscriptions = _.findWhere($scope.search.results, {type: record.type});
    var index = _.findIndex(subscriptions.items, record);
    if (index >= 0) {
      subscriptions.items.splice(index, 1);
      $rootScope.walletData.subscriptions.count--;
    }
    if (!subscriptions.items.length) {
      index = _.findIndex($scope.search.results, subscriptions);
      $scope.search.results.splice(index, 1);
    }
  };

  /* -- modals -- */

  $scope.showCategoryModal = function() {
    // load categories
    return esSubscription.category.all()
      .then(function(categories){
        return ModalUtils.show('plugins/es/templates/common/modal_category.html', 'ESCategoryModalCtrl as ctrl',
          {categories : categories},
          {focusFirstInput: true}
        );
      })
      .then(function(cat){
        if (cat && cat.parent) {
           return cat;
        }
      });
  };

  $scope.showEmailModal = function(parameters) {
    return ModalUtils.show('plugins/es/templates/subscription/modal_email.html','ModalEmailSubscriptionsCtrl',
      parameters, {focusFirstInput: true});
  };
}


function ModalEmailSubscriptionsController($scope, Modals, csSettings, esUser, parameters) {

  $scope.formData = parameters || {};
  $scope.frequencies = [
    {id: "daily", label: "daily"},
    {id: "weekly", label: "weekly"}
  ];
  $scope.provider = {};

  // Submit
  $scope.doSubmit = function() {
    $scope.form.$submitted = true;
    if (!$scope.form.$valid || !$scope.formData.email || !$scope.formData.frequency) return;

    var record = {
      email: $scope.formData.email,
      locale: csSettings.data.locale.id,
      frequency: $scope.formData.frequency,
      recipient: $scope.formData.recipient
    };
    $scope.closeModal(record);
  };

  $scope.cancel = function() {
    $scope.closeModal();
  };

  if (!!$scope.subscriptionForm) {
    $scope.subscriptionForm.$setPristine();
  }

  $scope.showNetworkLookup = function() {
    return Modals.showNetworkLookup({
      enableFilter: true,
      endpointFilter: esUser.constants.ES_USER_API_ENDPOINT
    })
      .then(function (peer) {
        if (peer) {
          $scope.formData.recipient = peer.pubkey;
          $scope.peer = peer;
          var eps = peer.getEndpoints(esUser.constants.ES_USER_API_ENDPOINT);
          peer.bma = esUser.node.parseEndPoint(eps[0]);
        }
      });

  };
}
