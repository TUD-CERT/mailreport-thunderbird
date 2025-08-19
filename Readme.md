# E-Mail Reporting Plugin for Mozilla Thunderbird
Mozilla Thunderbird plugin for reporting phishing or otherwise malicious E-Mails to an IT security department, developed by [TUD-CERT](https://tu-dresden.de/tu-dresden/organisation/zentrale-universitaetsverwaltung/dezernat-3-zentrale-angelegenheiten/sg-3-5-informationssicherheit/tud-cert) in cooperation with the [Designated Office: Information Security](https://www.tu-braunschweig.de/en/ciso) of TU Braunschweig. This plugin is meant to be customized and deployed within well-defined organizational boundaries, such as for all employees covered by a CERT or members of a university.

## Features
![Plugin screenshot](doc/plugin.png?raw=true "The plugin in action")
* Support for reports via SMTP (summary mail with reported raw sample attached) or HTTP(S) to a [Lucy](https://lucysecurity.com)-compatible API (or both)
* Optional comment from the reporting user
* Action after report (move to junk/move to bin/keep mail)
* Localization in English and German
* Automatic update notifications
* Per-organization deployment configurations
* Basic telemetry to report current plugin and MUA versions with each request
* Permission settings to disable unwanted features
* [Lucy](https://lucysecurity.com) phishing campaign detection

## Requirements
The plugin has been tested with Thunderbird 91 and 140 on Linux and Windows.

The project build script `make.py` requires at least Python 3.8.

## How to Build
This project uses a custom build script called `make.py` to assemble the plugin either for development or deployment purposes (see `./make.py -h` for usage). That script exists beacuse each organization using this plugin has specific requirements, such as a certain default configuration including the organization's spam reporting e-mail address, custom strings and messages shown within the plugins interface or custom icons. We call these organization-specific adjustments *deployment configurations* and place them inside the `configs/` directory. In there, each subfolder holds all modifications to the default configuration (which can be found in `templates/`) for a specific organization. 

When building the project, the name of the desired organization's folder denotes the deployment configuration to use. For example, to assemble the plugin with the deployment configuration of TU Dresden:

``` 
$ ./make.py build example.com
Writing defaults.json
Writing manifest.json
Writing _locales/de/messages.json
Writing _locales/en/messages.json
Creating images/
```

This command builds the project by parsing the default configuration in `templates/` and the deployment configuration in `configs/example.com/` to produce the final plugin artifacts `defaults.json`, `manifest.json`, `_locales/` and `images/`. The plugin can then be loaded for testing purposes from within Thunderbird as a *temporary add-on*.

To also generate an xpi file that can be installed as a regular plugin from within Thunderbird, supply the `-d` option:

``` 
$ ./make.py build -d example.com
...
Plugin archive written to dist/mailreport@example.com.xpi
```

To revert to a clean state and remove all artifacts generated during builds, invoke `./make.py clean`.

## Deployment Configurations
![Plugin settings screenshot](doc/settings.png?raw=true "Plugin settings")

Each organization's configuration directory requires at least a file named `overrides.json`. The JSON object in that file describes how the default configuration in `templates/` should be overwritten with organization-specific values. An empty JSON object `{}` is a minimal valid configuration that would build the plugin from the template's default values without any changes. For reference, this repository includes a small example deployment configuration in `configs/example.com/` as a starting point for creating individual configurations.

To modify the plugin's manifest file, which holds metadata such as the plugin's identifier, name and version, consult the template manifest in `templates/manifest.tpl`, then add the key `manifest` to the JSON object in `overrides.json` and specify all values that should be overwritten with own values (all others will be taken from `manifest.tpl`). A minimal example:

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

The plugin's default configuration is kept in `templates/defaults.tpl` and can be overwritten in `overrides.json` within the top-level key `defaults`. Most of these settings can be adjusted in the plugin configuration dialog from within Thunderbird. The following keys are essential for proper operation and should be reviewed thoroughly:

* **phishing_transport**: Defines which protocol(s) to use when reporting mails.
  * `"http"`: Send reports via HTTP(S) to a Lucy-compatible endpoint.
  * `"smtp"`: Send reports as regular E-Mail with a summary of the reported E-Mail in the mail's body and the raw mail as attached EML file.
  * `"http+smtp"`: Send reports via HTTP(S) and SMTP simultaneously.
* **simulation_transport**: Protocol(s) to use when an E-Mail that belongs to a Lucy campaign is reported. Supports the same values as `phishing_transport`.
* **lucy_server**: Domain name of the Lucy endpoint to send HTTP(s) reports to. Only required if HTTP(S) is set as phishing or simulation transport.
* **lucy_client_id**: The Lucy Client ID to send to the Lucy server with each report. Can be `null` to indicate *"all"* clients. Incidents on the Lucy server will then be shown as coming from client `N/A`.
* **smtp_to**: E-Mail address to send SMTP reports to. Only required if SMTP is set as phishing or simulation transport.

The remaining supported keys in `defaults` are
* **report_action**: How to deal with an E-Mail after it has been reported.
  * `"junk"`: Move it to the junk folder.
  * `"trash"`: Move it to the trash folder.
  * `"keep"`: Do nothing, keep it.
* **smtp_use_expressive_subject**: Determines which subject line to use when sending SMTP reports. If set to `false`, reports will simply use *Phishing Report* as subject line. With this set to `true`, the subject line of the reported E-Mail will be appended as well (e.g. *Phishing Report: Re: Urgent Letter*).
* **send_telemetry**: If set to `true`, this includes two header fields `Reporting-Agent` and `Reporting-Plugin` set to the current MUA and plugin names and versions to all outgoing requests: Either as HTTP(S) header or within the SMTP body. To disable, set to `false`. This setting can *not* be changed from within Thunderbird.
* **permit_updates**: If set to `true`, update notifications are enabled. Further details on how these are implemented are documented down below. To disable update checks and notifications entirely, set this to `false`. This setting can *not* be changed from within Thunderbird.
* **update_check**: When to automatically check for updates.
  * `"startup"`: On each start of Thunderbird. If an error is encountered upon contacting the update server, the user won't be notified. Notifications are only shown when a new version is available.
  * `"never"`: Disables automatic update checks. Users can still check for updates manually from within the plugin's settings.
* **update_url**: The URL to contact for update checks. Further details on how this works are documented down below.
* **permit_advanced_config**: If set to `true`, users can modify `phishing_transport`, `simulation_transport`, `lucy_client_id`, `lucy_server`, `smtp_to`, `smtp_use_expressive_subject` and `update_url` from within Thunderbird (via *"show advanced settings"* in the plugin's configuration). Set to `false` so that user can only change `update_check` and `report_action`. This setting can *not* be changed from within Thunderbird. **Notice**: This setting determines which options are stored locally within the MUA. If however this is set to `false`, future updates can transparently update the advanced settings (e.g. by switching to another SMTP reporting address). If this is set to `true`, all advanced settings are handled manually by users. Modifying the SMTP reporting address would then require either a full re-installation cycle of the plugin (to clear the Local Stroage) or user's to manually update these settings.
* **use_toolbar_button**: Placement of the reporting button. If set to `false` (the default), the button will be added to the toolbar of each message window (next to *"Reply*", *"Forward"* etc). If set to `true`, it will be added to Thunderbird's main toolbar instead.
* **permitted_domains**: A list of regular expressions (as strings) matching domains of e-mail addresses from which reports are permitted. For example, *Example Org* may set this to `[".*example\\.org"]` to permit reports from example.org and all of its subdomains. Attempting to report e-mails from any other account will result in a popup like in the following screenshot. The message text is adjustable via `messages.json`. If `permitted_domains` is empty (`[]`, the default), this functionality is disabled and reports can be sent from any account.

  ![Reporting forbidden popup screenshot](doc/forbidden_message.png?raw=true "Reporting forbidden popup")

Organizations can also overwrite individual localization strings from `templates/locales/` with the top-level key `locales`. For example:

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

Finally, deployment configurations can provide individual plugin icons. By default, `templates/manifest.tpl` defines the plugin's icons as follows:

```
"icons": {
  "64": "images/app_64.png",
  "32": "images/app_32.png",
  "16": "images/app_16.png"
}
```

The icon used for the "report button" itself is specified as `"default_icon" : "images/app_16.png"`. To use custom icons, create a subfolder `images/` within your deployment configuration and put icons in there as `app_64.png`, `app_32.png` and `app_16.png`.

## Update Notifications
![Plugin update notification screenshot](doc/update.png?raw=true "Update notification")

This plugin has a built-in mechanism to detect whether an updated version is available without relying on the official Mozilla Add-On repository. To figure out if a newer revision was published, the plugin will send a HTTP(S) GET request to the URL set in `update_url`. If that server responds with a valid JSON document (see below) and the version mentioned there is newer than the currently running one, an update notification window will notify the user. That dialog also includes a (custom) URL received from the update server which can be visited for further information about the update.

The received update JSON document should have the following structure:
```
{"version": "1.3", "url": "https://example.com/about-our-thunderbird-plugin"}
```

**Notice**: This is just a notification mechanism to inform users about an updated version in case this plugin isn't distributed via the official Mozilla Add-On repository. Users still have to download and install the new plugin manually - the URL returned from the update server is just meant to instruct them on how to perform the update.

## Known Issues
* **Encrypted E-Mails**: The MailExtensions API this plugin is built upon currently doesn't support reading decrypted contents of encrypted mails. Therefore, encrypted mails reported with this plugin will contain no preview and have the encrypted mail attached as-is (in raw encrypted form). For a discussion on this, see [here](https://thunderbird.topicbox.com/groups/addons/Tf9725ba63ee6871f/tb-add-on-developers-re-web-ext-how-to-decrypt-a-application-pkcs7-mime-part).
* **Permissions**: Even though this plugin clearly defines required permissions in `templates/manifest.tpl`, Thunderbird still reports it as having *"full, unrestricted access to Thunderbird, and your computer"*. The reason for that is the dependence on *"Experiment APIs"* (esentially legacy Thunderbird plugin APIs) to send SMTP reports without additional user involvement. Mozilla describes the underlying issue [here](https://support.mozilla.org/en-US/kb/permission-request-messages-thunderbird-extensions#w_have-full-unrestricted-access-to-thunderbird-and-your-computer).
