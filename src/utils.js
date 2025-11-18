/**
 * Given the ID of a MailIdentity, this returns the associated MailAccount.
 */
export async function getAccountOfIdentity(identityID) {
  const identity = await browser.identities.get(identityID);
  return await browser.accounts.get(identity.accountId);

}

/**
 * Returns the MailIdentity the given MessageHeader was received with (based on the message's folder and headers).
 * External messages (opened from a file or attachment) have no MailIdentity by definition and return null.
 */
export async function getIdentity(messageHeader) {
  if(messageHeader.external) return null;
  const accountId = messageHeader.folder.accountId,
        account = await browser.accounts.get(accountId);
  let identity = null;
  // If an identity matches a recipient, use it. Otherwise, rely on the account's default identity.
  for(let idt of account.identities) {
    for(let recp of messageHeader.recipients.concat(messageHeader.ccList, messageHeader.bccList)) {
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

/**
 * Replacement/Polyfill for Promise.withResolvers(), which doesn't exist in older
 * TB versions we still want to support.
 */
export function promiseWithResolvers() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {resolve, reject, promise};
}

/**
 * Async wrapper for menus.create.
 */
export async function addMenuEntry(createData) {
  const { promise, resolve, reject } = promiseWithResolvers();
  let error;
  const id = browser.menus.create(createData, () => {
    error = browser.runtime.lastError; // Either null or an Error object.
    if (error) {
      reject(error)
    } else {
      resolve();
    }
  });
  try {
    await promise;
    console.info(`Successfully created menu entry <${id}>`);
  } catch (error) {
    console.error("Failed to create menu entry:", createData, error);
  }
  return id;
}

/**
 * Returns an object with telemetry headers to send with requests.
 * Whether any headers are returned depends on the current plugin settings.
 */
export async function generateTelemetryHeaders(settings) {
  const headers = {};
  if (settings.send_telemetry) {
    const agent = await browser.runtime.getBrowserInfo(),
          platform = await browser.runtime.getPlatformInfo();
    headers["Reporting-Agent"] = `${agent.name}/${agent.version} @ ${platform.os}/${platform.arch}`;
    headers["Reporting-Plugin"] = `${browser.runtime.id}/${browser.runtime.getManifest().version}`;
  }
  return headers;
}