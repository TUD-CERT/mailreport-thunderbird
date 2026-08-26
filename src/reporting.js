import {
  BodyType,
  Message,
  MoveMessageStatus,
  ReportabilityIssue,
  ReportAction,
  ReportResult,
  ReportResultStatus,
  Transport
} from "./models.js";
import {getSettings} from "./settings.js";
import {encodeHTML, generateTelemetryHeaders, getAccountOfIdentity, getIdentity, objToStr} from "./utils.js";

/**
 * Parses and returns the Subject line from MessagePart and MessageHeader instances.
 * MessageHeader.subject seems to remove prefixes such as "Re:" from the subject line.
 * Therefore, we try to take our subject directly from the headers and use
 * MessageHeader.subject as fallback.
 */
function findSubject(messagePart, messageHeader) {
  if(messagePart.headers.hasOwnProperty("subject") && messagePart.headers.subject.length > 0) {
    return messagePart.headers.subject[0];
  } else return messageHeader.subject;
}

/**
 * Recurses depth-first over a MessagePart object and its subparts to find the first part of the given type.
 * If one was found, return it. Otherwise, this returns null.
 */
function findMessagePart(messagePart, type) {
  if(messagePart.contentType.includes(type)) return messagePart;
  if(messagePart.hasOwnProperty("parts")) {
    for(let part of messagePart.parts) {
      const result = findMessagePart(part, type);
      if(result !== null) return result;
    }
  }
  return null;
}

/**
 * Recurses depth-first over a MessagePart object and its subparts to find and return the
 * preview part (HTML or plain) that a MUA would render by default. If no valid part was found, this returns null.
 */
function findPreviewMessagePart(messagePart) {
  const contentType = messagePart.contentType;
  let result = null;
  // Stop conditions
  if(contentType.includes("multipart/alternative")) {
    // For multipart/alternative, prefer HTML parts over plain ones
    result = findMessagePart(messagePart, "text/html");
    if(result === null) result = findMessagePart(messagePart, "text/plain");
    return result;
  } else if(contentType.includes("text/html") || contentType.includes("text/plain")) return messagePart;
  // Recurse over remaining parts
  if(messagePart.hasOwnProperty("parts")) {
    for(let part of messagePart.parts) {
      result = findPreviewMessagePart(part);
      if(result !== null) return result;
    }
  }
  return null;
}

async function parseMessage(messageID) {
  const messageHeader = await browser.messages.get(messageID),
      messagePart = await browser.messages.getFull(messageID),
      messageRaw = await browser.messages.getRaw(messageID, { data_format: "File" }),
      identity = await getIdentity(messageHeader),
      previewPart = findPreviewMessagePart(messagePart);
  const result = new Message();
  result.id = messageHeader.id;
  result.from = messageHeader.author;
  result.to = messageHeader.recipients.join(", ");
  result.reporter = identity.id;
  result.date = messageHeader.date.toString();
  result.subject = findSubject(messagePart, messageHeader);
  result.headers = messagePart.headers;
  if(previewPart !== null) {
    result.preview = previewPart.body;
    result.previewType = previewPart.contentType.includes("text/html") ? BodyType.HTML : BodyType.PLAIN;
  } else {
    result.preview = "";
    result.previewType = BodyType.PLAIN;
  }
  result.raw = messageRaw;
  return result;
}

/**
 * Checks the given MessagePart for Lucy headers that indicate the mail is part
 * of a phishing simulation that was launched from the given Lucy server.
 */
function belongsToSimulation(message, lucy_server) {
  for(let key in message.headers) {
    key = key.toLowerCase();
    if(key.startsWith("x-lucy") && key.includes("victimurl")) {
      const reportURL = new URL(message.headers[key][0]);
      if(reportURL.hostname === lucy_server) return true;
    }
  }
  return false;
}

/**
 * Parses Lucy mail headers and returns the scenario ID or null, if none was found.
 */
function getScenarioID(message) {
  for(let key in message.headers) {
    key = key.toLowerCase();
    if(key === "x-lucy-scenario") return message.headers[key][0];
  }
  return null;
}

/**
 * Tries to report HTTP messages to the given Lucy URLs until one succeeds.
 * Throws an exception in case none succeeded.
 */
