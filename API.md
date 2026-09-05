# Smart Home local HTTP API

The extension can expose a small local HTTP API so any other application or
script running on your machine (a launcher, a keyboard-shortcut daemon, a
home-made plugin, a status bar widget, ...) can list and control the same
devices the Smart Home panel menu controls - including turning the Philips
Hue Desktop Sync on/off.

The API is **off by default**.

## Enabling the API

1. Open the extension preferences and go to **Local HTTP API**.
2. Toggle **Enable local HTTP API**. A random access token is generated
   automatically the first time you enable it.
3. Note the **Port** (default `8787`) and the **Access token** shown there.
   Use the refresh button next to the token to generate a new one at any
   time (this immediately invalidates the old one).
4. By default the API only listens on `localhost` (127.0.0.1). Only turn on
   **Listen on all network interfaces** if you understand that this exposes
   device control to your whole local network with no encryption.

All examples below assume:

```bash
PORT=8787
TOKEN="<the token from the preferences page>"
BASE="http://127.0.0.1:$PORT/api/v1"
```

## Authentication

Every request must include the token, either as a bearer token:

```
Authorization: Bearer <token>
```

or as an API key header:

```
X-Api-Key: <token>
```

Requests without a valid token get `401 Unauthorized`.

## Errors

Errors are returned as JSON with a matching HTTP status code:

```json
{ "error": "Unknown device." }
```

Common status codes:

| Code | Meaning |
|------|---------|
| 400  | Bad request (invalid JSON body, unsupported action for that device, invalid sync mode, ...) |
| 401  | Missing or invalid token |
| 404  | Unknown plugin/device/group/action or endpoint |
| 503  | The plugin instance exists but hasn't fetched its data yet |
| 500  | Internal error |

## Addressing plugins, devices and groups: use names or IDs

Everywhere a URL below takes `:pluginID`, `:deviceID` or `:groupID`, you can
pass either the internal id **or the name** you see in the panel menu / the
preferences page (e.g. the bridge's configured name, a light's name, a
room/zone name). **IDs are the recommended way to address things**.
Matching is case-insensitive.

- If exactly one plugin/device/group matches the given name, it is used.
- If nothing matches (and it's not a valid id either), you get `404`.
- If more than one plugin/device/group shares the exact same name (e.g. two
  lights both called "Lamp"), you get `409 Conflict` asking you to rename one
  of them (in the Hue app / device's own app) or to use the id instead.

Devices are grouped per **plugin instance**. A plugin instance is one
configured device/bridge, e.g. one Philips Hue Bridge, one Home Assistant
server, or the (single) Nanoleaf/Shelly/Universal instance. Start by listing
plugins to see each instance's `name` (and its `pluginID`):

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/plugins"
```

```json
[
  { "pluginID": "philipshue-bridge::ABC123456", "pluginName": "philipshue-bridge", "id": "ABC123456", "name": "`My Bridge" },
  { "pluginID": "philipshue-desktopsync::ABC123456", "pluginName": "philipshue-desktopsync", "id": "ABC123456", "name": "`My Bridge" },
  { "pluginID": "nanoleaf", "pluginName": "nanoleaf", "id": "nanoleaf", "name": "nanoleaf" }
]
```

From here on, examples use `My Bridge` directly wherever a
`:pluginID` is expected (URL-encode spaces/special characters as usual, e.g.
`My%20Bridge`).

## Listing devices and groups of one plugin instance

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$BASE/plugins/My%20Bridge"
```

```json
{
  "pluginID": "philipshue-bridge::ABC123456",
  "pluginName": "philipshue-bridge",
  "id": "ABC123456",
  "name": "My Bridge",
  "data": {
    "config": { "_all_": { "name": "All rooms and zones" } },
    "groups": {
      "room-id-1": { "name": "Living room", "type": "group", "...": "..." }
    },
    "devices": {
      "light-id-1": {
        "type": "device",
        "name": "Floor lamp",
        "capabilities": ["switch", "brightness", "color"],
        "groups": ["room-id-1"],
        "switch": true,
        "brightness": 0.8,
        "color": { "red": 255, "green": 180, "blue": 80 },
        "...": "..."
      }
    }
  }
}
```

Use `capabilities` to know which actions a device supports - the API
rejects an action with `400` if the device doesn't declare the matching
capability.

| Action              | Required capability |
|---------------------|----------------------|
| `switch`            | `switch` |
| `brightness`        | `brightness` |
| `color`             | `color` |
| `color-temperature` | `color_temperature` |
| `position`          | `position` |
| `up` / `down`       | `up/down` |
| `activate`          | `activate` |

## Controlling a single device

`POST /api/v1/plugins/:pluginID/devices/:deviceID/:action`

(both `:pluginID` and `:deviceID` accept a name or an id)

### Turn a light on/off

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"on": true}' \
  "$BASE/plugins/My%20Bridge/devices/Floor%20Lamp/switch"
```

### Set brightness (0.0 - 1.0)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value": 0.4}' \
  "$BASE/plugins/My%20Bridge/devices/Floor%20Lamp/brightness"
```

### Set color (RGB, 0 - 255)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"r": 255, "g": 0, "b": 0}' \
  "$BASE/plugins/My%20Bridge/devices/Floor%20Lamp/color"
```

### Set color temperature (given as the equivalent RGB, 0 - 255)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"r": 255, "g": 219, "b": 186}' \
  "$BASE/plugins/My%20Bridge/devices/Floor%20Lamp/color-temperature"
```

### Move a cover/blind (0.0 = closed, 1.0 = open) or fully open/close it

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"value": 0.5}' \
  "$BASE/plugins/Bedroom%20Hub/devices/Bedroom%20Blind/position"

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/plugins/Bedroom%20Hub/devices/Bedroom%20Blind/up"

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/plugins/Bedroom%20Hub/devices/Bedroom%20Blind/down"
```

### Activate a scene/effect

With no body, the scene/effect is applied to every real device it's
associated with (e.g. every panel in a Nanoleaf group, every light in a Hue
room):

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  "$BASE/plugins/My%20Bridge/devices/Relax/activate"
```

