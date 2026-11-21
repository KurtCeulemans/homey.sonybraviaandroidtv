# Development

## Requirements

- Node.js (same major as current Homey CLI)
- [Homey CLI](https://apps.developer.homey.app/the-basics/getting-started/homey-cli): `npm install -g homey`
- Logged-in Homey: `homey login`
- Target Homey on the LAN (this app is installed with `homey app install`)

No runtime npm dependencies. `package.json` `"dependencies"` is empty.

## Repo layout

```
app.js                          App + Flow listeners
lib/http.js                     HTTP(S) timeout, classify, retry
lib/wol.js                      Unicast Wake-on-LAN
lib/device-config.js            IP/MAC validation, identity, settings
lib/sony-bravia-android-tv-communicator.js
lib/capabilities.js             Device capability handlers + power-on
lib/flow-actions.js             Simple IRCC Flow cards
lib/remote-control-codes.js
drivers/sony-bravia-android-tv/device.js
drivers/sony-bravia-android-tv/driver.js
drivers/sony-bravia-android-tv/pair/
.homeycompose/                  Source of generated app.json + Flow cards
locales/{en,nl,de}.json
```

Do not edit generated `app.json` by hand. Change `.homeycompose/` and driver `*.compose.json` files instead.

## Daily commands

From the app root:

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
homey app install
```

There is no ESLint config and no test suite in this repo. Do not add a global `process.on('uncaughtException')` or `process.on('unhandledRejection')` as a substitute.

## Debug

`app.js` opens the inspector on port **9910** when `DEBUG=1` and `homey.platform === 'local'`. `.vscode/launch.json` is set up for that.

Homey logs: `this.log` / `this.error` on App/Driver/Device, plus communicator retry lines (`attempt N → status → retry`). HTTP and WoL do not log payloads or the PSK.

## Pairing while developing

1. On the TV: Remote start on, PSK authentication, known IP
2. Homey and TV must route (same LAN or routed VLANs)
3. Add device → manual IP + PSK (+ HTTPS / MAC if needed)
4. After 2.x → 3.0.0, remove the old device first; `data.id` format changed

Changing IP later: device settings only. Do not re-introduce SSDP to “fix” a stale IP.

## Branch and version

Current work lives on `fix/cross-vlan`. App version is **3.0.0**.

- Do not bump the version unless explicitly asked
- Do not commit, push or open a PR unless explicitly asked
- Homey store / compose changelog lives in `.homeychangelog.json`; the narrative changelog is `CHANGELOG.md`

## Coding constraints that are easy to break

- Do not restore SSDP, `simple-ssdp`, or broadcast WoL to `255.255.255.255`
- Do not retry IRCC, relative volume, or polling
- Do not change retry timing (1s / 20s / 5s) without an explicit functional request
- Do not use the MAC as the runtime network address; IP in settings is the address
- Keep `cid:` / `serial:` / `mac:` identity order
- Homey SDK promises (`setCapabilityValue`, Flow `trigger`, …) must be awaited or `.catch()`’d if fire-and-forget
- Network objects (`http.ClientRequest`, `IncomingMessage`, UDP sockets) need `error` listeners
