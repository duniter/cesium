angular.module('cesium.es.subscription.controllers', ['cesium.es.services'])

  .config(function($stateProvider) {

    $stateProvider
      .state('app.edit_subscriptions', {
        cache: false,
        url: "/wallet/subscriptions",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/subscription/edit_subscriptions.html",
            controller: 'ViewSubscriptionsCtrl'
          }
        },
        data: {
          auth: true,
          minData: true
        }
      })

      .state('app.edit_subscriptions_by_id', {
        cache: false,
        url: "/wallets/:id/subscriptions",
        views: {
          'menuContent': {
            templateUrl: "plugins/es/templates/subscription/edit_subscriptions.html",
            controller: 'ViewSubscriptionsCtrl'
          }
        },
        data: {
          login: true,
          minData: true
        }
      });

  })

 .controller('ViewSubscriptionsCtrl', ViewSubscriptionsController)

 .controller('ModalEmailSubscriptionsCtrl', ModalEmailSubscriptionsController)

;

function ViewSubscriptionsController($scope, $q, $ionicHistory, csWot, csWallet, UIUtils, ModalUtils, esSubscription) {
  'ngInject';

  $scope.loading = true;
  $scope.popupData = {}; // need for the node popup
  $scope.search = {
    results: [],
    loading: true
  };
  $scope.emailFrequencies = [
    {id: "daily", label: "daily"},
    {id: "weekly", label: "weekly"}
  ];

  var wallet;

  $scope.enter = function(e, state) {

    // First load
    if ($scope.loading) {

      wallet = (state.stateParams && state.stateParams.id) ? csWallet.children.get(state.stateParams.id) : csWallet;
      if (!wallet) {
        UIUtils.alert.error('ERROR.UNKNOWN_WALLET_ID');
        return $scope.showHome();
      }

      $scope.loadWallet({
        wallet: wallet,
        auth: true,
        minData: true
      })
        .then(function() {
          UIUtils.loading.hide();
          return $scope.load();
        })
        .catch(function(err){
          if (err == 'CANCELLED') {
            UIUtils.loading.hide(10);
            $ionicHistory.goBack();
            return;
          }
          UIUtils.onError('SUBSCRIPTION.ERROR.LOAD_SUBSCRIPTIONS_FAILED')(err);
        });
    }

  };
  $scope.$on('$ionicView.enter', $scope.enter);

  $scope.load = function() {
    $scope.loading = true; // to avoid the call of doSave()
    return esSubscription.record.load(wallet.data.pubkey, wallet.data.keypair)
      .then(function(results) {
        // Group by type
        var groups = _.groupBy((results || []), function (record) {
          return [record.type, record.recipient].join('|');
        });
        return _.keys(groups).reduce(function (res, key) {
          var parts = key.split('|');
          return res.concat({
            type: parts[0],
            recipient: parts[1],
            items: groups[key]
          });
        }, []);
      })
      .then(function(results) {
        return csWot.extendAll(results, 'recipient');
      })
      // Display result
      .then($scope.updateView)
      .catch(function(err){
        UIUtils.loading.hide(10);
        if (err && err.ucode == 404) {
          $scope.updateView([]);
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
        else {
          UIUtils.alert.notImplemented();
        }
      })
      .then(function(record) {
        if (!record) return;
        UIUtils.loading.show();
        esSubscription.record.add(record, wallet)
          .then($scope.addToUI)
          .then(function() {
            wallet.data.subscriptions = wallet.data.subscriptions || {count: 0};
            wallet.data.subscriptions.count++;
            UIUtils.loading.hide();
            $scope.updateView();
          })
          .catch(UIUtils.onError('SUBSCRIPTION.ERROR.ADD_SUBSCRIPTION_FAILED'));
      });
  };

  $scope.editSubscription = function(record) {

    // get subscription parameters
    var promise;
    var oldRecord = angular.copy(record);
    if (record.type == 'email') {
      promise = $scope.showEmailModal(record);
    }
    if (!promise) return;
    return promise
      .then(function(res) {
        if (!res) return;
        UIUtils.loading.show();
        record.id = oldRecord.id;
        return esSubscription.record.update(record, wallet)
          .then(function() {
            // If recipient change, update in results
            if (oldRecord.type != record.type ||
              oldRecord.recipient != record.recipient) {
              $scope.removeFromUI(oldRecord);
              return $scope.addToUI(record);
            }
          })
          .then(function() {
            UIUtils.loading.hide();
            $scope.updateView();
          })
          .catch(UIUtils.onError('SUBSCRIPTION.ERROR.UPDATE_SUBSCRIPTION_FAILED'));
      });
  };

  $scope.deleteSubscription = function(record, confirm) {
    if (!record || !record.id) return;

    if (!confirm) {
      return UIUtils.alert.confirm('SUBSCRIPTION.CONFIRM.DELETE_SUBSCRIPTION')
        .then(function(confirm) {
          if (confirm) return $scope.deleteSubscription(record, confirm);
        });
    }

    UIUtils.loading.show();
    esSubscription.record.remove(record.id, {wallet: wallet})
      .then(function() {
        wallet.data.subscriptions = wallet.data.subscriptions || {count: 1};
        wallet.data.subscriptions.count--;
        $scope.removeFromUI(record);
        UIUtils.loading.hide();
      })
      .catch(UIUtils.onError('SUBSCRIPTION.ERROR.DELETE_SUBSCRIPTION_FAILED'));
  };

  $scope.removeFromUI = function(record) {
    var subscriptions = _.findWhere($scope.search.results, {type: record.type, recipient: record.recipient});
    var index = _.findIndex(subscriptions.items, record);
    if (index >= 0) {
      subscriptions.items.splice(index, 1);
    }
    if (!subscriptions.items.length) {
      index = _.findIndex($scope.search.results, subscriptions);
      $scope.search.results.splice(index, 1);
    }
  };

  $scope.addToUI = function(record) {
    $scope.search.results = $scope.search.results || [];
    var subscriptions = _.findWhere($scope.search.results,
      {type: record.type, recipient: record.recipient});

    if (!subscriptions) {
      subscriptions = {type: record.type, recipient: record.recipient, items: []};
      return csWot.extendAll([subscriptions], 'recipient')
        .then(function(){
          subscriptions.items.push(record);
          $scope.search.results.push(subscriptions);
          return record;
        });
    }

    subscriptions.items.push(record);
    return $q.when(record);
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


function ModalEmailSubscriptionsController($scope, Modals, csSettings, esHttp, csWot, parameters) {
  'ngInject';

  $scope.frequencies = [
    {id: "daily", label: "daily"},
    {id: "weekly", label: "weekly"}
  ];
  $scope.formData = parameters || {};
  $scope.formData.content = $scope.formData.content || {};
  $scope.formData.content.frequency = $scope.formData.content.frequency || $scope.frequencies[0].id; // set to first value
  $scope.recipient = {};

  $scope.$on('modal.shown', function() {
    // Load recipient (uid, name, avatar...)
    if ($scope.formData.recipient) {
      $scope.recipient = {pubkey: $scope.formData.recipient};
      return csWot.extendAll([$scope.recipient]);
    }
  });

  // Submit
  $scope.doSubmit = function() {
    $scope.form.$submitted = true;
    if (!$scope.form.$valid || !$scope.formData.content.email || !$scope.formData.content.frequency) return;

    var record = {
      type: 'email',
      recipient: $scope.formData.recipient,
      content: {
        email: $scope.formData.content.email,
        locale: csSettings.data.locale.id,
        frequency: $scope.formData.content.frequency
      }
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
      endpointFilter: esHttp.constants.ES_USER_API_ENDPOINT
    })
      .then(function (peer) {
        if (peer) {
          $scope.recipient = peer;
          $scope.formData.recipient = peer.pubkey;
        }
      });

  };
}
