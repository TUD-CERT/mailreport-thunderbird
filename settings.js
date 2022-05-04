/**
 * Shared access to the plugin's settings, currently persisted via storage.local
 */

export const REPORT_ACTIONS = {
  JUNK: 'junk',
  TRASH: 'trash',
  KEEP: 'keep'
}

export const TRANSPORTS = {
  HTTP: 'http',
  SMTP: 'smtp',
  HTTPSMTP: 'http+smtp'
}

export const UPDATE_CHECK = {
  STARTUP: 'startup',
  NEVER: 'never'
}

/**
 * Attempts to retrieve settings from storage.local, otherwise returns static defaults.
 */
export async function getSettings(browser) {
  return await browser.storage.local.get(await getDefaults());
}

/**
 * Simple wrapper for storage.local.set.
 */
export async function setSettings(browser, settings) {
  console.log('Saving settings: ', settings);
  await browser.storage.local.set(settings);
}

/**
 * Returns all static default settings.
 */
export async function getDefaults() {
  let response = await fetch(browser.runtime.getURL('defaults.json'));
  return await response.json();
}

/**
 * Returns true if the given settings are equal to the ones set in storage.local.
 * Ignores keys that are only set in storage.local to support default values
 * that shouldn't be modified by users.
 */
export async function isEqualToSettings(browser, settings) {
  let currentSettings = await getSettings(browser);
  return  Object.entries(settings).map(([k, v]) => {
    return currentSettings.hasOwnProperty(k) && currentSettings[k] === v;
  }).every(Boolean);
}