async function sendHTTPReport(
    urls,
    message,
    additionalHeaders,
    lucyScenarioID=null,
    comment=null
) {
  const identity = await browser.identities.get(message.reporter);
  const lucyReport = {
    email: identity.email,
    mail_content: message.raw,
    more_analysis: comment !== null,
    disable_incident_autoresponder: false,
    enable_comment_to_deeper_analysis_request: comment === null ? "" : comment
  };
  let lastSendException = null;
  if(lucyScenarioID !== null) lucyReport.scenario_id = lucyScenarioID;
  for(let url of urls) {
    if("scenario_id" in lucyReport) console.log("Reporting simulation for scenario", lucyScenarioID, "as", identity.email, "via HTTP(S) to", url);
    else console.log("Reporting phishing mail as", identity.email, "via HTTP(S) to", url);
    // Send report
    try {
      await fetch(url, {
        method: "POST",
        headers: {"Content-Type": "text/plain; Charset=UTF-8", ...additionalHeaders},  // Content-Type taken from the Lucy Outlook AddIn
        body: JSON.stringify(lucyReport)
      });
      lastSendException = null;
      break;
    } catch(err) {
      console.log("Could not send report via HTTP(S)", err);
      lastSendException = err;
    }
  }
  if(lastSendException !== null) throw lastSendException;
}

/**
 * Tries to report a message via e-mail. Throws an exception in case of failure.
 */
