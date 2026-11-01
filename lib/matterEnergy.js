// Grid meter and house load as Matter electrical devices, which the iOS 27 Home
// app shows in its energy view.
//
// Adapted from homebridge-sunsynk lib/matterEnergy.js (MIT, Chris Posthumus).
// The device shapes follow its iOS 27 tests. Apple has not documented them:
// - The grid is an ElectricalSensor that also declares ElectricalMeter (0x0514).
//   Apple takes an ElectricalMeter as the whole home meter, and the
//   ElectricalSensor base type lets Homebridge restore it from its cache.
// - The house is a plain ElectricalSensor, listed under "All Home".
//
// Matter units: power in milliwatts (signed, + consumed, - produced), energy in
// milliwatt hours.

const ELECTRICAL_METER = 0x0514;
const ELECTRICAL_SENSOR = 0x0510;

// "id" seeds the Matter UUID, so changing it recreates the device in Home.
export const DEVICES = [
  { id: 'grid', name: 'Fronius Netz' },
  { id: 'load', name: 'Fronius Haus' },
];

export function milliwatts(watts) {
  return Math.round(watts * 1000);
}

function energy(wattHours) {
  return { energy: Math.round(wattHours * 1000) };
}

export function uuidSeed(platform, device) {
  return `${platform}:matter:${device.id}`;
}

export function buildClusters(device) {
  const clusters = {
    electricalPowerMeasurement: { activePower: null },
    electricalEnergyMeasurement: device.id === 'grid'
      ? { cumulativeEnergyImported: null, cumulativeEnergyExported: null }
      : { cumulativeEnergyImported: null },
  };

  if (device.id === 'grid') {
    clusters.descriptor = {
      deviceTypeList: [
        { deviceType: ELECTRICAL_METER, revision: 1 },
        { deviceType: ELECTRICAL_SENSOR, revision: 1 },
      ],
    };
  }

  return clusters;
}

// Reduces a reading ({ gridWatts, houseWatts, importedWh, exportedWh, houseWh })
// to the Matter state of one device. A missing value stays out of the state.
export function stateFor(device, reading) {
  const isGrid = device.id === 'grid';
  const watts = isGrid ? reading.gridWatts : reading.houseWatts;
  const counters = isGrid
    ? { cumulativeEnergyImported: reading.importedWh, cumulativeEnergyExported: reading.exportedWh }
    : { cumulativeEnergyImported: reading.houseWh };

  return {
    activePower: Number.isFinite(watts) ? milliwatts(watts) : undefined,
    energy: Object.fromEntries(Object.entries(counters)
      .filter(([, wattHours]) => Number.isFinite(wattHours))
      .map(([name, wattHours]) => [name, energy(wattHours)])),
  };
}

// registerPlatformAccessories() resolves once the registration is sent, not once
// the endpoints exist, and on a child bridge a state update that arrives before
// then is dropped. Wait until every device answers a state read.
export async function waitUntilRegistered(matter, uuids, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let pending = uuids;

  while (pending.length) {
    const states = await Promise.all(pending.map((uuid) =>
      Promise.resolve(matter.getAccessoryState(uuid, 'electricalPowerMeasurement')).catch(() => undefined)));
    pending = pending.filter((_, index) => states[index] === undefined);

    if (!pending.length || Date.now() > deadline) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return pending.length === 0;
}
