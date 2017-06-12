
angular.module('cesium.platform', ['cesium.config', 'cesium.services'])

  .factory('csPlatform', function (ionicReady, $rootScope, $q, $state, $translate, $timeout, UIUtils,
                                   BMA, Device, csHttp, csConfig, csSettings, csCurrency, csWallet) {

    'ngInject';
    var
      fallbackNodeIndex = 0,
      defaultSettingsNode,
      started = false,
      startPromise,
      listeners,
      removeChangeStateListener;

    function disableChangeState() {
      var remove = $rootScope.$on('$stateChangeStart', function (event, next, nextParams, fromState) {
        if (next.name !== 'app.home' && next.name !== 'app.settings') {
          event.preventDefault();
          if (startPromise) {
            startPromise.then(function() {
              $state.go(next.name, nextParams);
            });
          }
          else {
            UIUtils.loading.hide();
          }
        }
      });

      // store remove listener function
      removeChangeStateListener = remove;
    }

    function enableChangeState() {
      if (removeChangeStateListener) removeChangeStateListener();
      removeChangeStateListener = null;
    }

    // Alert user if node not reached - fix issue #
    function checkBmaNodeAlive(alive) {
      if (alive) return true;

      // Remember the default node
      defaultSettingsNode = defaultSettingsNode || csSettings.data.node;

      var fallbackNode = csSettings.data.fallbackNodes && fallbackNodeIndex < csSettings.data.fallbackNodes.length && csSettings.data.fallbackNodes[fallbackNodeIndex++];
      if (!fallbackNode) {
        throw 'ERROR.CHECK_NETWORK_CONNECTION';
      }
      var newServer = fallbackNode.host + ((!fallbackNode.port && fallbackNode.port != 80 && fallbackNode.port != 443) ? (':' + fallbackNode.port) : '');
      return $translate('CONFIRM.USE_FALLBACK_NODE', {old: BMA.server, new: newServer})
        .then(function(msg) {
          return UIUtils.alert.confirm(msg);
        })
        .then(function (confirm) {
          if (!confirm) return;

          csSettings.data.node = fallbackNode;
          csSettings.data.node.temporary = true;
          csHttp.cache.clear();

          // loop
          return BMA.copy(fallbackNode)
            .then(checkBmaNodeAlive);
        });
    }

    function isStarted() {
      return started;
    }

    function addListeners() {
      listeners = [
        // Listen if node changed
        BMA.api.node.on.restart($rootScope, restart, this)
      ];
    }

    function removeListeners() {
      _.forEach(listeners, function(remove){
        remove();
      });
      listeners = [];
    }

    function ready() {
      if (started) return $q.when();
      return startPromise || start();
    }

    function restart() {
      console.debug('[platform] restarting csPlatform');
      return stop()
        .then(function () {
          return $timeout(start, 200);
        });
    }

    function start() {
      enableChangeState();

      // Avoid change state
      disableChangeState();

      // We use 'ionicReady()' instead of '$ionicPlatform.ready()', because this one is callable many times
      startPromise = ionicReady()

        .then($q.all([
          // Load device
          Device.ready(),

          // Start settings
          csSettings.ready()
        ]))

        // Load BMA
        .then(function(){
          return BMA.ready().then(checkBmaNodeAlive);
        })

        // Load currency
        .then(csCurrency.ready)

        // Trying to restore wallet
        .then(csWallet.ready)

        .then(function(){
          enableChangeState();
          addListeners();
          startPromise = null;
          started = true;
        })
        .catch(function(err) {
          startPromise = null;
          started = false;
          if($state.current.name !== 'app.home') {
            $state.go('app.home', {error: 'peer'});
          }
          throw err;
        });

      return startPromise;
    }

    function stop() {
      if (!started) return $q.when();
      removeListeners();

      csWallet.stop();
      csCurrency.stop();
      BMA.stop();

      return $timeout(function() {
          enableChangeState();
          started = false;
          startPromise = null;
        }, 500);
    }

    // default action
    start();



    return  {
      isStarted: isStarted,
      ready: ready,
      restart: restart,
      start: start,
      stop: stop
    };
  })
;
