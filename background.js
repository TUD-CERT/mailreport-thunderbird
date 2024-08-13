import { getIdentity } from '/common.js';
import { REPORT_ACTIONS, TRANSPORTS, UPDATE_CHECK, getSettings } from '/settings.js';
import { checkForUpdate } from '/update/check.js';

// State changes are sent to the reporting view
export const STATE = {
  QUERY: '.query',
  PENDING: '.pending',
  SUCCESS: '.success',
  ERROR: '.error' 
}
let reportViewPort = null,
    simAckWindow = null;


/**
 * Checks the given MessagePart for Lucy headers that indicate the mail is part of a phishing simulation.
 */
function belongsToSimulation(messagePart) {
  for(let key in messagePart.headers) {
    if(key.toLowerCase().startsWith('x-lucy')) return true;
  }
  return false;
}

/**
 * Parses Lucy mail headers and returns an array of reporting URLs.
 */
function getReportingURLs(messagePart) {
  let urls = [];
  for(let key in messagePart.headers) {
    key = key.toLowerCase();
    if(key.includes('x-lucy') && key.includes('victimurl')) urls.push(messagePart.headers[key][0]);
  }
  return urls;
}


/**
 * Parses Lucy mail headers and returns the scenario ID or null, if none was found.
 */
function getScenarioID(messagePart) {
  for(let key in messagePart.headers) {
    key = key.toLowerCase();
    if(key === 'x-lucy-scenario') {
      return messagePart.headers[key][0];
    }
  }
  return null;
}

/**
 * Tries to send HTTP messages to the given Lucy URLs until one succeeds.
 * Returns a boolean to indicate whether the report was successful.
 */
async function sendHTTPReport(urls, email, messageRaw, additionalHeaders, lucyScenarioID=null, comment='') {
  let settings = await getSettings(browser),
      success = false;
  for(let url of urls) {
    try {
      let lucyReport = {
        email: email, 
        mail_content: btoa(messageRaw),
        more_analysis: comment.length > 0, 
        disable_incident_autoresponder: false,
        enable_comment_to_deeper_analysis_request: comment
      };
      if(lucyScenarioID !== null) {
        lucyReport.scenario_id = lucyScenarioID;
        console.log('Reporting simulation for scenario ', lucyScenarioID, ' as ', email, ' via HTTP(S) to ', url);
      } else console.log('Reporting phishing mail as ', email, ' via HTTP(S) to ', url);
      var request = new XMLHttpRequest();
      // Send report
      await fetch(url, {
        method: 'POST', 
        headers: {'Content-Type': 'text/plain; Charset=UTF-8', ...additionalHeaders},  // Content-Type taken from the Lucy Outlook AddIn
        body: JSON.stringify(lucyReport)
      });
      success = true;
      break;
    } catch(err) {
      console.log('Could not send report via HTTP(S)', err);
    }
  }
  return success;
}

/**
 * Recurses depth-first over a MessagePart object and its subparts to find the first part of the given type.
 * If one was found, return it. Otherwise, this returns null.
 */
function findMessagePart(messagePart, type) {
  if(messagePart.contentType.includes(type)) return messagePart;
  if(messagePart.hasOwnProperty('parts')) {
    for(let part of messagePart.parts) {
      let result = findMessagePart(part, type);
      if(result !== null) return result;
    }
  }
  return null;
}

/**
 * Recurses depth-first over a MessagePart object and its subparts to find and return the preview part (HTML or plain),
 * that is the part a MUA would render by default. If no valid part was found, this returns null.
 */
function findPreviewMessagePart(messagePart) {
  let contentType = messagePart.contentType,
      result = null;
  // Stop conditions
  if(contentType.includes('multipart/alternative')) {
    // For multipart/alternative, prefer HTML parts over plain ones
    result = findMessagePart(messagePart, 'text/html');
    if(result === null) result = findMessagePart(messagePart, 'text/plain');
    return result;
  } else if(contentType.includes('text/html') || contentType.includes('text/plain')) return messagePart;
  // Recurse over remaining parts
  if(messagePart.hasOwnProperty('parts')) {
    for(let part of messagePart.parts) {
      result = findPreviewMessagePart(part);
      if(result !== null) return result;
    }
  }
  return null;
}

/**
 * MessageHeader.subject seems to remove prefixes such as "Re:" from the subject line.
 * Therefore, we take our subject directly from the headers with MessageHeader.subject as fallback.
 */
function findSubject(messagePart, messageHeader) {
  if(messagePart.headers.hasOwnProperty('subject') && messagePart.headers.subject.length > 0) {
    return messagePart.headers.subject[0];
  } else return messageHeader.subject;
}

/**
 * Shows a specific view/state within the reporting view (in case the reporting view is currently active).
 */
function updateReportView(state) {
  if(reportViewPort !== null) reportViewPort.postMessage({view: state});
}

/**
 * Creates a popup congratulating the user for having successfully reported a simulated phishing campaign sample.
 */
async function showSimulationAcknowledgement() {
  simAckWindow = await browser.windows.create({
    url: 'report/simulation_ack.html',
    type: 'popup',
    titlePreface: browser.i18n.getMessage('simulationAckTitlePreface'),
    height: 200,
    width: 800
  });
}

/**
 * Returns a MailFolder of the requested type (string) for the given MailAccount or
 * null, if no folder of that type was found.
 */
function getFolderForAccount(account, type) {
  for(let folder of account.folders) {
    if(folder.type === type) return folder;
  }
  return null;
}

