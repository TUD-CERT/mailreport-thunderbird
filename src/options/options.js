import { localizeDocument } from "../vendor/i18n.mjs";
import { Settings, Transport, UpdateCheck } from "../models.js";
import { getSettings, setSettings, getDefaults, isEqualToStoredSettings } from "../settings.js";

class OptionsForm {
  advancedElements;
  expressiveSubjectCheckbox;
  form;
  httpElements;
  lucyClientIDInput;
  lucyServerInput;
  phishingTransportDropdown;
  simulationTransportDropdown;
  reportActionDropdown;
  resetButton;
  smtpElements;
  smpToInput;
  submitButton;
  toggleAdvancedCheckbox;
  toggleAdvancedContainer;
  updateCheckButton;
  updateCheckDropdown;
  updateElements;
  updateURLInput;

  constructor() {
    this.advancedElements = document.querySelectorAll(".advanced");
    this.expressiveSubjectCheckbox = document.querySelector("#smtp_use_expressive_subject");
    this.form = document.querySelector("form")
    this.formElements = document.querySelectorAll("input, select");
    this.formCheckboxesAndDropdowns = document.querySelectorAll('#phishing_transport, #simulation_transport, #update_check, input[type="checkbox"]');
    this.httpElements = document.querySelectorAll(".http");
    this.lucyClientIDInput = document.querySelector("#lucy_client_id");
    this.lucyServerInput = document.querySelector("#lucy_server");
    this.phishingTransportDropdown = document.querySelector("#phishing_transport");
    this.simulationTransportDropdown = document.querySelector("#simulation_transport");
    this.reportActionDropdown = document.querySelector("#report_action");
    this.resetButton = document.querySelector("#reset");
    this.smtpElements = document.querySelectorAll(".smtp");
    this.smpToInput = document.querySelector("#smtp_to");
    this.submitButton = document.querySelector('button[type="submit"]');
    this.toggleAdvancedCheckbox = document.querySelector('input[name="advanced"]');
    this.toggleAdvancedContainer = document.querySelector("#show_advanced");
    this.updateCheckButton = document.querySelector("#update_check_now");
    this.updateCheckDropdown = document.querySelector("#update_check");
    this.updateElements = document.querySelectorAll(".update");
    this.updateURLInput = document.querySelector("#update_url");
  }

