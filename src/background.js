import {MoveMessageStatus, ReportDialogView, ReportResultStatus, UpdateCheck} from "./models.js";
import {checkMessageReportability, reportFraud, reportSpam} from "./reporting.js";
import { getSettings } from "./settings.js";
import { checkForUpdate } from "./update.js";
import {addMenuEntry, generateTelemetryHeaders, getCurrentMessageID, promiseWithResolvers} from "./utils.js";

let reportViewPort = null,
    reportViewConnectedPromise = null,
    simAckWindow = null;


/**
 * Shows a specific view/state within the reporting view (in case the reporting view is currently active).
 */
function updateReportView(state) {
  if(reportViewPort === null) return;
  reportViewPort.postMessage({action: "showView", view: state});
}

/**
 * Enables a notification shown within the report view that informs users about
 * a failed attempt to move the reported message to another folder. The name of
 * the target folder is given as moveTarget and shown in the dialog.
 */
function showReportMoveMessageFailedNotification(moveTarget) {
  if(reportViewPort === null) return;
  reportViewPort.postMessage({action: "showMoveMessageFailedNotification", target: moveTarget});
}

/**
 * Creates a popup congratulating the user for having successfully reported a simulated phishing campaign sample.
 */
async function showSimulationAcknowledgement() {
  simAckWindow = await browser.windows.create({
    url: "simulation/simulation_ack.html",
    type: "popup",
    titlePreface: browser.i18n.getMessage("simulationAckTitlePreface"),
    height: 200,
    width: 800
  });
}

async function handleFraudReport(messageID, comment) {
  updateReportView(ReportDialogView.PENDING);
  const reportResult = await reportFraud(messageID, comment);
  switch(reportResult.reportStatus) {
    case ReportResultStatus.SUCCESS:
      if(reportResult.moveMessageStatus === MoveMessageStatus.NONEXISTENT_FOLDER)
        showReportMoveMessageFailedNotification(reportResult.moveMessageTarget);
      updateReportView(ReportDialogView.SUCCESS);
      break;
    case ReportResultStatus.SIMULATION:
      updateReportView(ReportDialogView.SUCCESS);
      await showSimulationAcknowledgement();
      break;
    case ReportResultStatus.ERROR:
      updateReportView(ReportDialogView.ERROR);
      console.log(reportResult.diagnosis);
      break;
  }
}

async function handleSpamReport(messageID) {
  const settings = await getSettings();
  // The report view checks reportability itself, but we need to duplicate the check here to act on its result
  if(await checkMessageReportability(await getCurrentMessageID(), settings.permitted_domains)) return;
  updateReportView(ReportDialogView.PENDING);
  const reportResult = await reportSpam(messageID);
  switch(reportResult.reportStatus) {
    case ReportResultStatus.SUCCESS:
      if(reportResult.moveMessageStatus === MoveMessageStatus.NONEXISTENT_FOLDER)
        showReportMoveMessageFailedNotification(reportResult.moveMessageTarget);
      updateReportView(ReportDialogView.SUCCESS);
      break;
    case ReportResultStatus.SIMULATION:
      updateReportView(ReportDialogView.SUCCESS);
      await showSimulationAcknowledgement();
      break;
    case ReportResultStatus.ERROR:
      updateReportView(ReportDialogView.ERROR);
      console.log(reportResult.diagnosis);
      break;
  }
}

/**
 * Stalls the caller until the connection to an opened report view has been successfully established.
 */
async function reportViewConnected() {
  if(reportViewConnectedPromise === null) reportViewConnectedPromise = promiseWithResolvers();
  await reportViewConnectedPromise.promise;
}

