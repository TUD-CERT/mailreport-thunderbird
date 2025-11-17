// Note: There is a copy of this in legacy.js, keep both in sync when applying changes!
export const BodyType = {
  PLAIN: "PLAIN",
  HTML: "HTML"
}

export const ReportAction = {
  JUNK: "junk",
  TRASH: "trash",
  KEEP: "keep"
}

export const ReportDialogView = {
  QUERY: ".query",
  PENDING: ".pending",
  SUCCESS: ".success",
  ERROR: ".error",
  FORBIDDEN: ".forbidden",
  UNREPORTABLE: ".unreportable"
}

export const ReportDialogAction = {
  SHOW_VIEW: "showView",
  SHOW_MOVE_MSG_FAILED_NOTIFICATION: "showMoveMessageFailedNotification"
}

export const ReportabilityIssue = {
  NONE: null,
  FORBIDDEN: "FORBIDDEN",  // Message can't be reported due to permission issues
  TYPE: "TYPE"             // Message can't be reported due to its type (e.g. "external" messages)
}

export const ReportResultStatus = {
  SUCCESS: "SUCCESS",
  SIMULATION: "SIMULATION",
  ERROR: "ERROR"
}

export const MoveMessageStatus = {
  NONE: null,                               // No attempt to move the message has been made
  SUCCESS: "SUCCESS",                       // Message has been moved successfully
  NONEXISTENT_FOLDER: "NONEXISTENT_FOLDER"  // The target folder doesn't exist
}

export const Transport = {
  HTTP: "http",
  SMTP: "smtp",
  HTTPSMTP: "http+smtp"
}

export const UpdateCheck = {
  STARTUP: "startup",
  NEVER: "never"
}

export class Settings {
  lucy_client_id;
  lucy_server;
  permit_advanced_config;
  permit_updates;
  permitted_domains;
  phishing_transport;
  report_action;
  send_telemetry;
  simulation_transport;
  smtp_to;
  smtp_use_expressive_subject;
  spam_report_enabled;
  update_check;
  update_url;
  use_toolbar_button;

  equals(settings) {
    return Object.entries(this).map(([k, v]) => {
      return settings.hasOwnProperty(k) && (settings[k] === v || settings[k] === undefined);
    }).every(Boolean);
  }
}

export class Message {
  id;           // Thunderbird MessageID of the reported message
  from;         // Sender of this message according to its own headers
  to;           // Receivers of this message according to its own headers
  reporter;     // The identity (MailIdentity.id) that reported the message
  date;         // Date and time of the reported message
  subject;      // Parsed subject of the reported message
  headers;      // Header section of the reported message
  preview;      // Preview of the reported message, typically just HTML or PLAIN body content
  previewType;  // Specifies whether the preview is in HTML or PLAIN format
  raw;          // Raw bytes of the reported message
}

export class ReportResult {
  reportStatus;
  moveMessageStatus;
  moveMessageTarget;  // Target folder of the message move operation
  diagnosis;

  constructor(reportStatus, moveMessageStatus, moveMessageTarget) {
    this.reportStatus = reportStatus;
    this.moveMessageStatus = moveMessageStatus;
    this.moveMessageTarget = moveMessageTarget;
  }
}