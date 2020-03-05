/**
 * Add browser actions, for WebExtension
 * (e.g. to open Cesium in a tab, when integrated as a Firefox extension).
 *
 * See https://forum.duniter.org/t/premiere-version-du-module-cesium-pour-firefox/6944
 *
 **/
var browser, chrome;

browser = browser || chrome;

var browserExtensionRequirements = browser.browserAction && browser.browserAction.onClicked && browser.tabs;

// If integrated as a browser extension
if (browserExtensionRequirements) {

  /**
   * Open Cesium in a new browser's tab
   */
  function openInTab() {
    console.debug("[extension] Opening Cesium...")
    browser.tabs.create({
      url: "index.html"
    });


  }

  // FIXME: finish this code
  function checkNotifications() {
    console.debug("[extension] Checking for notifications...");

    browser.browserAction.setBadgeText({
      text: '0'
    });
    browser.browserAction.setBadgeBackgroundColor({
      color: '#387EF5' // = $positive color - see the SCSS theme
    });

    // Loop, after a delay
    setTimeout(function() {
      checkNotifications();
    }, 60 * 1000 /*1min*/);
  }

  // Adding browser action
  browser.browserAction.onClicked.addListener(openInTab);

}
