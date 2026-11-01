import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildClusters, DEVICES, milliwatts, stateFor, uuidSeed, waitUntilRegistered } from '../lib/matterEnergy.js';

const [grid, load] = DEVICES;
const reading = { gridWatts: -500.5, houseWatts: 292.5, importedWh: 11393186, exportedWh: 12053342, houseWh: 15649924 };

test('publishes only the grid and the house', () => {
  assert.deepEqual(DEVICES.map((device) => device.id), ['grid', 'load']);
});

test('UUID seeds stay stable, or Home would see new devices', () => {
  assert.equal(uuidSeed('FroniusMatter', grid), 'FroniusMatter:matter:grid');
  assert.equal(uuidSeed('FroniusMatter', load), 'FroniusMatter:matter:load');
});

test('converts watts to milliwatts and keeps the sign', () => {
  assert.equal(milliwatts(292.5), 292500);
  assert.equal(milliwatts(-500.5), -500500);
  assert.equal(milliwatts(0), 0);
});

test('grid reports signed power and both energy directions in mWh', () => {
  assert.deepEqual(stateFor(grid, reading), {
    activePower: -500500,
    energy: {
      cumulativeEnergyImported: { energy: 11393186000 },
      cumulativeEnergyExported: { energy: 12053342000 },
    },
  });
});

test('house reports its power and imported energy only', () => {
  assert.deepEqual(stateFor(load, reading), {
    activePower: 292500,
    energy: { cumulativeEnergyImported: { energy: 15649924000 } },
  });
});

test('missing values stay out of the state', () => {
  assert.deepEqual(stateFor(grid, { exportedWh: 12053342 }), {
    activePower: undefined,
    energy: { cumulativeEnergyExported: { energy: 12053342000 } },
  });
});

test('only the grid declares ElectricalMeter', () => {
  assert.deepEqual(buildClusters(grid).descriptor.deviceTypeList.map((type) => type.deviceType), [0x0514, 0x0510]);
  assert.equal(buildClusters(load).descriptor, undefined);
});

test('waits until a device answers, and reports a timeout', async () => {
  let reads = 0;
  const lateMatter = { getAccessoryState: async () => (++reads < 2 ? undefined : { activePower: null }) };
  assert.equal(await waitUntilRegistered(lateMatter, ['a'], 1000), true);

  const silentMatter = { getAccessoryState: async () => { throw new Error('not registered'); } };
  assert.equal(await waitUntilRegistered(silentMatter, ['a'], 0), false);
});
