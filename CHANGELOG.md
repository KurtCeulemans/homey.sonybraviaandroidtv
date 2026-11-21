# Changelog

Homey store copy also lives in `.homeychangelog.json`. Keep both in sync when the version changes.

Format: newest first. `Added` / `Changed` / `Fixed` / `Removed` where it helps.

## 3.0.0

Breaking release. Existing 2.x devices must be removed and paired again.

### Removed

- SSDP / automatic discovery (`simple-ssdp`, finder module, `not_found` / `scan_log` / `preshared_key` pair views)

### Added

- Manual pairing: IP or hostname, PSK, optional HTTPS, optional MAC
- Central HTTP layer: 5s hard timeout + `req.destroy()`, classified errors
- Retry for interactive calls on HTTP 404/503 and connection failures: 1s delay, 20s window
- Device identity `cid:` → `serial:` → `mac:` (never empty); IP stays in settings
- Unicast Wake-on-LAN to `{ip}:9`
- Poll mutex and skip of extra queries when the TV is not `active`
- Locales for the new pairing errors (en / nl / de)

### Changed

- Runtime uses only the stored unicast IP (cross-VLAN when routed)
- Power-on: REST `setPowerStatus` (404/503 retry only) → one IRCC PowerOn → unicast WoL → verify, one ~20s window
- `getProtocol` / HTTPS flag via `getSettings()`
- Autocomplete lists sorted by name

### Fixed

- Typo in sound-settings helper name
- `this.this.getName()`
- Screen-off condition
- Content-Type charset handling

IRCC, relative volume (`+1`/`-1`) and polling do **not** retry.

## 2.2.3

Pair adaptation for newer TVs.

## 2.2.2

Pair adaptation for newer TVs.

## 2.2.1

Fix for pair view.

## 2.2.0

Optional HTTPS connection to the TV.

## 2.1.0

Picture mode Flow action.

## 2.0.23

Discovery log.

## 2.0.22 / 2.0.21

Fixes for manual pair.

## 2.0.20

Mute state fix.

## 2.0.19

Pair view: already-added check.

## 2.0.18

Error handling in device discovery.

## 2.0.17

Discovery time reduced to 8s to avoid WebApp timeouts.

## 2.0.16

Pair view changed (discovery).

## 2.0.15 / 2.0.14

Error logging.

## 2.0.13

German translation extended; descriptions corrected.

## 2.0.12

German translation; input selection fix.

## 2.0.11

Audio output and screen-off state.

## 2.0.10

Startup technical updates optimized.

## 2.0.9

Turn-on uses WoL if needed.

## 2.0.8

TV channel Flow action. Turn-on from standby.

## 2.0.7

Device availability check on the WoL Flow action.

## 2.0.6

Second poll interval when the TV is off. WoL Flow action.

## 2.0.5

Mute activated/deactivated triggers.

## 2.0.4

Stop polling when the device is deleted.

## 2.0.3 / 2.0.2 / 2.0.1

Test versions for pair view.

## 2.0.0

Volume slider, input mode, Flow actions for app start, input selection and IR codes.

## 1.1.1

Crash fix on Homey Pro 2023.

## 1.1.0

Update to Homey app SDK 3.0.
