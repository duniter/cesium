angular.module('cesium.es.like.controllers', ['ngResource', 'cesium.es.services'])

  .controller('ESLikesCtrl', ESLikesController)
;

function ESLikesController($scope, $q, $timeout, $translate, $ionicPopup, UIUtils, Modals, csWallet, esHttp, esLike) {
  'ngInject';

  $scope.entered = false;
  $scope.abuseData = {};
  $scope.abuseLevels = [
    {value: 1, label: 'LOW'},
    {value: 2, label: 'LOW'}
  ];
  $scope.staring = false;
  $scope.options = $scope.options || {};
  $scope.options.like = $scope.options.like || {
    kinds: esLike.constants.KINDS,
    index: undefined,
    type: undefined,
    id: undefined
  };

  $scope.$on('$recordView.enter', function(e, state) {
    // First enter
    if (!$scope.entered) {
      $scope.entered = false;
      // Nothing to do: main controller will trigger '$recordView.load' event
    }
    // second call (e.g. if cache)
    else if ($scope.id) {
      $scope.loadLikes($scope.id);
    }
  });

  $scope.$on('$recordView.load', function(event, id) {
    $scope.id = id || $scope.id;
    if ($scope.id) {
      $scope.loadLikes($scope.id);
    }
  });

  // Init Like service
  $scope.initLikes = function() {
    if (!$scope.likeData) {
      throw new Error("Missing 'likeData' in scope. Cannot load likes counter");
    }
    if (!$scope.options.like.service) {
      if (!$scope.options.like.index || !$scope.options.like.type) {
        throw new Error("Missing 'options.like.index' or 'options.like.type' in scope. Cannot load likes counter");
      }
      $scope.options.like.service = esLike.instance($scope.options.like.index, $scope.options.like.type);
    }
    if (!$scope.options.like.kinds) {
      // Get scope's kinds (e.g. defined in the parent scope)
      $scope.options.like.kinds = _.filter(esLike.constants.KINDS, function (kind) {
        var key = kind.toLowerCase() + 's';
        return angular.isDefined($scope.likeData[key]);
      });
    }
  };

  $scope.loadLikes = function(id) {
    if (!$scope.likeData || $scope.likeData.loading) return;// Skip

    id = id || $scope.likeData.id;
    $scope.initLikes();

    var kinds = $scope.options.like.kinds || [];
    if (!kinds.length) return; // skip

    $scope.likeData.loading = true;
    var now = Date.now();
    console.debug("[ES] Loading counter of {0}... ({1})".format(id.substring(0,8), kinds));

    var issuers = csWallet.isLogin() ? csWallet.pubkeys() : undefined;

    return $q.all(_.map(kinds, function(kind) {
      var key = kind.toLowerCase() + 's';
      return $scope.options.like.service.count(id, {issuers: issuers, kind: kind})
        .then(function (res) {
          // Store result to scope
          if ($scope.likeData[key]) {
            angular.merge($scope.likeData[key], res);
          }
        });
    }))
      .then(function () {
        $scope.likeData.id = id;
        console.debug("[ES] Loading counter of {0} [OK] in {1}ms".format(id.substring(0,8), Date.now()-now));

        if (_.contains(kinds, 'VIEW') && !$scope.canEdit) {
          $scope.markAsView();
        }

        // Publish to parent scope (to be able to use it in action popover's buttons)
        if ($scope.$parent) {
          console.debug("[ES] [likes] Adding data and functions to parent scope");
          $scope.$parent.toggleLike = $scope.toggleLike;
          $scope.$parent.reportAbuse = $scope.reportAbuse;
        }

        $scope.likeData.loading = false;
      })
      .catch(function (err) {
        console.error(err && err.message || err);
        $scope.likeData.loading = false;
      });
  };

  $scope.toggleLike = function(event, options) {
    $scope.initLikes();
    if (!$scope.likeData.id) throw new Error("Missing 'likeData.id' in scope. Cannot apply toggle");

    // Make sure tobe auth before continue
    if (!csWallet.isLogin()) {
      return csWallet.auth({minData: true})
        .then(function(){
          UIUtils.loading.hide();
          return $scope.reportAbuse(event, options); // loop
        });
    }

    options = options || {};
    options.kind = options.kind && options.kind.toUpperCase() || 'LIKE';
    var key = options.kind.toLowerCase() + 's';

    $scope.likeData[key] = $scope.likeData[key] || {};

    // Avoid too many call
    if ($scope.likeData[key].loading === true || $scope.likeData.loading) {
      event.preventDefault();
      return $q.reject();
    }

    if (!options.pubkey) {
      if (csWallet.children.count() === 0) {
        options.pubkey = csWallet.data.pubkey;
      }
      // Select the wallet, if many
      else {
        return Modals.showSelectWallet({displayBalance: false})
          .then(function (wallet) {
            if (!wallet) throw 'CANCELLED';
            options.pubkey = wallet.data.pubkey;
            return $scope.reportAbuse(event, options); // Loop
          });
      }
    }

    var wallet = csWallet.getByPubkey(options.pubkey);
    if (!wallet) return;

    $scope.likeData[key].loading = true;
    return wallet.auth({minData: true})
      .then(function(walletData) {
        if (!walletData) {
          UIUtils.loading.hide();
          return;
        }

        // Check if member account
        if (!walletData.isMember) {
          // TODO: enable this
          //throw {message: "ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION"};
        }

        // Apply like
        options.id = $scope.likeData.id;
        return $scope.options.like.service.toggle($scope.likeData.id, options);
      })
      .then(function(delta) {
        UIUtils.loading.hide();
        if (delta !== 0) {
          $scope.likeData[key].total = ($scope.likeData[key].total || 0) + delta;
          $scope.likeData[key].wasHitByPubkey = $scope.likeData[key].wasHitByPubkey || {};
          $scope.likeData[key].wasHitByPubkey[options.pubkey] = delta > 0;
          $scope.likeData[key].wasHitCount += delta;
        }
        $timeout(function() {
          $scope.likeData[key].loading = false;
          $scope.$broadcast('$$rebind::like'); // notify binder
        }, 1000);
      })
      .catch(function(err) {
        $scope.likeData[key].loading = false;
        if (err === 'CANCELLED') return; // User cancelled
        console.error(err);
        UIUtils.onError('LIKE.ERROR.FAILED_TOGGLE_LIKE')(err);
        event.preventDefault();
      });
  };

  $scope.setAbuseForm = function(form) {
    $scope.abuseForm = form;
  };

  $scope.showAbuseCommentPopover = function(event) {
    return $translate(['COMMON.REPORT_ABUSE.TITLE', 'COMMON.REPORT_ABUSE.SUB_TITLE','COMMON.BTN_SEND', 'COMMON.BTN_CANCEL'])
      .then(function(translations) {

        UIUtils.loading.hide();

        return $ionicPopup.show({
          templateUrl: 'plugins/es/templates/common/popup_report_abuse.html',
          title: translations['COMMON.REPORT_ABUSE.TITLE'],
          subTitle: translations['COMMON.REPORT_ABUSE.SUB_TITLE'],
          cssClass: 'popup-report-abuse',
          scope: $scope,
          buttons: [
            {
              text: translations['COMMON.BTN_CANCEL'],
              type: 'button-stable button-clear gray'
            },
            {
              text: translations['COMMON.BTN_SEND'],
              type: 'button button-positive  ink',
              onTap: function(e) {
                $scope.abuseForm.$submitted=true;
                if(!$scope.abuseForm.$valid || !$scope.abuseData.comment) {
                  //don't allow the user to close unless he enters a uid
                  e.preventDefault();
                } else {
                  return $scope.abuseData;
                }
              }
            }
          ]
        });
      })
      .then(function(res) {
        $scope.abuseData = {};
        if (!res || !res.comment) { // user cancel
          UIUtils.loading.hide();
          return undefined;
        }
        return res;
      });
  };

  $scope.reportAbuse = function(event, options) {

    // Make sure tobe auth before continue
    if (!csWallet.isLogin()) {
      return csWallet.auth({minData: true})
        .then(function(){
          UIUtils.loading.hide();
          return $scope.reportAbuse(event, options); // loop
        });
    }

    if (!$scope.likeData || !$scope.likeData.abuses || $scope.likeData.abuses.wasHitCount) return; // skip
    if ($scope.likeData.abuses.wasHitCount) return; // already report

    options = options || {};

    if (!options.pubkey) {
      if (csWallet.children.count() === 0) {
        options.pubkey = csWallet.data.pubkey;
      }
      // Select the wallet, if many
      else {
        return Modals.showSelectWallet({displayBalance: false})
          .then(function (wallet) {
            if (!wallet) throw 'CANCELLED';
            options.pubkey = wallet.data.pubkey;
            return $scope.reportAbuse(event, options); // Loop
          });
      }
    }

    var wallet = csWallet.getByPubkey(options.pubkey);

    // Check if member account
    if (!wallet || !wallet.isMember()) {
      UIUtils.alert.info("ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION");
      return;
    }

    if (!options.comment) {
      // Ask a comment
      return $scope.showAbuseCommentPopover(event)
        // Loop, with options.comment filled
        .then(function(res) {
          if (!res || !res.comment) return; // Empty comment: skip
          options.comment = res.comment;
          options.level = res.level || (res.delete && 5) || undefined;
          return $scope.reportAbuse(event, options); // Loop, with the comment
        });
    }

    // Send abuse report
    options.kind = 'ABUSE';
    return $scope.toggleLike(event, options)
      .then(function() {
        UIUtils.toast.show('COMMON.REPORT_ABUSE.CONFIRM.SENT');
      });
  };

  csWallet.api.data.on.reset($scope, function() {
    _.forEach($scope.options.like.kinds||[], function(kind) {
      var key = kind.toLowerCase() + 's';
      if ($scope.likeData[key]) {
        $scope.likeData[key].wasHitByPubkey = {};
        $scope.likeData[key].wasHitCount = 0;
      }
    });
    $scope.$broadcast('$$rebind::like'); // notify binder
  }, this);

}