async function sendSMTPReport(
    destination,
    subject,
    lucyClientID,
    message,
    additionalHeaders,
    comment=null
) {
  const identity = await browser.identities.get(message.reporter);
  let body = "",
      originalMessageDelimiter = "-----Original Message-----<br />",
      originalMessagePreview = message.preview.replace(/(?:\r\n|\r|\n)/g, "<br />");

  if(message.previewType === BodyType.HTML) {
    originalMessageDelimiter = "";
    originalMessagePreview = message.preview;
  }
  const commentBody = comment !== null ? `X-More-Analysis: True<br />${encodeHTML(comment)}<br />` : "",
        lucyClientBody = lucyClientID !== null ? `X-Lucy-Client: ${lucyClientID}<br />` : "",
        lucyCIBody = lucyClientID !== null ? "X-CI-Report: True<br />" : "";
  body = `${lucyClientBody}${commentBody}${lucyCIBody}${objToStr(additionalHeaders, "<br />")}<br /><br />${originalMessageDelimiter}From: ${encodeHTML(message.from)}<br />Sent: ${encodeHTML(message.date)}<br />To: ${encodeHTML(message.to)}<br />Subject: ${encodeHTML(message.subject)}<br /><br />${originalMessagePreview}`;
  console.log("Reporting selected mail via SMTP as", identity.email, "to", destination);
  await browser.messages.sendMessage({
    subject: subject,
    identityId: identity.id,
    to: destination,
    attachments: [{
      file: message.raw,
      name: "Forwarded message.eml"
    }],
    body: body,
    isPlainText: message.previewType === BodyType.PLAIN
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
  if(folder === ReportAction.KEEP) return MoveMessageStatus.SUCCESS;
  // Infer account from message
  const account = await getAccountOfIdentity(message.reporter),
        targetFolder = getFolderForAccount(account, folder);
  if(targetFolder === null) return MoveMessageStatus.NONEXISTENT_FOLDER;
  console.log(`Moving message ${message.id} to ${folder} folder`);
  // Starting with TB128, browser.messages.move() expects a MailFolderId instead of a MailFolder
  try {
    await browser.messages.move([message.id], targetFolder.id);
  } catch(err) {
    await browser.messages.move([message.id], targetFolder);
  }
  return MoveMessageStatus.SUCCESS;
}

/**
 * Reports an E-Mail as fraud via its internal identifier and sends a report with the given user-supplied comment.
 */
export async function reportFraud(messageID, comment) {
  let message,
      isSimulation,
      settings,
      transport,
      parsedComment,
      additionalHeaders;
  try {
    settings = await getSettings();
    message = await parseMessage(messageID);
    isSimulation = belongsToSimulation(message, settings.lucy_server);
    transport = isSimulation ? settings.simulation_transport : settings.phishing_transport;
    parsedComment = comment.length > 0 ? comment : null;
    additionalHeaders = await generateTelemetryHeaders(settings);

    if(transport === Transport.HTTP || transport === Transport.HTTPSMTP) {
      let lucyReportURL = `https://${settings.lucy_server}/phishing-report`;
      if(settings.lucy_client_id !== null) lucyReportURL += `/${settings.lucy_client_id}`;
      const lucyScenarioID = isSimulation ? getScenarioID(message) : null;
      await sendHTTPReport(
          [lucyReportURL],
          message,
          additionalHeaders,
          lucyScenarioID,
          parsedComment
      );
    }
    if(transport === Transport.SMTP || transport === Transport.HTTPSMTP) {
      let subject = "Phishing Report";
      if(settings.smtp_use_expressive_subject) subject += `: ${message.subject}`;
      await sendSMTPReport(
          settings.smtp_to,
          subject,
          settings.lucy_client_id,
          message,
          additionalHeaders,
          parsedComment
      );
    }
    const moveMessageStatus = await moveMessageTo(message, settings.report_action);
    if(isSimulation) return new ReportResult(ReportResultStatus.SIMULATION, moveMessageStatus, settings.report_action);
    return new ReportResult(ReportResultStatus.SUCCESS, moveMessageStatus, settings.report_action);
  } catch(err) {
    const result = new ReportResult(ReportResultStatus.ERROR, MoveMessageStatus.NONE, ReportAction.KEEP);
    result.diagnosis = err.toString();
    return result;
  }
}

/**
 * Reports an E-Mail as spam via its internal identifier.
 * Requires a configured SMTP or HTTPSMTP transport, reporting via HTTP is currently not supported.
 */
export async function reportSpam(messageID) {
  let message,
      settings,
      transport,
      additionalHeaders;
  try {
    message = await parseMessage(messageID);
    settings = await getSettings();
    transport = settings.phishing_transport;
    additionalHeaders = await generateTelemetryHeaders(settings);

    if(belongsToSimulation(message, settings.lucy_server)) {
      const result = await reportFraud(messageID, "");
      // Users expect reported spam mails to be moved away even if ReportAction is KEEP
      if (settings.report_action === ReportAction.KEEP) {
        result.moveMessageStatus = await moveMessageTo(message, ReportAction.JUNK);
        result.moveMessageTarget = ReportAction.JUNK;
      }
      return result;
    }
    if(transport === Transport.HTTP) {
      const result = new ReportResult(ReportResultStatus.ERROR, MoveMessageStatus.NONE, ReportAction.KEEP);
      result.diagnosis = "HTTP endpoint does not support spam reports";
      return result;
    }
    let subject = "Spam Report";
    if(settings.smtp_use_expressive_subject) subject += `: ${message.subject}`;
    await sendSMTPReport(
        settings.smtp_to,
        subject,
        settings.lucy_client_id,
        message,
        additionalHeaders,
        null
    );
    const moveMessageStatus = await moveMessageTo(message, ReportAction.JUNK);
    return new ReportResult(ReportResultStatus.SUCCESS, moveMessageStatus, ReportAction.JUNK);
  } catch(err) {
    const result = new ReportResult(ReportResultStatus.ERROR, MoveMessageStatus.NONE, ReportAction.KEEP);
    result.diagnosis = err.toString();
    return result;
  }
}

/**
 * Performs various checks to figure out whether the currently selected message can be reported.
 * Returns ReportabilityIssue.NONE on success or one of the other error codes in case of issues.
 *
 * These issues are checked:
 * - Whether the plugin has (optional) permission to send messages in case one of the transports
 *   is configured as SMTP.
 * - Whether the message has an associated identity. "External" messages opened from a file lack
 *   that property.
 * - Whether a report for the given message ID is permitted by retrieving the associated account's
 *   identities and validating it against the given list of permitted domains
 */
export async function checkMessageReportability(messageID, permittedDomains) {
  const message = await browser.messages.get(messageID),
        identity = await getIdentity(message),
        settings = await getSettings(),
	permissions = (await browser.permissions.getAll()).permissions;
  // Check granted permissions
  if((settings.phishing_transport !== Transport.HTTP || settings.simulation_transport !== Transport.HTTP) && !permissions.includes("messages.send"))
    return ReportabilityIssue.PERMISSIONS;
  // Pseudo accounts such as "Local Folders" and "external" messages don't have associated identities
  if(identity === null) return ReportabilityIssue.TYPE;
  // If no permitted domains are configured, reporting is always permitted
  if(permittedDomains.length === 0) return ReportabilityIssue.NONE;
  // Attempt to find a permitted identity to report the message
  const account = await browser.accounts.get(identity.accountId);
  for(let domain of permittedDomains) {
    let domainRegex = new RegExp(domain);
    for(let identity of account.identities) {
      if(domainRegex.test(identity.email.split("@")[1])) return ReportabilityIssue.NONE;
    }
  }
  return ReportabilityIssue.FORBIDDEN;
}
