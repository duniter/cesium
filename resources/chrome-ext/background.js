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

var browserExtensionRequirements = browser.tabs && action && action.onClicked;

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
  }

  // Adding browser action
  action.onClicked.addListener(openInTab);

  // FIXME: This code has been updated to use the chrome.alarms API for Manifest V3 compatibility.
  function checkNotifications() {
    console.debug("[extension] Checking for notifications...");

    action.setBadgeText({
      text: '0'
    });
    action.setBadgeBackgroundColor({
      color: '#387EF5' // = $positive color - see the SCSS theme
    });
  }

  // Create an alarm to run the notification check periodically.
  // The minimum period for Manifest V3 is 1 minute.
  chrome.alarms.create('notificationTimer', {
    periodInMinutes: 1
  });

  // Add a listener for when the alarm goes off.
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'notificationTimer') {
      checkNotifications();
    }
  });

  checkNotifications();
}
else {
  console.error("[extension] Cannot init extension: missing some API requirements (action or tabs");
}
