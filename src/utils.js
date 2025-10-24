/**
 * Given the ID of a MailIdentity, this returns the associated MailAccount.
 */
export async function getAccountOfIdentity(identityID) {
  const identity = await browser.identities.get(identityID);
  return await browser.accounts.get(identity.accountId);

}

/**
 * Returns the MailIdentity the given MessageHeader was received with (based on the message"s folder and headers).
 */
export async function getIdentity(messageHeader) {
  const accountId = messageHeader.folder.accountId,
        account = await browser.accounts.get(accountId);
  let identity = null;
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
 * Returns the ID of the currently selected message, depending on what kind of tab is currently active.
 * That message is either the currently shown one or in case of the message list,
 * the top-most currently selected message.
 */
export async function getCurrentMessageID() {
  let tabs = await browser.tabs.query({
    active: true,
    windowType: "normal",
    windowId: (await browser.windows.getLastFocused()).id
  });
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