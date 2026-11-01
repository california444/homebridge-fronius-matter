# homebridge-fronius-matter

Shows house consumption and grid power of a Fronius system in the Apple Home energy view (iOS 27) over Matter.

The plugin polls the local Fronius Solar API over HTTP, by default every 10 seconds. No cloud account is needed.

## Requirements

- Homebridge 2.4.0 or later
- Matter switched on for the plugin's child bridge
- Network access to the inverter and a Fronius Smart Meter at the grid connection

## Installation

```sh
npm install -g homebridge-fronius-matter
```

Add the platform to `config.json`. Pick a new `username` and unused ports:

```json
{
  "platform": "FroniusMatter",
  "host": "192.168.0.25",
  "pollInterval": 10,
  "_bridge": { "username": "0E:00:00:00:00:00", "port": 51991, "matter": { "port": 8596 } }
}
```

Restart Homebridge and add the bridge to the Home app with its Matter code. This is a separate pairing from HomeKit.

## Devices

| Device | Power | Energy |
| --- | --- | --- |
| Fronius Netz | Positive while importing, negative while exporting | Imported and exported |
| Fronius Haus | House consumption | Consumed |

## Limitations

- The device shapes rely on how the iOS 27 Home app treats Matter electrical devices, which Apple has not documented. An iOS or Homebridge update may change what Home shows.
- Home takes the grid meter as its whole home figure, which goes negative while exporting. House consumption is the separate Fronius Haus entry.
- Changing the device list requires removing the bridge from Home and pairing it again.
- The house energy counter is derived as inverter total + grid import - grid export, so it is approximate.
- Without a Home hub, the iPhone only reconnects when the Home app is reopened and may show old values until then.
- Solar and battery are not published.

## Tests

```sh
npm test
```
