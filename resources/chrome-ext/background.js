/**
 * Add browser actions, for WebExtension
 * (e.g. to open Cesium in a tab, when integrated as a Firefox extension).
 *
 * See https://forum.duniter.org/t/premiere-version-du-module-cesium-pour-firefox/6944
 *
 **/
var browser, chrome;

browser = browser || chrome;

var action = browser.browserAction || (chrome && chrome.action);
var alarms = browser.alarms || (chrome && chrome.alarms);
var storage = browser.storage || (chrome && chrome.storage);

function promiseAll(promises) {
  if (!promises || !promises.length) throw new Error('Expected an array of urls');

  var results = [];
  var counter = 0;
  return new Promise(function(resolve, reject) {
    promises.reduce(function(res, promise, index) {
      res.push();
      promise
        .then(function(json) {
          res[index] = json;
          counter++;
        })
        .catch(function(err) {
          console.error(err);
          res[index] = undefined;
          counter++;
        })
        .then(function() {
          if (counter === promises.length) {
            resolve(res);
          }
        });
      return res;
    }, []);
  })
}

function fetchAll(urls, type) {
  if (!urls || !urls.length) throw new Error('Expected an array of urls');
  type = type || 'json';
  return promiseAll(urls.map(function(url) {
    return fetch(url)
      .then(function(response) {
        if (!response.ok) {
          throw new Error('HTTP error (status: ' + response.status + ')');
        }
        if (type === 'json') {
          return response.json();
        }
        return response.text();
      })
  }));
}

var browserExtensionRequirements = browser.tabs && action && action.onClicked;

// Storage object selection: use local storage if available, otherwise session storage
var storageObj = storage.local && storage.local.get ? storage.local :
  (storage.session && storage.session.get ? storage.session : null);

var notificationReadTime = undefined;

