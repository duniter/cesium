
angular.module('cesium.graph.common.controllers', ['cesium.services'])

  .controller('GpCurrencyAbstractCtrl', GpCurrencyAbstractController)
;

function GpCurrencyAbstractController($scope, $filter, $ionicPopover, $ionicHistory, $state, csSettings, csCurrency, esHttp) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = $scope.formData || {
    useRelative: csSettings.data.useRelative,
    timePct: 100,
    rangeDuration: 'day',
    firstBlockTime: 0
  };
  $scope.formData.useRelative = angular.isDefined($scope.formData.useRelative) ?
    $scope.formData.useRelative : csSettings.data.useRelative;
  $scope.scale = 'linear';
  $scope.height = undefined;
  $scope.width = undefined;
  $scope.maintainAspectRatio = true;
  $scope.times = [];

  function _truncDate(time) {
    return moment.unix(time).utc().startOf($scope.formData.rangeDuration).unix();
  }

  $scope.enter = function (e, state) {
    if ($scope.loading) {

      if (state && state.stateParams) {
        // remember state, to be able to refresh location
        $scope.stateName = state && state.stateName;
        $scope.stateParams = angular.copy(state && state.stateParams||{});

        if (!$scope.formData.currency && state && state.stateParams && state.stateParams.currency) { // Currency parameter
          $scope.formData.currency = state.stateParams.currency;
        }
        if (state.stateParams.timePct) {
          $scope.formData.timePct = state.stateParams.timePct;
        }
        if (state.stateParams.group) {
          $scope.formData.rangeDuration = state.stateParams.group;
        }
      }

      $scope.init(e, state);

      // Make sure there is currency, or load it not
      if (!$scope.formData.currency) {
        return csCurrency.default()
          .then(function (currency) {
            $scope.formData.currency = currency ? currency.name : null;
            $scope.formData.firstBlockTime = currency ? _truncDate(currency.firstBlockTime) : 0;
            if (!$scope.formData.firstBlockTime){
              console.warn('[graph] currency.firstBlockTime not loaded ! Should have been loaded by currrency service!');
            }
            $scope.formData.currencyAge = _truncDate(esHttp.date.now()) - $scope.formData.firstBlockTime;
            return $scope.enter(e, state);
          });
      }

      $scope.load()
        .then(function () {
          $scope.loading = false;
        });
    }
  };
  $scope.$on('$csExtension.enter', $scope.enter);
  $scope.$on('$ionicParentView.enter', $scope.enter);

  $scope.updateLocation = function() {
    $ionicHistory.nextViewOptions({
      disableAnimate: true,
      disableBack: true,
      historyRoot: true
    });

    $scope.stateParams = $scope.stateParams || {};
    $scope.stateParams.t = $scope.formData.timePct < 100 || $scope.formData.timePct >= 0 ? $scope.formData.timePct : undefined;
    $scope.stateParams.stepUnit = $scope.formData.rangeDuration != 'day' ? $scope.formData.rangeDuration : undefined;

    $state.go($scope.stateName, $scope.stateParams, {
      reload: false,
      inherit: true,
      notify: false}
    );
  };

  // Allow to fixe size, form a template (e.g. in a 'ng-init' tag)
  $scope.setSize = function(height, width, maintainAspectRatio) {
    $scope.height = height;
    $scope.width = width;
    $scope.maintainAspectRatio = angular.isDefined(maintainAspectRatio) ? maintainAspectRatio : $scope.maintainAspectRatio;
  };

  // When parent view execute a refresh action
  $scope.$on('csView.action.refresh', function(event, context) {
    if (!context || context == 'currency') {
      return $scope.load();
    }
  });

  $scope.init = function(stateParams) {
    // Should be override by subclasses
  };

  $scope.load = function() {
    // Should be override by subclasses
  };

  $scope.setScale = function(scale) {
    $scope.hideActionsPopover();
    $scope.scale = scale;

    var format = $filter('formatInteger');

    _.forEach($scope.options.scales.yAxes, function(yAxe) {
      yAxe.type = scale;
      yAxe.ticks = yAxe.ticks || {};
      if (scale == 'linear') {
        yAxe.ticks.beginAtZero = true;
        delete yAxe.ticks.min;
        yAxe.ticks.callback = function(value) {
          return format(value);
        };
      }
      else {
        yAxe.ticks.min = 0;
        delete yAxe.ticks.beginAtZero;
        delete yAxe.ticks.callback;
        yAxe.ticks.callback = function(value, index) {
          if (!value) return;
          if (Math.log10(value)%1 === 0 || Math.log10(value/3)%1 === 0) {
            return format(value);
          }
          return '';
        };
      }
    });
  };

  $scope.setRangeDuration = function(rangeDuration) {
    $scope.hideActionsPopover();
    if ($scope.formData && rangeDuration == $scope.formData.rangeDuration) return;

    $scope.formData.rangeDuration = rangeDuration;

    // Restore default values
    delete $scope.formData.startTime;
    delete $scope.formData.endTime;
    delete $scope.formData.rangeDurationSec;
    //$scope.formData.timePct = 100;

    // Reload data
    $scope.load();
    // Update location
    $scope.updateLocation();
  };

  $scope.goPreviousRange = function() {
    $scope.formData.startTime -= $scope.times.length * $scope.formData.rangeDurationSec;
    if ($scope.formData.startTime < $scope.formData.firstBlockTime) {
      $scope.formData.startTime = $scope.formData.firstBlockTime;
    }
    $scope.formData.endTime = $scope.formData.startTime + $scope.times.length * $scope.formData.rangeDurationSec;

    // Reload data
    $scope.load();
    // Update location
    $scope.updateLocation();
  };

  $scope.goNextRange = function() {
    $scope.formData.startTime += $scope.times.length * $scope.formData.rangeDurationSec;
    if ($scope.formData.startTime > $scope.formData.firstBlockTime + $scope.formData.currencyAge - $scope.formData.timeWindow) {
      $scope.formData.startTime = $scope.formData.firstBlockTime + $scope.formData.currencyAge - $scope.formData.timeWindow;
    }
    $scope.formData.endTime = $scope.formData.startTime + $scope.times.length * $scope.formData.rangeDurationSec;
    // Reload data
    $scope.load();
    // Update location
    $scope.updateLocation();
  };

  $scope.onRangeChanged = function() {
    $scope.formData.startTime = $scope.formData.firstBlockTime + (parseFloat($scope.formData.timePct) / 100) * ($scope.formData.currencyAge - $scope.formData.timeWindow) ;
    $scope.formData.endTime = $scope.formData.startTime + $scope.times.length * $scope.formData.rangeDurationSec;

    // Reload data
    $scope.load(false);
    // Update location
    $scope.updateLocation();
  };

  $scope.updateRange = function(startTime, endTime, updateTimePct) {
    updateTimePct = angular.isDefined(updateTimePct) ? updateTimePct : true;

    $scope.formData.startTime = startTime;
    $scope.formData.endTime = endTime;
    $scope.formData.timeWindow = $scope.formData.timeWindow || $scope.formData.endTime - $scope.formData.startTime;
    $scope.formData.rangeDurationSec = $scope.formData.rangeDurationSec || $scope.formData.timeWindow / ($scope.times.length-1);

    if (updateTimePct) {
      $scope.formData.timePct = Math.ceil(($scope.formData.startTime - $scope.formData.firstBlockTime) * 100 /
        ($scope.formData.currencyAge - $scope.formData.timeWindow));
    }
  };

  /* -- Popover -- */

  $scope.showActionsPopover = function(event) {
    $scope.hideActionsPopover();
    $ionicPopover.fromTemplateUrl('plugins/graph/templates/common/popover_range_actions.html', {
      scope: $scope
    }).then(function(popover) {
      $scope.actionsPopover = popover;
      //Cleanup the popover when we're done with it!
      $scope.$on('$destroy', function() {
        $scope.actionsPopover.remove();
      });
      $scope.actionsPopover.show(event);
    });
  };

  $scope.hideActionsPopover = function() {
    if ($scope.actionsPopover) {
      $scope.actionsPopover.hide();
    }
  };
}
