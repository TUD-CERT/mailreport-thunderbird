import { getIdentity } from '/common.js';
import { REPORT_ACTIONS, getSettings } from '/settings.js';

let bgPort = browser.runtime.connect({name: 'report'});

/**
 * Switches between views within this layout by manipulating the DOM.
 */
function showView(selector) {
  let $unselected = document.querySelectorAll(`body > form:not(${selector}), body > div:not(${selector})`);
  document.querySelector(selector).classList.remove('hide');
  for(const e of $unselected) e.classList.add('hide');
}

/**
 * Returns the ID of the message to report, depending on what kind of tab is currently active.
 */
async function getReportedMessageID() {
  let tabs = await browser.tabs.query({active: true, windowType: 'normal', windowId: (await browser.windows.getLastFocused()).id});
  if(tabs.length !== 1) throw `Error: Couldn\'t find active tab (got ${tabs.length} candidates)`;
  let activeTab = tabs[0];
  if(activeTab.mailTab) {
    // 3-pane tab (folders/mails/message)
    return (await browser.mailTabs.getSelectedMessages(activeTab.id)).messages[0].id;
  } else {
    // Single message display tab
    return (await browser.messageDisplay.getDisplayedMessage(activeTab.id)).id;
  }
}

/**
 * Checks whether a report for the given message ID is permitted by retrieving the associated account's
 * identities and validating it against the given list of permitted domains.
 */
async function isMessageReportPermitted(messageID, permittedDomains) {
  let message = await browser.messages.get(messageID),
      identity = await getIdentity(message);
  // Pseudo accounts such as "Local Folders" don't have associated identities
  if(identity === null) return false;
  // If no domains were given, reporting is always permitted
  if(permittedDomains.length === 0) return true;
  // Attempt to find a permitted identity to report the message
  let account = await browser.accounts.get(identity.accountId);
  for(let domain of permittedDomains) {
    let domainRegex = new RegExp(domain);
    for(let identity of account.identities) {
      if(domainRegex.test(identity.email.split('@')[1])) return true;
    }
  }
  return false;
}

// Incoming messages from the background script are meant to show a specific view
bgPort.onMessage.addListener((m) => {
  showView(m.view);
});

document.addEventListener('DOMContentLoaded', async () => {
  // Disable reporting functionality in case no permitted account is registered
  let permittedDomains = (await getSettings(browser)).permitted_domains;
  if(!(await isMessageReportPermitted(await getReportedMessageID(), permittedDomains))) showView(".forbidden");
  // Displays the reporting action depending on current settings
  let $reportAction = document.querySelector('span.reportAction');
  switch((await getSettings(browser)).report_action) {
    case REPORT_ACTIONS.JUNK:
      $reportAction.textContent = '\n' + browser.i18n.getMessage('reportCommentJunk');
      break;
    case REPORT_ACTIONS.TRASH:
      $reportAction.textContent = '\n' + browser.i18n.getMessage('reportCommentTrash');
      break;
  }
});
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  bgPort.postMessage({action: 'report', mailID: await getReportedMessageID(), comment: document.querySelector('#comment').value});
});

i18n.updateDocument();