/**
 * Moves the given message (a MessageHeader instance) to a specific folder (one of REPORT_ACTIONS).
 * If folder is REPORT_ACTIONS.KEEP, this is a NOP.
 */
async function moveMessageTo(message, folder) {
  if(folder === REPORT_ACTIONS.KEEP) return;
  // Infer account from message
  let account = await browser.accounts.get(message.folder.accountId),
      targetFolder = getFolderForAccount(account, folder);
  if(targetFolder !== null) {
    // Starting with TB128, browser.messages.move() expects a MailFolderId instead of a MailFolder
    try {
      await browser.messages.move([message.id], targetFolder.id);
    } catch(err) {
      await browser.messages.move([message.id], targetFolder);
    }
  }
  console.log(`Moving message ${message.id} to ${folder} folder`);
}

/**
 * Returns an object with additional telemetry headers to send with each request
 * (derived from current plugin settings).
 */
async function getAdditionalHeaders(settings) {
  let headers = {};
  if(settings.send_telemetry) {
    let agent = await browser.runtime.getBrowserInfo();
    headers['Reporting-Agent'] = `${agent.name}/${agent.version}`;
    headers['Reporting-Plugin'] = `${browser.runtime.id}/${browser.runtime.getManifest().version}`;
  }
  return headers;
}

/**
 * Reports an E-Mail via its internal identifier and sends a report with the given user-supplied comment.
 */
async function reportMail(messageID, comment) {
  updateReportView(STATE.PENDING);
  
  // Retrieve currently selected mails as list
  let message = await browser.messages.get(messageID),
      messagePart = await browser.messages.getFull(messageID),
      messageRaw = await browser.messages.getRaw(messageID),
      settings = await getSettings(browser),
      identity = await getIdentity(message),
      isSimulation = belongsToSimulation(messagePart),
      transport = isSimulation ? settings.simulation_transport : settings.phishing_transport,
      additionalHeaders = await getAdditionalHeaders(settings),
      success = true;

  // Send report
  if(transport === TRANSPORTS.HTTP || transport === TRANSPORTS.HTTPSMTP) {
    let lucy_report_url = `https://${settings.lucy_server}/phishing-report`;
    if(settings.lucy_client_id !== null) lucy_report_url += `/${settings.lucy_client_id}`;
    let lucyScenarioID = isSimulation ? getScenarioID(messagePart) : null,
        urls = isSimulation ? getReportingURLs(messagePart) : [lucy_report_url];
    // If invalid Lucy headers are set, fall back to the configured Lucy instance
    if(urls.length === 0) urls = [lucy_report_url];
    success = success && await sendHTTPReport(urls, identity.email, messageRaw, additionalHeaders, lucyScenarioID, comment);
  }
  if(transport === TRANSPORTS.SMTP || transport === TRANSPORTS.HTTPSMTP) {
    let reportedSubject = findSubject(messagePart, message),
        messageData = { date: message.date.toString(),
                        from: message.author,
                        subject: reportedSubject,
                        to: message.recipients.join(', '),
                        isHTML: false,
                        preview: ''},  // API schema requires strings instead of null
        previewPart = findPreviewMessagePart(messagePart),
        subject = 'Phishing Report';
    if(settings.smtp_use_expressive_subject) subject += `: ${reportedSubject}`;
    if(previewPart !== null) {
      messageData.preview = previewPart.body;
      messageData.isHTML = previewPart.contentType.includes('text/html');
    }
    let smtp_success = await browser.reportSpam.sendSMTPReport(identity,
                                                               settings.smtp_to, 
                                                               identity.email, 
                                                               subject,
                                                               settings.lucy_client_id, 
                                                               messageData,
                                                               [messageRaw],
                                                               additionalHeaders,
                                                               comment);
    success = success && smtp_success;
  }
  updateReportView(success ? STATE.SUCCESS : STATE.ERROR);
  if(success) {
    await moveMessageTo(message, settings.report_action);
    if(isSimulation) await showSimulationAcknowledgement();
  }
}

// Main request dispatcher (background scripts <-> views)
browser.runtime.onConnect.addListener((port) => {
  switch(port.name) {
    case 'report':
      reportViewPort = port;
      // Report request
      reportViewPort.onMessage.addListener(async (m) => {
        switch(m.action) {
          case 'report':
            await reportMail(m.mailID, m.comment);
            break;
        }
      });
      // Disconnect when report view closes
      reportViewPort.onDisconnect.addListener(() => {
        reportViewPort = null;
      });
      break;
    case 'simulation_ack':
      // Close request
      port.onMessage.addListener(async (m) => {
        switch(m.action) {
          case 'close':
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
window.addEventListener('message', async (e) => {
  switch(e.data.action) {
    case 'update':
      let settings = await getSettings(browser);
      await checkForUpdate(e.data.url, await getAdditionalHeaders(settings), true);
      break;
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // Check for updates on startup (if configured to do so)
  setTimeout(async () => {
    let settings = await getSettings(browser);
    if(settings.update_check === UPDATE_CHECK.STARTUP) {
      console.log('Performing automatic update check');
      await checkForUpdate(settings.update_url, await getAdditionalHeaders(settings));
    }
  }, 5000);

  // In case a global toolbar report button is used ("browser action"), add event listeners to enable/disable it depending on UI state
  if((await getSettings(browser)).use_toolbar_button) {
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

console.log('Spam reporting extension loaded');