// Main request dispatcher (background scripts <-> views)
browser.runtime.onConnect.addListener((port) => {
  switch(port.name) {
    case "report":
      reportViewPort = port;
      if(reportViewConnectedPromise !== null) reportViewConnectedPromise.resolve();
      // Report request
      reportViewPort.onMessage.addListener(async (m) => {
        switch(m.action) {
          case "report_fraud":
            await handleFraudReport(m.mailID, m.comment);
            break;
        }
      });
      // Disconnect when report view closes
      reportViewPort.onDisconnect.addListener(() => {
        reportViewPort = null;
        reportViewConnectedPromise = null;
      });
      break;
    case "simulation_ack":
      // Close request
      port.onMessage.addListener(async (m) => {
        switch(m.action) {
          case "close":
            await browser.windows.remove(simAckWindow.id);
            break;
        }
      });
      // Disconnect when sim ack view closes
      port.onDisconnect.addListener(() => {
        simAckWindow = null;
      });
      break;
  }
});

/**
 * Dispatcher for messages sent directly to this window.
 * Seems to be the only (working) way to receive message from option pages,
 * runtime.connect() doesn't work here because option page scripts seem to be
 * their own background script ("privileged scripts" according to docs).
 */
window.addEventListener("message", async (e) => {
  switch(e.data.action) {
    case "check_update":
      let settings = await getSettings();
      await checkForUpdate(e.data.url, await generateTelemetryHeaders(settings), true);
      break;
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();

  // Check for updates on startup (if configured to do so)
  setTimeout(async () => {
    if(settings.update_check === UpdateCheck.STARTUP) {
      console.log("Performing automatic update check");
      await checkForUpdate(settings.update_url, await generateTelemetryHeaders(settings));
    }
  }, 5000);

  // Add a menu in case spam reports are enabled
  if(settings.spam_report_enabled) {
    // Populate button menu
    await addMenuEntry({
      id: "report-fraud",
      contexts: ["browser_action_menu", "message_display_action_menu"],
      icons: {
        "16": "images/fraud_16.png",
        "32": "images/fraud_32.png",
        "64": "images/fraud_64.png"
      },
      title: browser.i18n.getMessage("menuFraudReportLabel")
    })
    await addMenuEntry({
      id: "report-spam",
      contexts: ["browser_action_menu", "message_display_action_menu"],
      icons: {
        "16": "images/spam_16.png",
        "32": "images/spam_32.png",
        "64": "images/spam_64.png"
      },
      title: browser.i18n.getMessage("menuSpamReportLabel")
    })
    const actionAPI = settings.use_toolbar_button ? "browserAction" : "messageDisplayAction";
    browser.menus.onClicked.addListener(async (info, tab) => {
      browser[actionAPI].openPopup();
      if(info.menuItemId === "report-spam") {
        await reportViewConnected();
        await handleSpamReport(await getCurrentMessageID());
      }
    })
  }

  // In case a global toolbar report button is used ("browser action"), add event listeners to enable/disable it depending on UI state
  if((await getSettings()).use_toolbar_button) {
    // Enable the reporting button if a single E-Mail is selected
    browser.mailTabs.onSelectedMessagesChanged.addListener((tab, m) => {
      m.messages.length === 1 ? browser.browserAction.enable() : browser.browserAction.disable();
    });

    // Re-evaluate the reporting button status when the user switches between mail folders
    browser.mailTabs.onDisplayedFolderChanged.addListener(async (tab, f) => {
      if(tab.mailTab) {
        // Top-level account folders have a 'path' of '/'
        if(f.path !== '/') {
          (await browser.mailTabs.getSelectedMessages()).messages.length === 1 ? browser.browserAction.enable() : browser.browserAction.disable();
        } else browser.browserAction.disable();
      }
    });

    // Re-evaluate the reporting button status when the user switches between tabs
    browser.tabs.onActivated.addListener(async (ev) => {
      if(await browser.messageDisplay.getDisplayedMessage(ev.tabId) !== null) browser.browserAction.enable();
      else browser.browserAction.disable();
    });
  }
});

console.log("Extension mailreport-thunderbird loaded");