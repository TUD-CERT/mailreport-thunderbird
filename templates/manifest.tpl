{
  "manifest_version": 2,
  "name": "Phishing Report Button",
  "description": "__MSG_extensionDescription__",
  "version": "0",
  "author": "Leonard Zurek, Pascal Brückner",
  "applications": {
    "gecko": {
      "id": "phishreport@example.com",
      "strict_min_version": "91.0",
      "strict_max_version": "128.*"
    }
  },
  "default_locale": "en",
  "icons": {
    "64": "images/app_64.png",
    "32": "images/app_32.png",
    "16": "images/app_16.png"
  },
  "background": {
    "page": "background.html"
  },
  "options_ui": {
    "page": "options/options.html",
    "browser_style": true
  },
  "action": {
    "default_label": "__MSG_reportButtonLabel__",
    "default_title": "__MSG_reportButtonHelp__",
    "default_popup": "report/report.html",
    "default_icon" : "images/app_16.png"
  },
  "permissions": ["storage", "tabs", "messagesRead", "messagesMove", "accountsRead", "<all_urls>"],
  "experiment_apis": {
    "reportSpam": {
      "schema": "schema.json",
      "parent": {
        "scopes": [
          "addon_parent"
        ],
        "paths": [
          [
            "reportSpam"
          ]
        ],
        "script": "implementation.js"
      }
    }
  }
}
