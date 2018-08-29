angular.module('cesium.es.wot.controllers', ['cesium.es.services'])

  .config(function($stateProvider, PluginServiceProvider, csConfig) {
    'ngInject';

    var enable = csConfig.plugins && csConfig.plugins.es;
    if (enable) {
      PluginServiceProvider

        .extendState('app.wot_lookup', {
          points: {
            'tabs': {
              templateUrl: "plugins/es/templates/wot/lookup_extend.html",
              controller: "ESExtensionCtrl"
            }
          }
        })

        .extendState('app.wot_lookup_lg', {
          points: {
            'top': {
              templateUrl: "plugins/es/templates/wot/lookup_lg_extend.html",
              controller: "ESWotLookupExtendCtrl"
            }
          }
        })

        .extendStates(['app.wot_identity', 'app.wot_identity_uid'], {
          points: {
            'after-general': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons': {
              templateUrl: "plugins/es/templates/wot/view_identity_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            }
          }
        })

        .extendStates(['app.wot_cert', 'app.wot_cert_lg', 'app.wallet_cert', 'app.wallet_cert_lg'], {
          points: {
            'nav-buttons': {
              templateUrl: "plugins/es/templates/wot/view_certifications_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            },
            'buttons': {
              templateUrl: "plugins/es/templates/wot/view_certifications_extend.html",
              controller: 'ESWotIdentityViewCtrl'
            }
          }
        })
      ;


    }

  })


 .controller('ESWotLookupExtendCtrl', ESWotLookupExtendController)

 .controller('ESWotIdentityViewCtrl', ESWotIdentityViewController)

;

function ESWotLookupExtendController($scope, $controller, $state) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.openRegistryLookup = function() {

    var text = $scope.search.text && $scope.search.text.trim() || '';
    var location = $scope.search.location && $scope.search.location.trim() || '';
    var stateParams = {
      q: text.length ? text : undefined,
      location: location.length ? location : undefined
    };

    $state.go('app.registry_lookup', stateParams);
  };
}

