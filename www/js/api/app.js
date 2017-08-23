// Ionic Starter App

// angular.module is a global place for creating, registering and retrieving Angular modules
// 'starter' is the name of this angular module example (also set in a <body> attribute in index.html)
// the 2nd parameter is an array of 'requires'
// 'starter.controllers' is found in controllers.js
angular.module('cesium-api', ['ionic', 'ionic-material', 'ngMessages', 'pascalprecht.translate', 'ngApi', 'angular-cache', 'angular.screenmatch',
  // removeIf(no-device)
  'ngCordova',
  // endRemoveIf(no-device)
  'cesium.filters', 'cesium.config', 'cesium.platform', 'cesium.templates', 'cesium.translations', 'cesium.directives',
  // API dependencies :
  'cesium.services', 'cesium.api.demo.services', 'cesium.login.controllers', 'cesium.help.controllers'
])

  .config(function($stateProvider, $urlRouterProvider) {
    'ngInject';
    $stateProvider

      .state('app', {
        url: "/app",
        abstract: true,
        templateUrl: "templates/api/menu.html",
        controller: 'ApiCtrl'
      })

      .state('app.home', {
        url: "/home?result&service&cancel",
        views: {
          'menuContent': {
            templateUrl: "templates/api/home.html",
            controller: 'ApiDocCtrl'
          }
        }
      })

      .state('api', {
        url: "/v1",
        abstract: true,
        templateUrl: "templates/api/menu.html",
        controller: 'ApiCtrl'
      })

      .state('api.transfer', {
        cache: false,
        url: "/payment/:pubkey?name&amount&udAmount&comment&redirect_url&cancel_url&demo",
        views: {
          'menuContent': {
            templateUrl: "templates/api/transfer.html",
            controller: 'ApiTransferCtrl'
          }
        }
      });

    // if none of the above states are matched, use this as the fallback
    $urlRouterProvider.otherwise('/app/home');
  })

  .controller('ApiCtrl', function ($scope, $state, Modals){
    'ngInject';


    $scope.showAboutModal = function(e) {
      e.preventDefault(); // avoid to open link href
      Modals.showAbout();
    };

    $scope.showHome = function() {
      $state.go('app.home') ;
    };
  })

  .controller('ApiDocCtrl', function ($scope, $rootScope, $state, $translate, $sce, csCurrency){
    'ngInject';

    $scope.loading = true;
    $scope.transferData = {
      pubkey: 'G2CBgZBPLe6FSFUgpx2Jf1Aqsgta6iib3vmDRA1yLiqU',
      amount: 100,
      comment: 'REFERENCE',
      name: 'www.domain.com',
      redirect_url: 'http://www.domain.com/payment?ref={comment}&tx={tx}',
      cancel_url: 'http://www.domain.com/payment?ref={comment}&cancel'
    };
    $scope.transferButton = {
      html: undefined,
      showParameters: false, // hide integration parameters, by default
      icons: [
        {
          label: 'API.DOC.TRANSFER.EXAMPLE_BUTTON_ICON_DUNITER',
          filename: '../img/logo_duniter_32px.png'
        },
        {
          label: 'API.DOC.TRANSFER.EXAMPLE_BUTTON_ICON_CESIUM',
          filename: '../img/logo_32px.png'
        },
        {
          label: 'API.DOC.TRANSFER.EXAMPLE_BUTTON_ICON_G1_COLOR',
          filename: '../img/logo_g1_32px.png'
        },
        {
          label: 'API.DOC.TRANSFER.EXAMPLE_BUTTON_ICON_G1_BLACK',
          filename: '../img/logo_g1_32px_black.png'
        }
      ],
      style: {
        enable: false,
        text: 'Ğ1 pubkey',
        bgColor: '#fbc14c',
        fontColor: 'black',
        width: undefined
      }
    };
    $scope.transferButton.style.icon = $scope.transferButton.icons[0];

    $scope.enter = function(e, state) {
      if (!$scope.loading) return; // already enter

      $scope.result = {};
      if (state.stateParams && state.stateParams.service) {
        $scope.result.type = state.stateParams.service;
      }
      if (state.stateParams && state.stateParams.result) {
        $scope.result.content = state.stateParams.result;
      }
      if (state.stateParams && state.stateParams.cancel) {
        $scope.result.cancelled = true;
      }

      csCurrency.get()
        .then(function(currency) {
          return $translate('API.DOC.TRANSFER.EXAMPLE_BUTTON_DEFAULT_TEXT', {currency: currency.name});
        })
        .then(function(buttonText) {
          $scope.transferButton.style.text = buttonText;
          $scope.transferDemoUrl = $rootScope.rootPath + $state.href('api.transfer', angular.merge({}, $scope.transferData, {
            demo: true,
            redirect_url: $rootScope.rootPath + '#/app/home?service=payment&result={tx}',
            cancel_url: $rootScope.rootPath + '#/app/home?service=payment&cancel'
          }));

          $scope.loading = false;

          // compute HTML button
          $scope.computeTransferButtonHtml();
        });

    };
    $scope.$on('$ionicView.enter', $scope.enter);

    // watch from update
    $scope.computeTransferButtonHtml = function() {
      if ($scope.loading) return; // skip if loading

      // Compute URL
      var url = $rootScope.rootPath + $state.href('api.transfer', $scope.transferData);

      var html;
      // Compute HTML: simple button
      if (!$scope.transferButton.style.enable){
        html = '<a href="'+url+'">\n'+
          '  <img src="'+$rootScope.rootPath + '../img/duniter_button.svg">\n'+
          '</a>';
      }
      // Compute HTML: advanced button
      else {
        html = '<a href="'+url+'">\n'+
          '  <div style="border-radius: 5px; min-height: 42px; text-align: center; padding: 5px; ';
        if ($scope.transferButton.style.width) {
          html += 'max-width: '+$scope.transferButton.style.width+'; ';
        }
        if ($scope.transferButton.style.bgColor) {
          html += 'background-color: '+$scope.transferButton.style.bgColor+'; ';
        }
        if ($scope.transferButton.style.fontColor) {
          html += 'color: '+$scope.transferButton.style.fontColor+'; ';
        }
        html += '">\n'+
          '    <img style="vertical-align: middle;" src="'+$rootScope.rootPath + $scope.transferButton.style.icon.filename+'">\n' +
          '    ' + $scope.transferButton.style.text + '\n' +
          '  </div>\n' +
          '</a>';
      }

      if ($scope.transferButton.html != html) {
        $scope.transferButton.html = html;
        $scope.$broadcast('$$rebind::transferButton'); // force rebind
      }
    };
    $scope.$watch('transferData', $scope.computeTransferButtonHtml, true);
    $scope.$watch('transferButton.style', $scope.computeTransferButtonHtml, true);
  })

  .controller('ApiTransferCtrl', function ($scope, $rootScope, $timeout, $controller, $state, $q, $translate, $filter,
                                           BMA, CryptoUtils, UIUtils, csCurrency, csTx, csWallet, csDemoWallet){
    'ngInject';

    // Initialize the super class and extend it.
    angular.extend(this, $controller('AuthCtrl', {$scope: $scope}));

    $scope.loading = true;
    $scope.transferData = {
      amount: undefined,
      comment: undefined,
      pubkey: undefined,
      name: undefined,
      redirect_url: undefined,
      cancel_url: undefined
    };

    $scope.enter = function(e, state) {
      if (state.stateParams && state.stateParams.amount) {
        $scope.transferData.amount  = parseFloat(state.stateParams.amount.replace(new RegExp('[.,]'), '.')).toFixed(2) * 100;
      }
      if (state.stateParams && state.stateParams.pubkey) {
        $scope.transferData.pubkey = state.stateParams.pubkey;
      }
      if (state.stateParams && state.stateParams.name) {
        $scope.transferData.name= state.stateParams.name;
      }
      if (state.stateParams && state.stateParams.comment) {
        $scope.transferData.comment = state.stateParams.comment;
      }
      if (state.stateParams && state.stateParams.redirect_url) {
        $scope.transferData.redirect_url = state.stateParams.redirect_url;
      }
      if (state.stateParams && state.stateParams.cancel_url) {
        $scope.transferData.cancel_url = state.stateParams.cancel_url;
      }
      if (state.stateParams && state.stateParams.demo) {
        $scope.demo = true;
      }
    };
    $scope.$on('$ionicView.enter', $scope.enter);

    function onLogin(authData) {

      // User cancelled
      if (!authData) return $scope.onCancel();

      // Avoid multiple click
      if ($scope.sending) return;
      $scope.sending = true;

      var wallet = $scope.demo ? csDemoWallet.instance(authData) : csWallet.instance('api', BMA);

      UIUtils.loading.show();

      wallet.start({restore: false}/*skip restore from local storage*/)
        .then(function() {
          return wallet.login({auth: true, authData: authData});
        })
        .then(function(walletData) {
          $scope.login = true;

          UIUtils.loading.hide();
          return $scope.askTransferConfirm(walletData);
        })
        .then(function(confirm) {
          if (!confirm) return;

          // sent transfer
          return UIUtils.loading.show()
            .then(function(){
              var amount = parseInt($scope.transferData.amount); // remove 2 decimals on quantitative mode
              return wallet.transfer($scope.transferData.pubkey, amount, $scope.transferData.comment, false /*always quantitative mode*/);
            })
            .then(function(txRes) {

              UIUtils.loading.hide();
              return txRes;
            })
            .catch(function(err) {
              UIUtils.onError()(err);
              return false;
            });
        })
        .then(function(txRes) {
          if (txRes) {
            return $scope.onSuccess(txRes);
          }
          else {
            $scope.sending = false;
          }
        })
        .catch(function(err){
          // when user cancel
          if (err && err === 'CANCELLED') {
            return $scope.onCancel();
          }
          // When wallet is empty
          if (err && err === 'RETRY') {
            $scope.sending = false;
            return;
          }
          $scope.sending = false;
          UIUtils.onError()(err);
        });
    }


    $scope.askTransferConfirm = function(walletData) {
      return $translate(['COMMON.UD', 'COMMON.EMPTY_PARENTHESIS'])
        .then(function(translations) {
          return $translate('CONFIRM.TRANSFER', {
            from: walletData.isMember ? walletData.uid : $filter('formatPubkey')(walletData.pubkey),
            to: $scope.transferData.name || $filter('formatPubkey')($scope.transferData.pubkey),
            amount: $scope.transferData.amount / 100,
            unit: $filter('abbreviate')($rootScope.currency.name),
            comment: (!$scope.transferData.comment || $scope.transferData.comment.trim().length === 0) ? translations['COMMON.EMPTY_PARENTHESIS'] : $scope.transferData.comment
          });
        })
        .then(UIUtils.alert.confirm);
    };

    $scope.onSuccess = function(txRes) {
      if (!$scope.transferData.redirect_url) {
        return UIUtils.toast.show('INFO.TRANSFER_SENT');
      }

      return ($scope.transferData.name ? $translate('API.TRANSFER.INFO.SUCCESS_REDIRECTING_WITH_NAME', $scope.transferData) : $translate('API.TRANSFER.INFO.SUCCESS_REDIRECTING'))
        .then(function(message){
          return UIUtils.loading.show({template: message});
        })
        .then(function() {
          var url = $scope.transferData.redirect_url;
          // Make replacements
          url = url.replace(/\{hash\}/g, txRes.hash||'');
          url = url.replace(/\{comment\}/g, $scope.transferData.comment||'');
          url = url.replace(/\{amount\}/g, $scope.transferData.amount.toString());
          url = url.replace(/\{tx\}/g, encodeURI(txRes.tx));

          return $scope.redirectToUrl(url, 2500);
        });
    };

    $scope.onCancel = function() {
      if (!$scope.transferData.cancel_url) {
        // TODO: clean form ?
        $scope.formData.salt = undefined;
        $scope.formData.password = undefined;
        return; // nothing to do
      }

      return ($scope.transferData.name ? $translate('API.TRANSFER.INFO.CANCEL_REDIRECTING_WITH_NAME', $scope.transferData) : $translate('API.TRANSFER.INFO.CANCEL_REDIRECTING'))
        .then(function(message){
          return UIUtils.loading.show({template: message});
        })
        .then(function() {
          return $scope.redirectToUrl($scope.transferData.cancel_url, 1500);
        });
    };

    $scope.redirectToUrl = function(url, timeout) {
      if (!url) return;

      return $timeout(function() {
        // if iframe: send to parent
        if (window.top && window.top.location) {
          window.top.location.href = url;
        }
        else if (parent && parent.document && parent.document.location) {
          parent.document.location.href = url;
        }
        else {
          window.location.assign(url);
        }
        return UIUtils.loading.hide();
      }, timeout||0);
    };

    /* -- methods need by Login controller -- */

    $scope.setForm = function(form) {
      $scope.form = form;
    };
    $scope.closeModal = onLogin;

  })

  .run(function(csPlatform) {
    'ngInject';

    csPlatform.start();
  })
;
