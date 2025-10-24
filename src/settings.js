/**
 * Shared access to the plugin's settings, currently persisted via storage.local
 */
import { Settings } from "./models.js";

/**
 * Attempts to retrieve settings from storage.local, otherwise returns static defaults.
 */
export async function getSettings() {
  const settings = new Settings(),
        currentSettings = await browser.storage.local.get(await getDefaults());
  for (const key in currentSettings) {
    settings[key] = currentSettings[key];
  }
  return settings;
}

/**
 * Simple wrapper for storage.local.set.
 */
export async function setSettings(settings) {
  console.log('Saving settings: ', settings);
  await browser.storage.local.set(settings);
}

/**
 * Returns all static default settings.
 */
export async function getDefaults() {
  const settings = new Settings(),
        defaultSettings = await (await fetch(browser.runtime.getURL("defaults.json"))).json();
  for (const key in defaultSettings) {
    settings[key] = defaultSettings[key];
  }
  return settings;
}

/**
 * Compares the given settings to the currently stored settings, which are a set of user-controllable
 * keys plus some settings that can't be changed and are built into the plugin. All keys in the given
 * settings object that have an undefined value are ignored in this comparison. The caller of this
 * function is responsible for providing a settings object with all built-in default settings left
 * at undefined (because this function does no sanity checking).
 */
export async function isEqualToStoredSettings(settings) {
  let currentSettings = await getSettings();
  return currentSettings.equals(settings);
}