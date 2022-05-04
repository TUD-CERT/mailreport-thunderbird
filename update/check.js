/**
 * Update script, should only be included from the background script due
 * to it doing its own window management.
 */
let notificationWindow = null;

const UPDATE_STATE = {
  UP2DATE: '.up2date',
  AVAILABLE: '.available',
  ERROR: '.exception'
}


/**
 * Update window request dispatcher
 */
browser.runtime.onConnect.addListener((port) => {
  switch(port.name) {
    case 'update':
      // Close request
      port.onMessage.addListener(async (m) => {
        switch(m.action) {
          case 'close':
            await browser.windows.remove(notificationWindow.id);
            break;
        }
      });
      // Disconnect when update view closes
      port.onDisconnect.addListener(() => {
        notificationWindow = null;
      });
      break;
  }
});

/**
 * Queries the given URL for updates and only notifies the user in 
 * case there is an update available. If forceFeedback is true,
 * the result will always been shown (including "no update" or errors).
 */
export async function checkForUpdate(url, headers, forceFeedback=false) {
  let currentVersion = browser.runtime.getManifest().version;
  try {
    let response = await fetch(url, {method: 'GET', headers: headers, cache: 'no-store'}),
        result = await response.json();
    if(result.hasOwnProperty('version') && result.hasOwnProperty('url')) {
      if(result.version > currentVersion) await showNotificationView(UPDATE_STATE.AVAILABLE, result.url, result.version);
      else if(forceFeedback) await showNotificationView(UPDATE_STATE.UP2DATE, result.url, result.version);
    } else throw true;  // Valid JSON with missing keys
  } catch(e) {
    console.log(`Could not fetch or parse update data from ${url}`);
    if(forceFeedback) await showNotificationView(UPDATE_STATE.ERROR);
  }
}

/**
 * Displays an update notification window.
 * If state is AVAILABLE, the given URL will be passed to the
 * notification window as well.
 */
async function showNotificationView(initialState, url=null, version=null) {
  // Return if there is already an open notification window
  if(notificationWindow != null) return;
  notificationWindow = await browser.windows.create({
    url: `/update/update_notification.html?state=${encodeURIComponent(initialState)}&url=${encodeURIComponent(url)}&version=${encodeURIComponent(version)}`,
    type: 'popup',
    titlePreface: `${browser.runtime.getManifest().name}: ${browser.i18n.getMessage('updateNotificationTitlePreface')}`,
    height: 200,
    width: 800
  });
}
