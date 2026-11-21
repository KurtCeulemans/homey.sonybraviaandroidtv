# Agent instructions

Rules for coding agents in this repository. User instructions in the current chat always win.

## Hard limits

- Do not change application code unless the user asked for a code change
- Do not bump the app version (`package.json`, `.homeycompose/app.json`, `.homeychangelog.json`) unless asked
- Do not commit, push or open a PR unless asked
- Do not add `process.on('uncaughtException')` or `process.on('unhandledRejection')`
- Do not re-introduce SSDP, mDNS, broadcast discovery, or WoL to `255.255.255.255`
- Do not log PSK, IRCC XML bodies, or full Sony JSON payloads

## What this app is

Homey SDK 3 app that controls a Sony BRAVIA Android TV at a **stored unicast IP** over HTTP/HTTPS. Pairing is manual. Runtime does not discover devices.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before changing `lib/http.js`, power-on, polling, pairing or identity.

## Functional vs crash-only work

If the user asks for crash-hardening only:

- Do not change when Flows fire, when capabilities are set, retry counts, or timing constants
- Do not change reconnect-style behavior (this app has no WebSocket)
- Keep IRCC / relative volume / polling at `retry: false`

If the user asks for a functional fix, still keep the HTTP classification table (what is retryable) unless they explicitly change policy.

## Timing constants (do not change casually)

| Name | Value |
|---|---|
| Per-attempt HTTP timeout | 5000 ms |
| Retry delay | 1000 ms |
| Interactive retry window / power-on window | 20000 ms |
| Relative volume | `+1` / `-1`, no retry |
| WoL | UDP `{ip}:9`, unicast |

## Identity and settings

- `data.id`: `cid:` then `serial:` then `mac:` — never empty, never the IP
- IP, PSK, HTTPS, MAC, polling: device **settings**
- IP change = settings update, not a new pair (after 3.0.0 re-pair from 2.x)

## Homey / Node crash hygiene

- Await Homey promises (`setCapabilityValue`, `setStoreValue`, Flow `trigger`, `addCapability`) or attach `.catch()` that logs
- HTTP: `error` on both `req` and `res`; `settled` before resolve/reject; destroy on timeout
- UDP: `error` listener before `send`; do not call `setBroadcast`
- Parse Sony JSON defensively; never assume `result[0]` exists without a check
- `checkDevice()` must not reject (timers call it fire-and-forget)
- Clear poll interval in `onUninit` and `onDeleted`

## Validation before claiming done

```powershell
node --check app.js
node --check lib/http.js
node --check lib/wol.js
node --check lib/device-config.js
node --check lib/sony-bravia-android-tv-communicator.js
node --check lib/capabilities.js
node --check lib/flow-actions.js
node --check lib/remote-control-codes.js
node --check drivers/sony-bravia-android-tv/device.js
node --check drivers/sony-bravia-android-tv/driver.js
homey app validate --level debug
```

There is no ESLint setup and no automated test suite. If you touch UI/pair HTML, that runs in Homey’s pair webview, not in the app process.

## UI changes

Pair views: `drivers/sony-bravia-android-tv/pair/`. Locales: `locales/{en,nl,de}.json`. Keep the three languages in sync when you add user-visible strings.

This app has no Homey-browser “web app” beyond pairing. Do not invent a dashboard.

## Git

- Default branch for 3.0.0 work: `fix/cross-vlan`
- Never update `git config`
- Never `--no-verify`, force-push to `main`/`master`, or amend a pushed commit unless the user explicitly requests it
