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
  // Return default identity (starting from TB91, use browser.identities)
  if(browser.hasOwnProperty('identities')) return browser.identities.getDefault(accountId);
  else return browser.accounts.getDefaultIdentity(accountId)
}
