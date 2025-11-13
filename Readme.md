# E-Mail Reporting Plugin for Mozilla Thunderbird
Mozilla Thunderbird plugin for reporting phishing or otherwise malicious E-Mails to an IT security department, originally developed by [TUD-CERT](https://tud.de/cert) in cooperation with the [Designated Office: Information Security](https://www.tu-braunschweig.de/en/ciso) of TU Braunschweig. This plugin is meant to be customized and deployed within well-defined organizational boundaries, such as for all employees covered by a CERT or members of a university.

## Features
![Plugin screenshot](docs/plugin.png?raw=true "The plugin in action")
* Support for reports via SMTP (summary mail with reported raw sample attached) or HTTP(S) to a [Lucy](https://lucysecurity.com)-compatible API (or both)
* User-provided optional comment for each report
* Configurable after-report action: move to junk/move to bin/keep mail
* Localization in English and German
* Respects selected UI theme
* Automatic update notifications
* Quickly adjustable organization-specific deployment settings
* Basic telemetry to report current plugin and MUA versions with each request
* Permission settings to disable unwanted features
* [Lucy](https://lucysecurity.com) phishing campaign detection

## Requirements
The plugin is compatible with Thunderbird 115 up to 140 on Linux, Windows and macOS.

The project build script `make.py` requires at least Python 3.8.

## Technical Overview
This plugin adds an e-mail report button to either the main Thunderbird toolbar (near the top of the window) or to each individual message window, right next to the *"Reply"* and *"Forward"* buttons. When clicked, the currently selected e-mail can be reported either as being malicious or spam. Please note that spam reporting is strictly optional and can be disabled when building the plugin. Reporting a malicious e-mail opens a popup that enables users to attach an (optional) comment to their report. In contrast, reporting e-mails as spam happens immediately and can't be commented. In both cases, a popup informs users of the current status: Whether the report is still in progress, was successful or ended up in an error.

Reports can be sent either via e-mail/SMTP to a configurable reporting address or to a server that provides a [Lucy](https://lucysecurity.com)-compatible API (or both). The subjects of reports sent via SMTP use either `Phishing Report` or `Spam Report` as prefix to differentiate between the reporting options. Attached comments and basic telemetry (if enabled) are prepended to the e-mail body, while a raw sample of the reported e-mail is added as an attachment. The Lucy API doesn't support spam reports.

If a Lucy-style phishing campaign is detected - which is based on certain header fields present in the reported e-mail - the Lucy server is notified of the report via HTTP(S) and a dialog is shown to congratulate the reporter.

## How to build
Each organization using this reporting plugin has a specific set of requirements, such as the organization's spam reporting e-mail address, custom strings and messages shown within the plugins interface or custom icons. We call these organization-specific settings *deployment configurations* and place them inside the `configs/` directory. In there, each subfolder holds all modifications to the default configuration (which can be found in `templates/`) for a specific organization. 

This project uses a custom build script called `make.py` to assemble the plugin either for development or deployment purposes (see `./make.py -h` for usage). When building the plugin, the name of the desired organization's folder denotes the deployment configuration to use. For example, to assemble the plugin with the deployment configuration of TU Dresden, which sits in `configs/tu-dresden.de`:

``` 
$ ./make.py build tu-dresden.de
Build path: build
Writing build/defaults.json
Writing build/manifest.json
...
```

This command builds the project for testing by parsing the default configuration in `templates/` and the deployment configuration in `configs/tu-dresden.de/` to produce plugin artifacts such as `defaults.json`, `manifest.json`, `_locales/` and `images/`. The finished build result is written to `build/`. The plugin can then be loaded for testing purposes by loading the generated `build/manifest.json` from within Thunderbird as a *Temporary Add-on*, which is accessible from the *Debug Add-ons* screen.

For easier development, `make.py` also has a `dev` target that builds the project once in `build/` (similar to `make.py build`), but also automatically picks up changes made to the sources during runtime. However, that feature requires the [watchdog](https://pypi.org/project/watchdog/) module for Python 3, which may be installed either globally or in a Python virtual environment:

```
$ python3 -m venv venv
$ source venv/bin/activate
(venv) $ pip3 install watchdog
...
Successfully installed watchdog-x.y.z
(venv) $ ./make.py dev tu-dresden.de
```

To build the plugin for production, which results in an `xpi` file that can be installed as a regular plugin from within Thunderbird, add the `-d` option to `build`:

``` 
$ ./make.py build -d example.com
...
Plugin archive written to dist/mailreport@example.com-1.0.xpi
```

To revert to a clean state and remove all artifacts generated during builds, invoke `./make.py clean`.

## Deployment Configurations
![Plugin settings screenshot](docs/settings.png?raw=true "Plugin settings")

Each organization's configuration directory requires at least a file named `overrides.json`. The JSON object in that file describes how the default configuration in `templates/` should be overwritten with organization-specific values. An empty JSON object `{}` is a minimal valid configuration that would build the plugin from the template's default values without any changes. For reference, this repository includes a small example deployment configuration in `configs/example.com/` as a starting point for creating individual configurations.

To make changes to the plugin's manifest file, which holds metadata such as the plugin identifier, name and version, consult the template manifest in `templates/manifest.tpl`, then add the key `manifest` to the JSON object in `overrides.json` and specify all values that should be overwritten with own values (all others will be taken from `manifest.tpl`). A minimal example:

```
{
  ...
  "manifest": {
    "name": "My Custom Reporting Plugin",
    "version": "1.0",
    "applications": {
      "gecko": {
        "id": "myplugin@example.com"
      }
    }
  }
  ...
}
```

For a list of supported manifest keys, consult the [official documentation](https://developer.thunderbird.net/add-ons/mailextensions/supported-manifest-keys).

The plugin's default configuration is kept in `templates/defaults.tpl` and can be overwritten in `overrides.json` within the top-level key `defaults`. Most of these settings can also be adjusted by users in the plugin configuration dialog from within Thunderbird. The following keys are essential for proper operation and should be reviewed thoroughly:

* **phishing_transport**: Defines which protocol(s) to use when reporting mails.
  * `"http"`: Send reports via HTTP(S) to a Lucy-compatible API.
  * `"smtp"`: Send reports as regular E-Mail with a summary of the reported E-Mail in the mail's body and the raw mail as attached EML file.
  * `"http+smtp"`: Send reports via HTTP(S) and SMTP simultaneously.
* **simulation_transport**: Protocol(s) to use when an E-Mail that belongs to a Lucy campaign is reported. Supports the same values as `phishing_transport`.
* **lucy_server**: Domain name of the Lucy API to send HTTP(s) reports to. Only required if HTTP(S) is set as phishing or simulation transport.
* **lucy_client_id**: The Lucy Client ID to send to the Lucy API with each report. Can be `null` to indicate *"all"* clients. Incidents on the Lucy server will then be shown as coming from client `N/A`.
* **smtp_to**: E-Mail address to send SMTP reports to. Only required if SMTP is set as phishing or simulation transport.

The remaining supported keys in `defaults` are
* **report_action**: How to deal with an E-Mail after it has been reported.
  * `"junk"`: Move it to the junk folder.
  * `"trash"`: Move it to the trash folder.
  * `"keep"`: Do nothing, keep it.
* **spam_report_enabled**: Whether users are permitted to report e-mails as *spam* in addition to the regular *phishing/fraud* reports. If set to `true`, a click on the reporting button will first show a menu prompting for the reporting type. If this is `false`, a click on the reporting button will show the `phishing/fraud` report popup immediately.
* **smtp_use_expressive_subject**: Determines which subject line to use when sending SMTP reports. If set to `false`, reports will simply use *Phishing Report* or *Spam Report* as subject lines. With this set to `true`, the subject line of the reported e-mail will be appended as well (e.g. *Phishing Report: Re: Urgent Letter*).
* **send_telemetry**: If set to `true`, this includes two header fields `Reporting-Agent` and `Reporting-Plugin` set to the current MUA and plugin identifier/version to all outgoing requests: Either as HTTP(S) header or prepended to the SMTP body. To disable, set to `false`. This setting can *not* be changed from within Thunderbird.
* **permit_updates**: If set to `true`, update notifications are enabled. Further details on how these are implemented are documented down below. To disable update checks and notifications entirely, set this to `false`. This setting can *not* be changed from within Thunderbird.
* **update_check**: When to automatically check for updates.
  * `"startup"`: On each start of Thunderbird. If an error is encountered upon contacting the update server, the user won't be notified. Notifications are only shown when a new version is available.
  * `"never"`: Disables automatic update checks. Users can still check for updates manually from within the plugin's settings.
* **update_url**: The URL to contact for update checks. Further details on how this works are documented down below.
* **permit_advanced_config**: If set to `true`, users can modify `phishing_transport`, `simulation_transport`, `lucy_client_id`, `lucy_server`, `smtp_to`, `smtp_use_expressive_subject` and `update_url` from within Thunderbird (via *"Show advanced settings"* in the plugin's configuration). Set to `false` so that user can only change `update_check` and `report_action`. This setting can *not* be changed from within Thunderbird. **Notice**: This setting determines which options are stored locally within the MUA. If however this is set to `false`, future updates can transparently update the advanced settings (e.g. by switching to another SMTP reporting address). If this is set to `true`, all advanced settings are handled manually by users. Modifying the SMTP reporting address would then require either a full re-installation cycle of the plugin (to clear the local storage) or user's to manually update these settings.
* **use_toolbar_button**: Placement of the reporting button. If set to `false` (the default), the button will be added to the toolbar of each message window (next to *"Reply*", *"Forward"* etc). If set to `true`, it will be added to Thunderbird's main toolbar instead.
* **permitted_domains**: A list of regular expressions (as strings) matching domains of e-mail addresses from which reports are permitted. For example, *Example Org* may set this to `[".*example\\.org"]` to permit reports from example.org and all of its subdomains. Attempting to report e-mails from any other account will result in a popup like in the following screenshot. The message text is adjustable via `messages.json`. If `permitted_domains` is empty (`[]`, the default), this functionality is disabled and reports can be sent from any account.

  ![Reporting forbidden popup screenshot](docs/forbidden_message.png?raw=true "Reporting forbidden popup")

Organizations can also overwrite individual localization strings from `templates/locales/` via the top-level key `locales`. For example:

```
{
  ...
  "locales": {
    "en": {
      "reportButtonLabel": {"message": "Report!"},
      "reportButtonHelp": {"message": "Click here!"}
    },
    "de": {
      "reportButtonLabel": {"message": "Melden!"},
      "reportButtonHelp": {"message": "Hier klicken!"}
    }
  }
  ...
}
```

Finally, deployment configurations can provide custom plugin icons. By default, `templates/manifest.tpl` defines the plugin's icons as follows:

```
"icons": {
  "64": "images/app_64.png",
  "32": "images/app_32.png",
  "16": "images/app_16.png"
}
```

The icon used for the "report button" itself is specified as `"default_icon" : "images/app_16.png"`. To use custom icons, create a subfolder `images/` within your deployment configuration and put icons in there as `app_64.png`, `app_32.png` and `app_16.png`.

## Update Notifications
![Plugin update notification screenshot](docs/update.png?raw=true "Update notification")

This plugin has a built-in mechanism to detect whether an updated version is available without relying on the official Mozilla Add-On repository. To figure out if a newer revision was published, the plugin will send a HTTP(S) GET request to the URL set in `update_url`. If that server responds with a valid JSON document (see below) and the version mentioned there is newer than the currently running one, an update notification window will notify the user. That dialog also includes a (custom) URL received from the update server which can be visited for further information about the update.

The received update JSON document should have the following structure:
```
{"version": "1.3", "url": "https://example.com/about-our-thunderbird-report-plugin"}
```

**Notice**: This is just a notification mechanism to inform users about an updated version in case this plugin isn't distributed via the official Mozilla Add-On repository. Users still have to download and install the new plugin manually - the URL returned from the update server is just meant to instruct them on how to perform the update.

## Known Issues
* **Encrypted E-Mails**: The MailExtensions API this plugin is built upon currently doesn't support reading decrypted contents of encrypted mails. Therefore, encrypted mails reported with this plugin will contain no preview and have the encrypted mail attached as-is (in raw encrypted form). For a discussion on this, see [here](https://thunderbird.topicbox.com/groups/addons/Tf9725ba63ee6871f/tb-add-on-developers-re-web-ext-how-to-decrypt-a-application-pkcs7-mime-part).
* **Permissions**: Even though this plugin clearly defines required permissions in `templates/manifest.tpl`, Thunderbird still reports it as having *"full, unrestricted access to Thunderbird, and your computer"*. The reason for that is the dependence on *"Experiment APIs"* (esentially legacy Thunderbird plugin APIs) to send SMTP reports without additional user involvement. Mozilla describes the underlying issue [here](https://support.mozilla.org/en-US/kb/permission-request-messages-thunderbird-extensions#w_have-full-unrestricted-access-to-thunderbird-and-your-computer).
