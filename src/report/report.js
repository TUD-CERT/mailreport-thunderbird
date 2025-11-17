import { localizeDocument } from "../vendor/i18n.mjs";
import { ReportabilityIssue, ReportAction, ReportDialogAction, ReportDialogView } from "../models.js";
import { checkMessageReportability } from "../reporting.js";
import { getSettings } from "../settings.js";
import { getCurrentMessageID } from "../utils.js";

let bgPort = browser.runtime.connect({name: "report"});

/**
 * Shows a notification about a failed message move operation and the
 * intended target folder name of that operation by manipulating the DOM directly.
 * The notification is visible in all report views.
 */
function showMoveMessageFailedNotification(moveTarget) {
  document.querySelector("span.moveTarget").textContent = moveTarget;
  document.querySelector("div.moveMessageFailed").classList.remove("hide");
}

/**
 * Switches between views within this layout by manipulating the DOM.
 */
function showView(selector) {
  const $unselected = document.querySelectorAll(`body > form:not(${selector}), body > div.report:not(${selector})`);
  document.querySelector(selector).classList.remove("hide");
  for(const e of $unselected) e.classList.add("hide");
}

// Incoming messages from the background script are used to show a specific view
bgPort.onMessage.addListener((m) => {
  switch(m.action) {
    case ReportDialogAction.SHOW_MOVE_MSG_FAILED_NOTIFICATION:
      showMoveMessageFailedNotification(m.target);
      break;
    case ReportDialogAction.SHOW_VIEW:
      showView(m.view);
      break;
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  // Disable reporting functionality in case no permitted account is registered
  const settings = await getSettings();
  switch(await checkMessageReportability(await getCurrentMessageID(), settings.permitted_domains)) {
    case ReportabilityIssue.FORBIDDEN:
      showView(ReportDialogView.FORBIDDEN);
      break;
    case ReportabilityIssue.TYPE:
      showView(ReportDialogView.UNREPORTABLE);
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