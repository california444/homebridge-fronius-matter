import assert from 'node:assert/strict';
import { test } from 'node:test';

import { neverFalling, parseReading } from '../lib/froniusApi.js';

// Trimmed from real responses of the inverter at night.
const powerFlow = {
  Body: {
    Data: {
      Site: { E_Total: 16310079.567222223, P_Akku: 0, P_Grid: 292.5, P_Load: -292.5, P_PV: 0 },
    },
  },
};
const meterData = {
  Body: {
    Data: {
      0: {
        EnergyReal_WAC_Minus_Absolute: 12053342,
        EnergyReal_WAC_Plus_Absolute: 11393186,
        Meter_Location_Current: 0,
      },
    },
  },
};

function withSite(site) {
  return { Body: { Data: { Site: { ...powerFlow.Body.Data.Site, ...site } } } };
}

test('maps a night reading', () => {
  const reading = parseReading(powerFlow, meterData);

  assert.equal(reading.gridWatts, 292.5);
  assert.equal(reading.houseWatts, 292.5);
  assert.equal(reading.importedWh, 11393186);
  assert.equal(reading.exportedWh, 12053342);
  assert.ok(Math.abs(reading.houseWh - 15649923.57) < 0.01);
});

test('keeps the sign of the grid while exporting', () => {
  const reading = parseReading(withSite({ P_Grid: -1800, P_Load: -450 }), meterData);

  assert.equal(reading.gridWatts, -1800);
  assert.equal(reading.houseWatts, 450);
});

test('an idle house is 0 W, not -0 W', () => {
  assert.ok(Object.is(parseReading(withSite({ P_Load: 0 }), meterData).houseWatts, 0));
});

test('null fields stay missing instead of becoming 0', () => {
  const reading = parseReading(withSite({ P_Grid: null, P_Load: null, E_Total: null }), meterData);

  assert.equal(reading.gridWatts, undefined);
  assert.equal(reading.houseWatts, undefined);
  assert.equal(reading.houseWh, undefined);
  assert.equal(reading.importedWh, 11393186);
});

test('prefers the meter at the grid connection', () => {
  const data = {
    Body: {
      Data: {
        0: { EnergyReal_WAC_Plus_Absolute: 1, EnergyReal_WAC_Minus_Absolute: 2, Meter_Location_Current: 1 },
        1: { EnergyReal_WAC_Plus_Absolute: 3, EnergyReal_WAC_Minus_Absolute: 4, Meter_Location_Current: 0 },
      },
    },
  };

  assert.equal(parseReading(powerFlow, data).importedWh, 3);
});

test('rejects a response without site data', () => {
  assert.throws(() => parseReading({ Body: { Data: {} } }, meterData), /no Site data/);
});

test('the house counter never falls', () => {
  assert.equal(neverFalling(100, 90), 100);
  assert.equal(neverFalling(100, 110), 110);
  assert.equal(neverFalling(undefined, 90), 90);
  assert.equal(neverFalling(100, undefined), undefined);
});
