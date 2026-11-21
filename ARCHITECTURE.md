# Architecture

Homey SDK 3 app. One driver (`sony-bravia-android-tv`), one device class per paired TV. All TV I/O is unicast HTTP(S) to the stored IP, plus optional unicast Wake-on-LAN UDP to `{ip}:9`.

## Process layout

```
Homey.App (app.js)
  ├── Flow run listeners (IRCC, apps, input, WoL, …)
  └── SonyBraviaAndroidTvCommunicator  (singleton)
           └── lib/http.js             request / retry / classify
           └── lib/wol.js              unicast magic packet

Homey.Driver (driver.js)
  └── pair_device → validate IP + PSK → getInterfaceInformation
                 → getSystemInformation → pickDeviceId

Homey.Device (device.js)
  ├── capability listeners (lib/capabilities.js)
  ├── polling interval → checkDevice() → _pollOnce()
  └── settings (ip, psk, https, polling, macAddress)
```

`app.json` is generated from `.homeycompose/`. Edit compose files, not `app.json`.

## Pairing and identity

Pairing is manual only (`pair/manual_input.html`). The driver:

1. Validates host (`lib/device-config.js` `validateHost`) — no URL, no port, no path
2. Calls `getInterfaceInformation` and `getSystemInformation` with **retry disabled**
3. Builds `data.id` via `pickDeviceId`: `cid:` → `serial:` → `mac:` (never empty)
4. Stores IP, PSK, HTTPS flag and MAC in **settings**, not in `data.id`
5. Rejects duplicates on `id`, `cid` or `serial`

IP can later change in device settings without re-pairing. Runtime never searches the network.

## HTTP layer (`lib/http.js`)

Every Sony call goes through `http.request()` / `requestOnce()`.

| Constant | Value | Role |
|---|---|---|
| `API_TIMEOUT_MS` | 5000 | Hard abort per attempt (`req.destroy()`) |
| `RETRY_DELAY_MS` | 1000 | Pause between retries |
| `RETRY_WINDOW_MS` | 20000 | Total deadline for interactive calls |

Retryable: HTTP 404, HTTP 503, connection refused/reset/timeout, request timeout, offline.

Not retryable: HTTP 400/401/403, invalid config, PSK/auth, JSON-RPC API errors, parse errors.

**Must call `request()` with `retry: false`:** IRCC, relative volume (`+1` / `-1`), polling.

`requestOnce` attaches `error` listeners on both the ClientRequest and the IncomingMessage, uses a `settled` flag against double resolve/reject, and classifies network/HTTP/RPC failures as `SonyRequestError`.

JSON bodies must be an object with a `result` property. Arrays, non-objects and missing `result` become `PARSE_ERROR` (not retried).

## Communicator (`lib/sony-bravia-android-tv-communicator.js`)

Thin JSON-RPC / IRCC wrapper. Reads IP/PSK/HTTPS via `readSettings(device)` so pairing stubs (plain objects with `settings`) and Homey devices share the same path.

`waitUntilReachable(device, deadline)` polls `getPowerStatus` without retry until the deadline (used after power-on / WoL).

## Power-on (`lib/capabilities.js` `powerOn`)

One ~20s window (`POWER_WINDOW_MS`):

1. REST `setPowerStatus(true)` — retry **only** 404/503
2. If that fails and it is not auth/config: one IRCC `PowerOn`, then a single power-status check
3. Unicast WoL to `{ip}:9` with the stored MAC
4. `waitUntilReachable` until the same deadline

Auth/config/parse errors abort immediately (no WoL).

## Wake-on-LAN (`lib/wol.js`)

Unicast UDP magic packet to the **TV IP**, port 9. Not `255.255.255.255`. Successful resolve means the packet was sent locally, not that the TV woke.

## Polling (`device.js`)

- Interval from settings (`polling` × `polling_unit`; optional `polling_off` when off)
- `_pollInFlight` mutex: overlapping polls are skipped
- `_commandInFlight`: user capability/Flow commands skip polling until they finish
- One `getPowerStatus` per poll; extra queries (volume, content, sound, picture-off) only if status is `active`
- Poll HTTP uses `retry: false`
- `onUninit` / `onDeleted` clear the interval

Capability commands schedule `checkDevice()` after 1s. Flow actions call `checkDevice()` after the command.

Homey `setCapabilityValue` / Flow `trigger()` inside `_pollOnce` are awaited. `checkDevice()` itself swallows poll errors so timer callbacks do not become unhandled rejections.

## Settings

`onSettings` replaces `this.data.settings`, clears the interval and starts a new one. In-flight HTTP is not aborted; the next call reads the new IP/PSK.

## What this app does not do

- SSDP / mDNS / broadcast discovery at runtime
- WebSockets
- Cloud Sony accounts
- Global `uncaughtException` / `unhandledRejection` handlers
