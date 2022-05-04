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

// Incoming messages from the background script are meant to show a specific view
bgPort.onMessage.addListener((m) => {
  showView(m.view);
});

document.addEventListener('DOMContentLoaded', async () => {
  // Displays the reporting action depending on current settings
  let $reportAction = document.querySelector('span.reportAction');
  switch((await getSettings(browser)).report_action) {
    case REPORT_ACTIONS.JUNK:
      $reportAction.innerHTML = '<br />' + browser.i18n.getMessage('reportCommentJunk');
      break;
    case REPORT_ACTIONS.TRASH:
      $reportAction.innerHTML = '<br />' + browser.i18n.getMessage('reportCommentTrash');
      break;
  }
});
document.querySelector('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  bgPort.postMessage({action: 'report', mailID: await getReportedMessageID(), comment: document.querySelector('#comment').value});
});

i18n.updateDocument();
