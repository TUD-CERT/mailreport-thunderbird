// strict mode should be default
"use strict";

// Redefine models.BodyType. Since this Experiment API is not loaded as a JavaScript module,
// we can't import it here.
const BodyType = {
  PLAIN: "PLAIN",
  HTML: "HTML"
}

try {
    var { ExtensionCommon } = ChromeUtils.importESModule("resource://gre/modules/ExtensionCommon.sys.mjs");
    var { FileUtils } = ChromeUtils.importESModule("resource://gre/modules/FileUtils.sys.mjs");
    var Services = globalThis.Services || ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
    var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
}
catch(err) {
    // fall back to legacy (pre v128) import
    var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
    var { FileUtils } = ChromeUtils.import("resource://gre/modules/FileUtils.jsm");
    var Services = globalThis.Services || ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
    var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
}
XPCOMUtils.defineLazyGlobalGetters(this, ["IOUtils"]);


/**
 * Returns a string representation of the given object as "key1: val1<delimiter>key2: val2<delimiter>...".
 * The result doesn't end with a delimiter. Since TB extensions use an older JSON schema spec and this
 * function is meant to convert schema instances, we additionally ignore NULL values which we may
 * receive from optional properties (newer schema uses "required" instead).
 */
function objToStr(source, delimiter) {
  let result = "";
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
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


/**
 * Helper that converts an ASCII string to an Uint8Array instance
 * due to TextEncoder not being available in the WebExtension plugin context.
 */
function asciiToUint8Array(str) {
    const result = [];
    for (let i = 0; i < str.length; i++) {
        result.push(str.charCodeAt(i));
    }
    return new Uint8Array(result);
}

var mailReport = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      mailReport: {
        sendSMTPReport: async function(accountID, destination, subject, lucyClientID, message, additionalHeaders, comment) {
          const compFields = Components.classes["@mozilla.org/messengercompose/composefields;1"].createInstance(Components.interfaces.nsIMsgCompFields),
                accountManager = Components.classes["@mozilla.org/messenger/account-manager;1"].getService(Components.interfaces.nsIMsgAccountManager),
                amIdentity = accountManager.getIdentity(message.reporter),
                attachments = [message.raw];
          // TODO Set FROM as "identity.name <identity.email>", e.g. by using amIdentity.fullAddress
          compFields.from = amIdentity.email;
          compFields.to = destination;
          compFields.subject = subject;
          compFields.forceMsgEncoding = true;  // Content-Transfer-Encoding: quoted-printable
          if(message.previewType === BodyType.HTML) {
            // HTML message
            let commentBody = comment !== null ? `X-More-Analysis: True<br />${encodeHTML(comment)}<br />` : "",
                lucyClientBody = lucyClientID !== null ? `X-Lucy-Client: ${lucyClientID}<br />` : "",
                lucyCIBody = lucyClientID !== null ? "X-CI-Report: True<br />" : "";
            compFields.body = `${lucyClientBody}${commentBody}${lucyCIBody}${objToStr(additionalHeaders, "<br />")}<br /><br />From: ${encodeHTML(message.from)}<br />Sent: ${encodeHTML(message.date)}<br />To: ${encodeHTML(message.to)}<br />Subject: ${encodeHTML(message.subject)}<br /><br />${message.preview}`;
            compFields.forcePlainText = false;
            compFields.useMultipartAlternative = true;
          } else {
            // Plain message
            let commentBody = comment !== null ? `X-More-Analysis: True\n${comment}\n` : "",
                lucyClientBody = lucyClientID !== null ? `X-Lucy-Client: ${lucyClientID}\n` : "",
                lucyCIBody = lucyClientID !== null ? "X-CI-Report: True\n" : "";
            compFields.body = `${lucyClientBody}${commentBody}${lucyCIBody}${objToStr(additionalHeaders, "\n")}\n\n-----Original Message-----\nFrom: ${message.from}\nSent: ${message.date}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.preview}\r\n`;
            compFields.forcePlainText = true;
            compFields.useMultipartAlternative = false;
          }
          // Attachments
          let tmp_files = [],
              tmp_file_path = null;
          for(let a of attachments) {
            let attachment = Components.classes["@mozilla.org/messengercompose/attachment;1"].createInstance(Ci.nsIMsgAttachment);
            // Add attachment by copying it into a temporary file and referencing that for addAttachment()
            // Starting with TB115, OS.* has been replaced with PathUtils.*
            const tmp_file_name = `tb.tmp.${Date.now()}`;
            if(typeof PathUtils !== "undefined") {
              tmp_file_path = PathUtils.join(PathUtils.tempDir, tmp_file_name);
            } else {
              const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
              tmp_file_path = OS.Path.join(OS.Constants.Path.tmpDir, tmp_file_name);
            }
            await IOUtils.write(tmp_file_path, asciiToUint8Array(a));
            // Starting with TB116, FileUtils.getFile() has been replaced with FileUtils.File()
            const file = FileUtils.hasOwnProperty("getFile") ? FileUtils.getFile("TmpD", [tmp_file_name]) : FileUtils.File(tmp_file_path) ;
            tmp_files.push(file);
            // Starting with TB92, getURLSpecFromFile() has been replaced with getURLSpecFromActualFile()
            let fileProtocolHandler = Services.io.getProtocolHandler("file").QueryInterface(Ci.nsIFileProtocolHandler),
                getURLSpecFromFileFunc = fileProtocolHandler.hasOwnProperty("getURLSpecFromActualFile") ? "getURLSpecFromActualFile" : "getURLSpecFromFile";
            attachment.url = fileProtocolHandler[getURLSpecFromFileFunc](file);
            attachment.name = "Forwarded message.eml";
            attachment.size = file.fileSize;
            attachment.contentType = "application/octet-stream";
            attachment.temporary = true;
            compFields.addAttachment(attachment);
          }
          // Assemble compose object structure
          let composeParams = Components.classes["@mozilla.org/messengercompose/composeparams;1"].createInstance(Components.interfaces.nsIMsgComposeParams);
          composeParams.type = Ci.nsIMsgCompType.New;
          composeParams.format = message.previewType === BodyType.HTML ? Ci.nsIMsgCompFormat.HTML : Ci.nsIMsgCompFormat.PlainText;  // Determines whether compFields.body should be interpreted as plain text or HTML
          composeParams.identity = amIdentity;
          composeParams.composeFields = compFields;
          let compose = Components.classes["@mozilla.org/messengercompose/compose;1"].createInstance(Components.interfaces.nsIMsgCompose);
          compose.initialize(composeParams);
          // Progress listener
          let progress = Components.classes["@mozilla.org/messenger/progress;1"].createInstance(Components.interfaces.nsIMsgProgress);
          // Send asynchronously
          try {
            console.log("Reporting selected mail via SMTP as ", amIdentity.email, " to ", destination);
            await new Promise((resolve, reject) => {
              progress.registerListener({
                onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
                  if(aStateFlags === 0x10) {  // STATE_STOP
                    aStatus === 0 ? resolve() : reject();
                  }
                }
              });
              compose.sendMsg(Ci.nsIMsgCompDeliverMode.Now, amIdentity, accountID, null, progress);
            });
          } catch(err) {
            console.log("Could not send report via SMTP", err);
            throw err;
          } finally {
            // Clean up tmp files (workaround required for TB91 even though attachment.temporary is true)
            for(let f of tmp_files) if(f.exists()) f.remove(false);
          }
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