// Reads the Fronius Solar API. The inverter cannot push, so the plugin polls it.
//
// Fronius signs P_Grid + for import and - for export, like Matter. P_Load is
// negative while the house consumes. Fields can be null, and a null is left out
// of the reading rather than turned into 0.

const POWER_FLOW = 'solar_api/v1/GetPowerFlowRealtimeData.fcgi';
const METERS = 'solar_api/v1/GetMeterRealtimeData.cgi?Scope=System';

const GRID_METER_LOCATION = 0;

function finite(value) {
  return Number.isFinite(value) ? value : undefined;
}

export function parseReading(powerFlow, meterData) {
  const site = powerFlow?.Body?.Data?.Site;
  if (!site) {
    throw new Error('The power flow response has no Site data');
  }

  const meters = Object.values(meterData?.Body?.Data ?? {});
  const meter = meters.find((candidate) => candidate.Meter_Location_Current === GRID_METER_LOCATION) ?? meters[0];

  const load = finite(site.P_Load);
  const produced = finite(site.E_Total);
  const importedWh = finite(meter?.EnergyReal_WAC_Plus_Absolute);
  const exportedWh = finite(meter?.EnergyReal_WAC_Minus_Absolute);

  return {
    gridWatts: finite(site.P_Grid),
    houseWatts: load === undefined ? undefined : 0 - load,
    importedWh,
    exportedWh,
    // There is no house counter, so it is derived from the others. Approximate.
    houseWh: produced === undefined || importedWh === undefined || exportedWh === undefined
      ? undefined
      : produced + importedWh - exportedWh,
  };
}

// A Matter energy counter must not fall, which the derived house counter can.
export function neverFalling(previous, value) {
  return Number.isFinite(previous) && Number.isFinite(value) ? Math.max(previous, value) : value;
}

async function getJson(host, path, timeoutMs) {
  const response = await fetch(`http://${host}/${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${path}`);
  }
  return response.json();
}

export async function fetchReading(host, timeoutMs) {
  const [powerFlow, meterData] = await Promise.all([
    getJson(host, POWER_FLOW, timeoutMs),
    getJson(host, METERS, timeoutMs),
  ]);
  return parseReading(powerFlow, meterData);
}
