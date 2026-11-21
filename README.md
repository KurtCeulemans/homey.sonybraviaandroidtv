# Sony BRAVIA Android TV for Homey

Homey app (`name.ricardoismy.sonybraviaandroidtv`) that controls Sony BRAVIA Android TVs over the local network.

The app talks **only** to the IP address stored in device settings, using unicast HTTP or HTTPS. There is no SSDP or other runtime discovery.

| | |
|---|---|
| Version | 3.0.0 |
| Homey | SDK 3, compatibility `>= 8.1.0` |
| Languages | English, Dutch, German |
| Branch | `fix/cross-vlan` |

## Version 3.0.0 — re-pairing required

This is a breaking update. Automatic SSDP discovery has been removed.

**Existing TVs from version 2.x must be removed and added again.** After that, change the IP in device settings if the TV moves; no second pairing is needed for an IP change.

During pairing, enter:

- TV IP address or hostname
- Pre-shared key
- HTTPS if the TV requires it
- MAC address only if the TV does not report it (used for Wake-on-LAN)

Enable **Remote start** / network standby on the TV so Homey can turn it on with the Sony REST API. Wake-on-LAN is a unicast fallback to the stored TV IP, not a LAN broadcast.

## What the app does

- Power on/off, volume, mute, channel up/down
- Input, playing content, audio output, screen off
- Flow cards for IRCC, apps, TV channels, picture mode, Wake-on-LAN
- Polling of TV state, with an optional slower interval when the TV is off
- Cross-VLAN use when Homey can route to the TV IP (no requirement that Homey and the TV share a broadcast domain)

## Documentation

| File | Contents |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Runtime design, HTTP layer, polling, power-on, identity |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local setup, Homey CLI, validation, install |
| [SECURITY.md](SECURITY.md) | PSK, TLS, WoL, threat notes |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
| [AGENTS.md](AGENTS.md) | Rules for coding agents working in this repo |

## TV setup

On the TV, under network / IP control:

1. **Remote start**: enabled (needed to turn the TV on from Homey)
2. **Authentication**: Normal and Pre-Shared Key
3. **Pre-shared key**: set a key and enter the same value in Homey

The TV must be reachable from Homey at the configured IP on port **80** (HTTP) or **443** (HTTPS).

## License and origin

Original Homey app by Ricardo Snoek. Later maintenance by Ronny Winkler. This tree is the 3.0.0 unicast / cross-VLAN hardening of that app.