function ESWotIdentityViewController($scope, $ionicPopover, $q, $controller, UIUtils, Modals, csWallet,
                                     esModals, esHttp, esWallet, esInvitation) {
  'ngInject';

  // Initialize the super class and extend it.
  angular.extend(this, $controller('ESExtensionCtrl', {$scope: $scope}));

  $scope.canCertify = false; // disable certity on the popover (by default - override by the wot map controller)

  /* -- modals -- */

  $scope.showNewMessageModal = function(confirm) {

    return csWallet.login({minData: true, method: 'default'})
      .then(function() {
        UIUtils.loading.hide();

        // Ask confirmation, if user has no Cesium+ profil
        if (!confirm && !$scope.formData.profile) {
          return UIUtils.alert.confirm('MESSAGE.CONFIRM.USER_HAS_NO_PROFILE')
            .then(function (confirm) {
              // Recursive call (with confirm flag)
              if (confirm) return true;
            });
        }
        return true;
      })
      // Open modal
      .then(function(confirm) {
        if (!confirm) return false;

        return esModals.showMessageCompose({
          destPub: $scope.formData.pubkey,
          destUid: $scope.formData.name||$scope.formData.uid
        })
        .then(function(send) {
          if (send) UIUtils.toast.show('MESSAGE.INFO.MESSAGE_SENT');
        });
      });
  };

  $scope.showSuggestCertificationModal = function() {

    $scope.hideCertificationActionsPopover();

    var identities;

    return csWallet.auth({minData: true})
      .then(function(walletData) {
        UIUtils.loading.hide();
        if (!walletData) return;

        // Not allow for non-member - issue #561
        if (!walletData.isMember) {
          return UIUtils.alert.error('ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION');
        }

        return Modals.showWotLookup({
          allowMultiple: true,
          enableFilter: true,
          title: 'WOT.SUGGEST_CERTIFICATIONS_MODAL.TITLE',
          help: 'WOT.SUGGEST_CERTIFICATIONS_MODAL.HELP',
          okText: 'COMMON.BTN_NEXT',
          okType: 'button-positive'
        })
        .then(function(res) {
          if (!res || !res.length) return; // user cancelled
          identities = res;

          return $q.all([
            // Get keypair only once (if not done here, certification.send() with compute it many times)
            esWallet.box.getKeypair(walletData.keypair),
            // Ask confirmation
            UIUtils.alert.confirm('WOT.CONFIRM.SUGGEST_CERTIFICATIONS', undefined, {okText: 'COMMON.BTN_SEND'})
          ])
            .then(function(res) {
              if (!res) return;
              var keypair = res[0];
              var confirm = res[1];
              if (!confirm) return;
              var time = esHttp.date.now(); // use same date for each invitation
              return $q.all(
                identities.reduce(function(res, identity){
                  return res.concat(
                    esInvitation.send({
                      issuer: walletData.pubkey,
                      recipient: $scope.formData.pubkey,
                      time: time,
                      content: [identity.uid, identity.pubkey].join('-')
                    }, keypair, 'certification')
                  );
                }, [])
              );
            })
            .then(function() {
              UIUtils.toast.show('INVITATION.INFO.INVITATION_SENT');
            })
            .catch(UIUtils.onError('INVITATION.ERROR.SEND_INVITATION_FAILED'));
        });
      });
  };

  $scope.showAskCertificationModal = function() {

    $scope.hideCertificationActionsPopover();

    var identities;
    return (csWallet.children.count() ? Modals.showSelectWallet({displayBalance: false}) : $q.when(csWallet))
      .then(function(wallet) {
        return wallet.auth({minData: true});
      })
      .then(function(walletData) {
        UIUtils.loading.hide();
        if (!walletData) return;

        // Not allow for non-member - issue #561
        if (!walletData.isMember) {
          return UIUtils.alert.error('ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION');
        }

        return Modals.showWotLookup({
          allowMultiple: true,
          enableFilter: false,
          title: 'WOT.ASK_CERTIFICATIONS_MODAL.TITLE',
          help: 'WOT.ASK_CERTIFICATIONS_MODAL.HELP',
          okText: 'COMMON.BTN_NEXT',
          okType: 'button-positive'
        })
        .then(function(res) {
          if (!res || !res.length) return; // user cancelled
          identities = res;

          return $q.all([
            // Get keypair only once (if not done here, certification.send() with compute it many times)
            esWallet.box.getKeypair(walletData.keypair),
            // Ask confirmation
            UIUtils.alert.confirm('WOT.CONFIRM.ASK_CERTIFICATIONS', undefined, {okText: 'COMMON.BTN_SEND'})
          ])
            .then(function(res) {
              var keypair = res && res[0];
              var confirm = res && res[1];
              if (!keypair || !confirm) return;
              var time = esHttp.date.now(); // use same date for each invitation
              return $q.all(identities.reduce(function(res, identity){
                return res.concat(
                  esInvitation.send({
                    issuer: walletData.pubkey,
                    recipient: identity.pubkey,
                    time: time,
                    content: [walletData.uid, walletData.pubkey].join('-')
                  }, keypair, 'certification')
                );
              }, []))
                .then(function() {
                  UIUtils.toast.show('INVITATION.INFO.INVITATION_SENT');
                })
                .catch(UIUtils.onError('INVITATION.ERROR.SEND_INVITATION_FAILED'));
            });
          });
      });
  };

  $scope.askCertification = function() {
    $scope.hideCertificationActionsPopover();

    return (csWallet.children.count() ? Modals.showSelectWallet({displayBalance: false}) : $q.when(csWallet))
      .then(function(wallet) {
        return wallet.auth({minData: true});
      })
      .then(function(walletData) {
        UIUtils.loading.hide();
        if (!walletData) return;

        // Not allow for non-member - issue #561
        if (!walletData.isMember) {
          return UIUtils.alert.error('ERROR.ONLY_MEMBER_CAN_EXECUTE_THIS_ACTION');
        }
        // ask confirmation
        return UIUtils.alert.confirm('WOT.CONFIRM.ASK_CERTIFICATION', undefined, {
          okText: 'COMMON.BTN_SEND'
        })
          .then(function(confirm) {
            if (!confirm) return;
            return esInvitation.send({
                issuer: walletData.pubkey,
                recipient: $scope.formData.pubkey,
                content: [walletData.uid, walletData.pubkey].join('-')
              },
              {
                type: 'certification',
                keypair: walletData.keypair
              })
              .then(function() {
                UIUtils.toast.show('INVITATION.INFO.INVITATION_SENT');
              })
              .catch(UIUtils.onError('INVITATION.ERROR.SEND_INVITATION_FAILED'));
          });
      });
  };

  /* -- Popover -- */

  $scope.showCertificationActionsPopover = function(event) {
    if (!$scope.certificationActionsPopover) {
      $ionicPopover.fromTemplateUrl('plugins/es/templates/wot/popover_certification_actions.html', {
        scope: $scope
      }).then(function(popover) {
        $scope.certificationActionsPopover = popover;
        //Cleanup the popover when we're done with it!
        $scope.$on('$destroy', function() {
          $scope.certificationActionsPopover.remove();
        });
        $scope.certificationActionsPopover.show(event);
      });
    }
    else {
      $scope.certificationActionsPopover.show(event);
    }
  };

  $scope.hideCertificationActionsPopover = function() {
    if ($scope.certificationActionsPopover) {
      $scope.certificationActionsPopover.hide();
    }
  };

  // TODO : for DEV only
  /*$timeout(function() {
    if ($scope.extensionPoint != 'buttons') return;
    $scope.showSuggestCertificationModal();
  }, 1000);*/
}

