// strict mode should be default
'use strict';
var { ExtensionCommon } = ChromeUtils.import('resource://gre/modules/ExtensionCommon.jsm');
var { FileUtils } = ChromeUtils.import('resource://gre/modules/FileUtils.jsm');
var { NetUtil } = ChromeUtils.import('resource://gre/modules/NetUtil.jsm');
var { Services } = ChromeUtils.import('resource://gre/modules/Services.jsm');


/**
 * Turns NetUtil.asyncCopy() into a Promise.
 */
async function asyncCopyWrapper(source, destination) {
  return await new Promise((resolve, reject) => {
    NetUtil.asyncCopy(source, destination, () => {
      resolve();
    });
  });
}


/**
 * Returns a string representation of the given object as "key1: val1<delimiter>key2: val2<delimiter>...".
 * The result doesn't end with a delimiter. Since TB extensions use an older JSON schema spec and this
 * function is meant to convert schema instances, we additionally ignore NULL values which we may
 * receive from optional properties (newer schema uses 'required' instead).
 */
function objToStr(source, delimiter) {
  let result = '';
  for(let key in source) {
    if(source[key] !== null) result += `${key}: ${source[key]}${delimiter}`;
  }
  return result;
}


/**
 * Encodes various characters to their safe HTML counterparts. Used to prevent HTML interpretation of
 * E-Mail headers such as "Name <name@example.com>".
 */
function encodeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


var reportSpam = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      reportSpam: {
        sendSMTPReport: async function(identity, destination, source, subject, lucyClientID, message, attachments, additionalHeaders, comment) {
          let compFields = Components.classes['@mozilla.org/messengercompose/composefields;1'].createInstance(Components.interfaces.nsIMsgCompFields),
              accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager),
              amIdentity = accountManager.getIdentity(identity.id),
              success = false;
          // TODO Set FROM as "identity.name <identity.email>"
          compFields.from = source;
          compFields.to = destination;
          compFields.subject = subject;
          compFields.forceMsgEncoding = true;  // Content-Transfer-Encoding: quoted-printable
          if(message.isHTML) {
            // HTML message
            let commentBody = comment.length > 0 ? `X-More-Analysis: True<br />${encodeHTML(comment)}<br />` : '',
                lucyClientBody = lucyClientID !== null ? `X-Lucy-Client: ${lucyClientID}<br />` : '',
                lucyCIBody = lucyClientID !== null ? 'X-CI-Report: True<br />' : '';
            compFields.body = `${lucyClientBody}${commentBody}${lucyCIBody}${objToStr(additionalHeaders, '<br />')}<br /><br />From: ${encodeHTML(message.from)}<br />Sent: ${encodeHTML(message.date)}<br />To: ${encodeHTML(message.to)}<br />Subject: ${encodeHTML(message.subject)}<br /><br />${message.preview}`;
            compFields.forcePlainText = false;
            compFields.useMultipartAlternative = true;
          } else {
            // Plain message
            let commentBody = comment.length > 0 ? `X-More-Analysis: True\n${comment}\n` : '',
                lucyClientBody = lucyClientID !== null ? `X-Lucy-Client: ${lucyClientID}\n` : '',
                lucyCIBody = lucyClientID !== null ? 'X-CI-Report: True\n' : '';
            compFields.body = `${lucyClientBody}${commentBody}${lucyCIBody}${objToStr(additionalHeaders, '\n')}\n\n-----Original Message-----\nFrom: ${message.from}\nSent: ${message.date}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.preview}\r\n`;
            compFields.forcePlainText = true;
            compFields.useMultipartAlternative = false;
          }
          // Attachments
          let tmp_files = []
          for(let a of attachments) {
            let attachment = Components.classes['@mozilla.org/messengercompose/attachment;1'].createInstance(Ci.nsIMsgAttachment),
                converter = Components.classes['@mozilla.org/intl/scriptableunicodeconverter'].createInstance(Ci.nsIScriptableUnicodeConverter);
            // Add attachment by copying it into a temporary file and referencing that for addAttachment()
            let file = FileUtils.getFile('TmpD', [`tb.tmp.${Date.now()}`]);
            tmp_files.push(file);
            file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, FileUtils.PERMS_FILE);
            let outStream = FileUtils.openSafeFileOutputStream(file);
            converter.charset = 'UTF-8';
            let inStream = converter.convertToInputStream(a);
            await asyncCopyWrapper(inStream, outStream);
            attachment.url = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler).getURLSpecFromFile(file);
            attachment.name = 'Forwarded message.eml';
            attachment.size = file.fileSize;
            attachment.contentType = 'application/octet-stream';
            attachment.temporary = true;
            compFields.addAttachment(attachment);
          }
          // Assemble compose object structure
          let composeParams = Components.classes['@mozilla.org/messengercompose/composeparams;1'].createInstance(Components.interfaces.nsIMsgComposeParams);
          composeParams.type = Ci.nsIMsgCompType.New;
          composeParams.format = message.isHTML ? Ci.nsIMsgCompFormat.HTML : Ci.nsIMsgCompFormat.PlainText;  // Determines whether compFields.body should be interpreted as plain text or HTML
          composeParams.identity = amIdentity;
          composeParams.composeFields = compFields;
          let compose = Components.classes['@mozilla.org/messengercompose/compose;1'].createInstance(Components.interfaces.nsIMsgCompose);
          compose.initialize(composeParams);
          // Progress listener
          let progress = Components.classes['@mozilla.org/messenger/progress;1'].createInstance(Components.interfaces.nsIMsgProgress);
          // Send asynchronously
          try {
            console.log('Reporting selected mail via SMTP as ', source, ' to ', destination);
            await new Promise((resolve, reject) => {
              progress.registerListener({
                onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
                  if(aStateFlags === 0x10) {  // STATE_STOP
                    aStatus === 0 ? resolve() : reject();
                  }
                }
              });
              // In TB86 and newer, this function was renamed from SendMsg to sendMsg
              let sendFunc = compose.hasOwnProperty('SendMsg') ? 'SendMsg' : 'sendMsg';
              compose[sendFunc](Ci.nsIMsgCompDeliverMode.Now, amIdentity, identity.accountId, null, progress);
            });
            success = true;
          } catch(err) {
            console.log('Could not send report via SMTP');
          }
          // Clean up tmp files (workaround required for TB78 even though attachment.temporary is true)
          for(let f of tmp_files) if(f.exists()) f.remove(false);
          return success;
        }
      }
    }
  }
  onShutdown(isAppShutdown) {
    // This function is called if the extension is disabled or removed, or Thunderbird closes.
    // We usually do not have to do any cleanup, if Thunderbird is shutting down entirely
    if (isAppShutdown) {
      return;
    }
    console.log("Goodbye world!");

    // Thunderbird might still cache some of your JavaScript files and even if JSMs have been unloaded,
    // the last used version could be reused on next load, ignoring any changes. Get around this issue
    // by invalidating the caches (this is identical to restarting TB with the -purgecaches parameter):
    Services.obs.notifyObservers(null, "startupcache-invalidate", null);    
  }
};
