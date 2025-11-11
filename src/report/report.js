import { localizeDocument } from "../vendor/i18n.mjs";
import { ReportabilityIssue, ReportAction } from "../models.js";
import { checkMessageReportability } from "../reporting.js";
import { getSettings } from "../settings.js";
import { getCurrentMessageID } from "../utils.js";

let bgPort = browser.runtime.connect({name: "report"});

/**
 * Switches between views within this layout by manipulating the DOM.
 */
function showView(selector) {
  const $unselected = document.querySelectorAll(`body > form:not(${selector}), body > div:not(${selector})`);
  document.querySelector(selector).classList.remove("hide");
  for(const e of $unselected) e.classList.add("hide");
}

// Incoming messages from the background script are used to show a specific view
bgPort.onMessage.addListener((m) => {
  showView(m.view);
});

document.addEventListener("DOMContentLoaded", async () => {
  // Disable reporting functionality in case no permitted account is registered
  const settings = await getSettings();
  switch(await checkMessageReportability(await getCurrentMessageID(), settings.permitted_domains)) {
    case ReportabilityIssue.FORBIDDEN:
      showView(".forbidden");
      break;
    case ReportabilityIssue.TYPE:
      showView(".unreportable");
      break;
  }
  // Displays the reporting action depending on current settings
  const $reportAction = document.querySelector("span.reportAction");
  switch(settings.report_action) {
    case ReportAction.JUNK:
      $reportAction.textContent = "\n" + browser.i18n.getMessage("reportCommentJunk");
      break;
    case ReportAction.TRASH:
      $reportAction.textContent = "\n" + browser.i18n.getMessage("reportCommentTrash");
      break;
  }
});
document.querySelector("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  bgPort.postMessage({
    action: "report_fraud",
    mailID: await getCurrentMessageID(),
    comment: document.querySelector("#comment").value
  });
});

localizeDocument();