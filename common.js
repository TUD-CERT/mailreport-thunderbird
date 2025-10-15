/**
 * Returns the MailIdentity the given MessageHeader was received with (based on the message's folder and headers).
 */
export async function getIdentity(messageHeader) {
  let accountId = messageHeader.folder.accountId,
      account = await browser.accounts.get(accountId),
      identity = null;
  // If an identity matches a recpient, use it. Otherwise, rely on the default identity of that folder.
  for(let idt of account.identities) {
    for(let recp of messageHeader.recipients) {
      // Account for "displayname <user@domain.tld>"-style recipients
      if(recp.includes(idt.email)) {
        identity = idt;
        break;
      }
    }
    if(identity !== null) return identity;
  }
  // Return default identity
  return browser.identities.getDefault(accountId);
}

/**
 * Returns the ID of the message to report, depending on what kind of tab is currently active.
 * The reported message is either the currently shown message or in case of the message list,
 * the top-most currently selected message.
 */
export async function getReportedMessageID() {
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