  initialize() {
    // Update button visibilities on form changes
    this.formElements.forEach((e) => {
      e.addEventListener("input", async () => {
        await this.updateSaveButtonVisibility();
      });
    });
    this.updateURLInput.addEventListener("input", () => {
      this.updateUpdateNowButtonVisibility();
    });
    // Update form field visibility when changing checkboxes and dropdowns
    this.formCheckboxesAndDropdowns.forEach((t) => {
      t.addEventListener("change", () => {
        this.updateFormFields();
      });
    })
    // Form button handlers
    this.resetButton.addEventListener("click", async () => {
      this.restore(await getDefaults());
      this.updateUpdateNowButtonVisibility()
      await this.updateSaveButtonVisibility();
    });
    this.form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await setSettings(this.getFormSettings(await getSettings()));
      await this.updateSaveButtonVisibility();
    });
    this.updateCheckButton.addEventListener("click", async () => {
      // Send "update" request to background page
      window.browser.extension.getBackgroundPage().postMessage({
        action: "check_update",
        url: this.updateURLInput.value});
    });
  }

  /**
   * Only show the "save" button when the form differs from the stored settings.
   * Disable it in case the form is invalid.
   */
  async updateSaveButtonVisibility() {
    if(await isEqualToStoredSettings(this.getFormSettings(await getSettings())))
      this.submitButton.classList.add("hide");
    else {
      this.submitButton.classList.remove("hide");
      this.submitButton.disabled = !this.form.checkValidity();
    }
  }

  /**
   * Only show the "check now" update button in case a valid update URL was entered.
   */
  updateUpdateNowButtonVisibility() {
    if(this.updateURLInput.checkValidity() && this.updateURLInput.value.length > 0)
      this.updateCheckButton.classList.remove("hide");
    else this.updateCheckButton.classList.add("hide");
  }

  /**
   * Returns a settings object created from the currently set form values.
   * Takes into account the current permission configuration: If advanced
   * configuration is disabled, only basic config keys/values are set. The
   * remaining keys are left undefined.
   */
  getFormSettings(currentSettings) {
    const settings = new Settings();
    settings.report_action = this.reportActionDropdown.value;
    settings.update_check = this.updateCheckDropdown.value;
    if(currentSettings.permit_advanced_config) {
      settings.lucy_client_id = parseInt(this.lucyClientIDInput.value) || null;
      settings.lucy_server = this.lucyServerInput.value;
      settings.phishing_transport = this.phishingTransportDropdown.value;
      settings.simulation_transport = this.simulationTransportDropdown.value;
      settings.smtp_to = this.smpToInput.value;
      settings.smtp_use_expressive_subject = this.expressiveSubjectCheckbox.checked;
      settings.update_url = this.updateURLInput.value;
    }
    return settings;
  }

  /**
   * Restores all form fields from the given settings object.
   */
  restore(settings) {
    this.lucyClientIDInput.value = settings.lucy_client_id;
    this.lucyServerInput.value = settings.lucy_server;
    this.phishingTransportDropdown.value = settings.phishing_transport;
    this.simulationTransportDropdown.value = settings.simulation_transport;
    this.reportActionDropdown.value = settings.report_action;
    this.smpToInput.value = settings.smtp_to;
    this.expressiveSubjectCheckbox.checked = settings.smtp_use_expressive_subject;
    this.updateCheckDropdown.value = settings.update_check;
    this.updateURLInput.value = settings.update_url;
    this.updateFormFields();
  }

  /**
   * Shows or hides form fields depending on the currently selected settings.
   * Also adds or removes "required" attributes depending on the selected fields.
   */
  updateFormFields() {
    // Advanced settings
    this.advancedElements.forEach((e) => {
      if(this.toggleAdvancedCheckbox.checked) e.classList.remove("hide");
      else e.classList.add("hide");
    })
    // HTTP(S)+SMTP
    let httpEnabled = false,
        smtpEnabled = false;
    [this.phishingTransportDropdown.value, this.simulationTransportDropdown.value].forEach((t) => {
      httpEnabled = httpEnabled || t === Transport.HTTP || t === Transport.HTTPSMTP;
      smtpEnabled = smtpEnabled || t === Transport.SMTP || t === Transport.HTTPSMTP;
    });
    if(httpEnabled) {
      this.httpElements.forEach((e) => {
        e.classList.remove("hide");
      });
      this.lucyServerInput.required = true;
    } else {
      this.httpElements.forEach((e) => {
        e.classList.add("hide");
      });
      this.lucyServerInput.required = false;
    }
    if(smtpEnabled) {
      this.smtpElements.forEach((e) => {
        e.classList.remove("hide");
      });
      this.smpToInput.required = true;
    } else {
      this.smtpElements.forEach((e) => {
        e.classList.add("hide");
      });
      this.smpToInput.required = false;
    }
    // Updates
    this.updateURLInput.required = this.updateCheckButton.value === UpdateCheck.STARTUP;
  }

  /**
   * Updates visibility of various options according to permission configuration.
   */
  showPermittedElements(currentSettings) {
    if(currentSettings.permit_advanced_config) this.toggleAdvancedContainer.classList.remove("hide");
    else this.toggleAdvancedContainer.classList.add("hide");
    this.updateElements.forEach((e) => {
      if(currentSettings.permit_updates) e.classList.remove("hide");
      else e.classList.add("hide");
    })
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = new OptionsForm();
  form.initialize();
  const settings = await getSettings();
  console.log("Loading settings:", settings);
  form.restore(settings);
  form.showPermittedElements(settings);
  form.updateUpdateNowButtonVisibility()
});

localizeDocument();