To activate it on just **one specific device** instead, pass its name (or
id) as `target`:

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"target": "Couch Wall"}' \
  "$BASE/plugins/nanoleaf/devices/Be%20Productive/activate"
```

## Controlling a whole group (room/zone)

Same actions as above (except `activate`), but targeting a group by its name
(or id) from `data.groups`, or the special id `_all_` for every device of
that plugin instance:

`POST /api/v1/plugins/:pluginID/groups/:groupID/:action`

```bash
# Turn every light in the "Living Room" group off
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"on": false}' \
  "$BASE/plugins/My%20Bridge/groups/Living%20Room/switch"

# Turn every light of this bridge off
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"on": false}' \
  "$BASE/plugins/My%20Bridge/groups/_all_/switch"
```

## Enabling/disabling Philips Hue Desktop (light) Sync

This is the dedicated shortcut for the Desktop Sync feature, so you don't
need to look up individual device IDs for it.

### List desktop sync instances and their current state

```bash
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/sync"
```

```json
[
  {
    "pluginID": "philipshue-desktopsync::ABC123456",
    "pluginName": "philipshue-desktopsync",
    "id": "ABC123456",
    "name": "My Bridge",
    "active": false,
    "modes": { "sync-screen": false, "sync-music": false, "sync-cursor": false }
  }
]
```

### Turn sync on

`:pluginID` accepts a name or an id, same as everywhere else. `mode` is one
of `sync-screen`, `sync-music`, `sync-cursor`, and `off`. For `sync-screen` on a
multi-monitor setup you can optionally pick which display with `display`
(its index, `0`, `1`, ...); omit it to sync the whole desktop.

```bash
# Sync lights to whatever is on screen
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode": "sync-screen"}' \
  "$BASE/sync/My%20Bridge"

# Sync lights to display 1 only
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode": "sync-screen", "display": 1}' \
  "$BASE/sync/My%20Bridge"

# Sync lights to music instead
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode": "sync-music"}' \
  "$BASE/sync/My%20Bridge"
```

### Turn sync off

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode": "off"}' \
  "$BASE/sync/My%20Bridge"
```

## Writing your own client/plugin

Any HTTP client works. A minimal Python example that toggles a light by
name - note that nothing here depends on an id:

```python
import requests
from urllib.parse import quote

BASE = "http://127.0.0.1:8787/api/v1"
TOKEN = "paste-your-token-here"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}


def device_url(plugin_name, device_name, action):
    return f"{BASE}/plugins/{quote(plugin_name)}/devices/{quote(device_name)}/{action}"


requests.post(
    device_url("My Bridge", "Floor Lamp", "switch"),
    headers=HEADERS,
    json={"on": True},
)
```

## Notes and limitations

- The API only reflects devices that are currently loaded by the extension
  (i.e. configured in the preferences). It does not add/remove/discover
  devices.
- Name matching is case-insensitive but must otherwise match exactly. If you
  rename a device/room/bridge (in its own app, or the bridge's name in Smart
  Home's preferences), update your scripts accordingly.
- If two devices/groups/plugin instances share the exact same name, addressing
  them by name returns `409 Conflict`. Give them distinct names, or fall back
  to their id (from `GET .../plugins` or `GET .../plugins/:pluginID`).
- A `503` on the `plugins/:pluginID` endpoints means that plugin instance
  hasn't fetched its first batch of data yet (e.g. right after Smart Home
  starts) - retry shortly after.
- The API has no rate limiting or CORS handling; **it is meant for trusted
  local automation, not for exposing your lights to the Internet**.