// If integrated as a browser extension
if (browserExtensionRequirements) {
  console.debug("[extension] Initializing...");

  /**
   * Open Cesium in a new browser's tab
   */
  function openInTab() {
    console.debug("[extension] Opening Cesium...")
    browser.tabs.create({
      url: "index.html"
    });

    // Reset last notification check
    if (notificationReadTime > 0) {
      setStorageValue('lastNotificationCheck', notificationReadTime);
    }

    resetNotifications();
  }

  // Adding browser action
  action.onClicked.addListener(openInTab);

  function getConfig() {
    // Read then parse the file config.js file to get config as an JSON object (instead of a angular v1 constant)
    // then read the csConfig service
    return fetch('config.js')
      .then(response => response.text())
      .then(configText => {
        // Extract the csConfig object from the Angular v1 constant
        // Find the .constant("csConfig", { ... }) part
        const constantMatch = configText.match(/\.constant\s*\(\s*["']csConfig["']\s*,\s*(\{[\s\S]*?\})\s*\)/);
        if (constantMatch && constantMatch[1]) {
          try {
            // Parse the JSON object from the constant
            const configObject = JSON.parse(constantMatch[1]);
            console.debug("[extension] Config loaded:", configObject);
            return configObject;
          } catch (error) {
            console.error("[extension] Error parsing config:", error);
            return null;
          }
        } else {
          console.error("[extension] Could not find csConfig constant in config.js");
          return null;
        }
      })
      .catch(error => {
        console.error("[extension] Error loading config.js:", error);
        return null;
      });
  }

  function getStorageValue(key) {
    console.debug("[extension] Reading storage from key: " + key);
    if (!storageObj) {
      console.warn("[extension] No storage API available");
      return Promise.resolve(undefined);
    }
    return storageObj.get(key).then(function(res) {
      return res && res[key] || undefined;
    });
  }

  function setStorageValue(key, value) {
    console.debug("[extension] Saving storage from key: " + key, value);
    if (!storageObj) {
      console.warn("[extension] No storage API available");
      return Promise.resolve(undefined);
    }
    var entry = {};
    entry[key] = value;
    return storageObj.set(entry);
  }

  function getStorageValueObject(key) {
    return getStorageValue(key)
      .then(function(strValue) {
        return JSON.parse(strValue || 'null');
      })
  }

  function getWalletPubkey() {
    return getStorageValue('pubkey')
  }

  function getSettings() {
    return getStorageValueObject('settings');
  }

  function getData() {
    return promiseAll([
      getWalletPubkey(),
      getConfig(),
      getSettings(),
      getStorageValue('lastNotificationCheck')
    ])
      .then(function(res) {
        var data = {};
        data.pubkey = res[0];
        data.config = res[1];
        data.settings = res[2];
        data.lastNotificationCheck = res[3];
        console.debug("[extension] Data loaded:", data);
        return data;
      });
  }

  function getNotificationCount() {
    var startTime = Date.now();

    return getData()
      .then(function(data) {
        var pubkey = data.pubkey;
        var config = data.config;
        var settings = data.settings;
        var lastNotificationCheck = data.lastNotificationCheck;
        const esEnable = config && config.plugins && config.plugins.es && config.plugins.es.enable === true
          && (settings && settings.plugins && settings.plugins.es && settings.plugins.es.enable) !== false;

        // No wallet defined
        if (!data.pubkey || typeof data.pubkey !== 'string') {
          console.warn("[extension] No pubkey defined in local storage. Cannot checking for notificaiton");
          return;
        }

        if (!esEnable) {
          console.warn("[extension] ES plugin disabled. Cannot checking for notificaiton");
          return;
        }

        var peers = settings && settings.plugins && settings.plugins.es && settings.plugins.es.host ?
          [{host: settings.plugins.es.host, port: settings.plugins.es.port}] :
          (config.plugins.es.host ? [{host: config.plugins.es.host, port: config.plugins.es.port}] : config.plugins.es.fallbackNodes);
        if (!peers || !peers.length) {
          console.warn('[extension] No ES peers found, in config and settings');
          return;
        }



        if (lastNotificationCheck > 0 && lastNotificationCheck < Date.now()) {
          console.info('[extension] Checking for notifications... since: ' + new Date(lastNotificationCheck));
        } else {
          console.info('[extension] Checking for notifications... (first check)');
        }

        // Path
        var path = '/user/event/_count'
          + '?q=recipient:' + pubkey
          + " AND NOT _exists_:read_signature";
        if (lastNotificationCheck > 0) {
          var lastTime = Math.round(lastNotificationCheck / 1000);
          path += " AND time > " + lastTime;
        }

        // Create count url for each peers
        var urls = [];
        var peerUrls = [];
        for (var i = 0; i < peers.length; i++) {
          var peer = peers[i];
          var host = peer && peer.host;
          var port = peer && peer.port || 80;
          var protocol = (peer && peer.useSsl || port === 443) ? 'https' : 'http';
          if (host) {
            if (protocol === 'https' && port === 443) port = undefined;
            var peerUrl = protocol + '://' + host + (port ? (':' + port) : '');
            peerUrls.push(peerUrl);
            urls.push(peerUrl + path);
          }
        }

        console.debug('[extension] Using ES peers: ' + peerUrls.join(', '));

        var startTime = Date.now();

        // Fetch count queries
        return fetchAll(urls)
          .then(function(results) {
            if (!results || !results.length) return; // Skip if not count results

            console.debug('[extension] ' + results.length + ' fetch result(s), from ' + peers.length +' peer(s)', results);

            // Get min count
            var count = results.reduce(function(min, result) {
              if (result && result.count >= 0) {
                if (min < 0) return result.count;
                return Math.min(min, result.count);
              }
              return min;
            }, -1);


            console.info('[extension] Checking for notifications [OK] - ' + (count || 0) + ' notification(s) found, in ' + (Date.now() - startTime) + 'ms');

            // Update the check time
            if (count !== -1) {
              notificationReadTime = Date.now();
            }

            return count;
          });
      });
  }

  // FIXME: This code has been updated to use the chrome.alarms API for Manifest V3 compatibility.
  function checkNotifications() {
    return getNotificationCount()
      .then(function(count) {

        if (count > 0) {
          var badgeText = count > 99 ? '99+' : ('' + count);
          action.setBadgeText({
            text: badgeText
          });
        }
        else {
          action.setBadgeText({text: ''});
        }
        action.setBadgeBackgroundColor({
          color: '#11c1f3' // = $calm color - see the SCSS theme
        });

      })
  }

  function resetNotifications() {
    action.setBadgeText({text: ''});
  }

  // If browser allow alarms
  if (alarms && alarms.create && alarms.onAlarm) {
    // Create an alarm to run the notification check periodically.
    // The minimum period for Manifest V3 is 1 minute.
    alarms.create('notificationTimer', {
      periodInMinutes: 1
    });

    // Add a listener for when the alarm goes off.
    alarms.onAlarm.addListener(alarm => {
      if (alarm.name === 'notificationTimer') {
        checkNotifications();
      }
    });

    // Check for notification
    checkNotifications();
  }
}
else {
  console.error("[extension] Cannot init extension: missing some API requirements (action or tabs");
}
