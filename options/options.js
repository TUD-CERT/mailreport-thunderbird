import { TRANSPORTS, UPDATE_CHECK, getSettings, setSettings, getDefaults, isEqualToSettings } from '/settings.js';

// See https://developer.thunderbird.net/add-ons/mailextensions#option-scripts
const browser = window.browser.extension.getBackgroundPage().browser;

/**
 * Returns a settings object created from the currently set form values.
 * Takes into account the current permission configuration: If advanced
 * configuration is disabled, only basic config keys/values are returned.
 */
function getFormSettings(settings) {
  let basicSettings = {
    report_action: document.querySelector('#report_action').value,
    update_check: document.querySelector('#update_check').value
  };
  if(settings.permit_advanced_config) {
    return {
      ...basicSettings,
      lucy_client_id: parseInt(document.querySelector('#lucy_client_id').value) || null,
      lucy_server: document.querySelector('#lucy_server').value,
      phishing_transport: document.querySelector('#phishing_transport').value,
      simulation_transport: document.querySelector('#simulation_transport').value,
      smtp_to: document.querySelector('#smtp_to').value,
      smtp_use_expressive_subject: document.querySelector('#smtp_use_expressive_subject').checked,
      update_url: document.querySelector('#update_url').value
    }
  } else return basicSettings;
}

/**
 * Restores all form fields from the given settings object.
 */
async function restoreFormSettings(settings) {
  document.querySelector('#lucy_client_id').value = settings.lucy_client_id;
  document.querySelector('#lucy_server').value = settings.lucy_server;
  document.querySelector('#phishing_transport').value = settings.phishing_transport;
  document.querySelector('#report_action').value = settings.report_action;
  document.querySelector('#simulation_transport').value = settings.simulation_transport;
  document.querySelector('#smtp_to').value = settings.smtp_to;
  document.querySelector('#smtp_use_expressive_subject').checked = settings.smtp_use_expressive_subject;
  document.querySelector('#update_check').value = settings.update_check;
  document.querySelector('#update_url').value = settings.update_url;
  updateFormFields();
  updateUpdateNowButtonVisibility();
}

/**
 * Shows or hides form fields depending on the currently selected settings.
 * Also adds or removes 'required' attributes depending on the selected fields.
 */
function updateFormFields() {
  // Advanced settings
  let showAdvancedSettings = document.querySelector('input[name="advanced"]').checked;
  for(const t of document.querySelectorAll('.advanced')) {
    if(showAdvancedSettings) t.classList.remove('hide');
    else t.classList.add('hide');
  }
  
  // HTTP(S)+SMTP
  const $httpElements = document.querySelectorAll('.http'),
        $smtpElements = document.querySelectorAll('.smtp'),
        $httpInput = document.querySelector('#lucy_server'),
        $smtpInput = document.querySelector('#smtp_to');
  let httpEnabled = false,
      smtpEnabled = false;
  for(const t of document.querySelectorAll('#phishing_transport, #simulation_transport')) {
    httpEnabled = httpEnabled || t.value === TRANSPORTS.HTTP || t.value === TRANSPORTS.HTTPSMTP;
    smtpEnabled = smtpEnabled || t.value === TRANSPORTS.SMTP || t.value === TRANSPORTS.HTTPSMTP;
  };
  if(httpEnabled) {
    for(const e of $httpElements) e.classList.remove('hide');
    $httpInput.required = true;
  } else {
    for(const e of $httpElements) e.classList.add('hide');
    $httpInput.required = false;
  }
  if(smtpEnabled) {
    for(const e of $smtpElements) e.classList.remove('hide');
    $smtpInput.required = true;
  } else {
    for(const e of $smtpElements) e.classList.add('hide');
    $smtpInput.required = false;
  }
  // Updates
  const $updateCheck = document.querySelector('#update_check'),
        $updateURL = document.querySelector('#update_url');
  $updateURL.required = $updateCheck.value === UPDATE_CHECK.STARTUP;
}

/**
 * Only show the 'save' button when the form differs from the stored settings.
 * Disable it in case the form is invalid.
 */
async function updateSaveButtonVisibility() {
  let $form = document.querySelector('form'),
      $saveBtn = document.querySelector('button[type="submit"]');
  if(await isEqualToSettings(browser, getFormSettings(await getSettings(browser)))) $saveBtn.classList.add('hide');
  else {
    $saveBtn.classList.remove('hide');
    $saveBtn.disabled = !$form.checkValidity();
  }
}

/**
 * Updates visibility of various options according to permission configuration.
 */
function showPermittedElements(settings) {
  let $showAdvancedCheckbox = document.querySelector('#show_advanced'),
      $updateElements = document.querySelectorAll('.update');
  if(settings.permit_advanced_config) $showAdvancedCheckbox.classList.remove('hide');
  else $showAdvancedCheckbox.classList.add('hide');
  for(const e of $updateElements) {
    if(settings.permit_updates) e.classList.remove('hide');
    else e.classList.add('hide');
  }
}

/**
 * Only show the 'check now' update button in case a valid update URL was entered.
 */
function updateUpdateNowButtonVisibility() {
  let $updateCheck = document.querySelector('button[type="button"]'),
      $updateURL = document.querySelector('#update_url');
  if($updateURL.checkValidity() && $updateURL.value.length > 0) $updateCheck.classList.remove('hide');
  else $updateCheck.classList.add('hide');
}

document.addEventListener('DOMContentLoaded', async () => {
  let settings = await getSettings(browser);
  await restoreFormSettings(settings);
  showPermittedElements(settings);
});
for(const t of document.querySelectorAll('input, select')) {
  t.addEventListener('input', updateSaveButtonVisibility);
};
document.querySelector('#update_url').addEventListener('input', updateUpdateNowButtonVisibility);
document.querySelector('#reset').addEventListener('click', async () => {
  await restoreFormSettings(await getDefaults());
  await updateSaveButtonVisibility();
});
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await setSettings(browser, getFormSettings(await getSettings(browser)));
  await updateSaveButtonVisibility();
});
for(const t of document.querySelectorAll('#phishing_transport, #simulation_transport, #update_check, input[type="checkbox"]')) {
  t.addEventListener('change', updateFormFields);
};
document.querySelector('#update_check_now').addEventListener('click', async () => {
  // Send 'update' request to background page
  window.browser.extension.getBackgroundPage().postMessage({action: 'update', url: document.querySelector('#update_url').value});
});

i18n.updateDocument();
