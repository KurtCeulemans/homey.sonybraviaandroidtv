# Security

This app never talks to Sony cloud services. All control is local HTTP(S) plus optional local UDP Wake-on-LAN.

## Credentials

| Secret | Storage | Use |
|---|---|---|
| Pre-shared key (PSK) | Homey device setting `psk` (`type: password`) | Header `X-Auth-PSK` on every TV request |
| TV IP / hostname | Device setting `ip` | Unicast HTTP(S) target |
| MAC | Device setting `macAddress` | WoL packet only |

The PSK is a shared secret configured on the TV. Anyone who can reach the TV IP and knows the PSK can control the TV. Homey stores it in device settings; do not log it, do not put it in `data.id`, git, or Flow tokens.

Pairing validates the PSK by calling `getInterfaceInformation`. HTTP 401/403 and Sony RPC 401/403 are classified as `authentication` and are **not** retried.

## Transport

- Default: HTTP to `http://{ip}/sony/...`
- Optional: HTTPS to `https://{ip}/sony/...` when the device setting `https` is on
- TLS: `rejectUnauthorized: false` because consumer TVs typically use a private or missing certificate. HTTPS here is not a substitute for a validated public PKI; it only matches TVs that require TLS on the IP-control port
- There is no certificate pinning and no client certificate

IRCC uses SOAP POST to `/sony/IRCC`. JSON-RPC uses `/sony/{service}`. Both send the PSK header.

## Network exposure

The app binds nothing. It only opens outbound ClientRequest sockets and short-lived UDP sockets for WoL.

Implications:

- Homey must be allowed to route to the TV IP (including cross-VLAN). The app will not discover TVs on other L2 domains
- WoL is unicast to `{tvIp}:9`, not broadcast. A directed packet still has to be permitted by the router; it does not wake hosts via `255.255.255.255`
- Host validation rejects URLs, ports and paths so pairing cannot be pointed at an arbitrary URL. It does not stop you from entering another LAN host’s IP

## Input handling

- `validateHost` / `normalizeMac` reject malformed IP/hostname/MAC before they are stored
- Sony JSON is parsed in try/catch; unexpected shapes become `PARSE_ERROR` and are not retried
- IRCC XML embeds the command code from a fixed map or from a Flow argument. Treat IRCC autocomplete values as TV-local, not as untrusted internet input
- Pairing identity (`cid` / `serial` / MAC) is taken from the TV response; duplicates are refused

## What this app does not claim

- No encryption of settings beyond what Homey provides
- No protection if Homey itself is compromised
- No user authentication besides the TV PSK
- No rate limiting beyond the HTTP timeout/retry window
- No global process exception handlers (failures must stay local to the request)

## Reporting

Upstream issue tracker (original project): see `bugs.url` in `.homeycompose/app.json`. Do not attach PSKs or full HTTP bodies to reports.
