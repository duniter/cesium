
angular.module('cesium.graph.currency.controllers', ['chart.js', 'cesium.graph.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    $stateProvider
      .state('app.currency_stats', {
        url: "/currency/stats",
        views: {
          'menuContent': {
            templateUrl: "plugins/graph/templates/currency/view_stats.html"
          }
        }
      });

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider
        .extendStates(['app.currency_name', 'app.currency', 'app.currency_view_name_lg', 'app.currency_view_lg'], {
          points: {
            'parameters-actual': {
              templateUrl: "plugins/graph/templates/currency/view_currency_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            },
            'wot-actual': {
              templateUrl: "plugins/graph/templates/currency/view_currency_extend.html",
              controller: 'GpCurrencyViewExtendCtrl'
            }
          }
        })
      ;


    }
  })

  .controller('GpCurrencyViewExtendCtrl', GpCurrencyViewExtendController)

  .controller('GpGraphMonetaryMassCtrl', GpGraphMonetaryMassController)
;

function GpCurrencyViewExtendController($scope, PluginService, esSettings) {
  'ngInject';

  $scope.extensionPoint = PluginService.extensions.points.current.get();
  $scope.enable = esSettings.isEnable();

  esSettings.api.state.on.changed($scope, function(enable) {
    $scope.enable = enable;
  });
}


function GpGraphMonetaryMassController($scope, $q, $state, $translate, csCurrency, gpData, $filter, csSettings) {
  'ngInject';

  $scope.loading = true;
  $scope.formData = $scope.formData || {};
  $scope.formData.useRelative = angular.isDefined($scope.formData.useRelative) ? $scope.formData.useRelative :
    csSettings.data.useRelative;

  $scope.defaultLineColors = ['rgba(178,224,255,0.65)'];
  $scope.defaultLineColors = ['rgba(17,193,243,0.75)'];

  $scope.enter = function(e, state) {
    if ($scope.loading) {

      if (!$scope.formData.currency && state && state.stateParams && state.stateParams.currency) { // Currency parameter
        $scope.formData.currency = state.stateParams.currency;
      }

      // Make sure there is currency, or load it not
      if (!$scope.formData.currency) {
        return csCurrency.default()
          .then(function(currency) {
            $scope.formData.currency = currency ? currency.name : null;
            return $scope.enter(e, state);
          });
      }

      $scope.load();
    }

  };
  $scope.$on('$ionicView.enter', $scope.enter);
  $scope.$on('$csExtension.enter', $scope.enter);


  $scope.onUseRelativeChanged = function() {
    if (!$scope.loading) $scope.load();
  };
  $scope.$watch('formData.useRelative', $scope.onUseRelativeChanged);


  $scope.load = function(from, size) {
    from = from || 0;
    size = size || 10000;

    return gpData.blockchain.withDividend($scope.formData.currency, {
      from: from,
      size: size
    })
      .then(function(result) {
        if (!result || !result.blocks) return;


        // Choose a date formatter, depending on the blocks period
        var blocksPeriod = result.blocks[result.blocks.length-1].medianTime - result.blocks[0].medianTime;
        var dateFormat;
        if (blocksPeriod < 15778800/* less than 6 months*/) {
          dateFormat = $filter('formatDateShort');
        }
        else {
          dateFormat = $filter('formatDateMonth');
        }

        // Format time
        var labels = result.labels.reduce(function(res, time) {
          return res.concat(dateFormat(time));
        }, []);

        // Members count graph: -------------------------
        var membersCount = {
          options: {
            title: {
              display: true
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero:false
                }
              }]
            }
          },
          colors: ['rgba(17,193,243,0.5)']/*$scope.defaultLineColors*/
        };
        membersCount.data = result.blocks.reduce(function(res, block) {
          return res.concat(block.membersCount);
        }, []);

        // Monetary mass graph: -------------------------
        var monetaryMass = {
          options: {
            title: {
              display: true
            },
            scales: {
              yAxes: [{
                ticks: {
                  beginAtZero:true
                }
              }]
            }
          },
          colors: ['rgba(255,201,0,0.5)']/*$scope.defaultLineColors*/
        };
        if($scope.formData.useRelative) {
          // If relative, divide by UD
          monetaryMass.data = result.blocks.reduce(function(res, block) {
            return res.concat(block.monetaryMass / block.dividend);
          }, []);
        }
        else {
          monetaryMass.data = result.blocks.reduce(function(res, block) {
            return res.concat(block.monetaryMass);
          }, []);
        }

        // Keep only block number (need for click)
        var blocks = result.blocks.reduce(function(res, block) {
          return res.concat(block.number);
        }, []);

        // Compute color
        //var colors = gpData.util.colors.custom(result.data.length);

        // Compute graph title
        return $q.all([
          $translate('GRAPH.CURRENCY.MEMBERS_COUNT_TITLE'),
          $translate($scope.formData.useRelative ?
            'GRAPH.CURRENCY.MONETARY_MASS_TITLE_RELATIVE' :
            'GRAPH.CURRENCY.MONETARY_MASS_TITLE', {
            currency: $scope.formData.currency
          })
        ])
          .then(function(titles) {
            membersCount.options.title.text = titles[0];
            monetaryMass.options.title.text = titles[1];
            $scope.monetaryMass = monetaryMass;
            $scope.membersCount = membersCount;
            $scope.blocks = blocks;
            $scope.labels = labels;
            $scope.loading=false;
          });
      });

  };

  $scope.showBlock = function(data, e, item) {
    if (!item) return
    var number = $scope.blocks[item._index];
    $state.go('app.view_block', {number: number});
  };

  /* -- popups -- */



}

