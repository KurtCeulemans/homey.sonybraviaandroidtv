# Sony BRAVIA Android TV

This app adds support for Sony BRAVIA Android TV devices in Homey.

## Version 3.0.0 — re-pairing required

This is a breaking update. Automatic SSDP discovery has been removed. The app talks only to the IP address you configure.

**Existing TVs from version 2.x must be removed and added again.** After that, change the IP in device settings if the TV moves; no second pairing is needed for an IP change.

During pairing, enter:

- TV IP address or hostname
- Pre-shared key
- HTTPS if the TV requires it
- MAC address only if the TV does not report it (used for Wake-on-LAN)

Enable **Remote start** / network standby on the TV so Homey can turn it on with the Sony REST API. Wake-on-LAN is a unicast fallback to the stored TV IP, not a LAN broadcast.

## Flows

Use the in-app flow cards for power, volume, input, apps, IRCC, picture mode and screen off.

## Supported languages

- English
- Dutch (Nederlands)
- German
