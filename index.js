import { fetchReading, neverFalling } from './lib/froniusApi.js';
import { buildClusters, DEVICES, stateFor, uuidSeed, waitUntilRegistered } from './lib/matterEnergy.js';

const PLUGIN_NAME = 'homebridge-fronius-matter';
const PLATFORM_NAME = 'FroniusMatter';

const DEFAULT_POLL_SECONDS = 10;
const MIN_POLL_SECONDS = 5;
const REQUEST_TIMEOUT_MS = 5000;

class FroniusMatterPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config;
    this.api = api;
    this.cached = new Map();
    this.published = new Map();
    this.failing = false;

    api.on('didFinishLaunching', () => {
      this.start().catch((err) => this.log.error('Could not publish the Matter devices:', err.message ?? err));
    });
    api.on('shutdown', () => clearTimeout(this.pollTimer));
  }

  // Homebridge has no HAP accessories to restore here, but requires the method
  // on a dynamic platform.
  configureAccessory() {}

  // Called for every Matter accessory in the cache, before didFinishLaunching.
  // Registering the same UUID again attaches to it.
  configureMatterAccessory(accessory) {
    this.cached.set(accessory.UUID, accessory);
  }

  async start() {
    const matter = this.api.matter;

    if (!this.config.host) {
      this.log.error('The Fronius host is missing from the configuration, so nothing is published.');
      return;
    }

    if (!matter || !this.api.isMatterEnabled()) {
      this.log.warn('Matter is not enabled on this bridge, so nothing is published. Switch it on for the child bridge.');
      return;
    }

    const devices = DEVICES.map((device) => ({
      device,
      UUID: matter.uuid.generate(uuidSeed(PLATFORM_NAME, device)),
    }));

    const wanted = new Set(devices.map(({ UUID }) => UUID));
    const removed = [...this.cached.values()].filter((accessory) => !wanted.has(accessory.UUID));
    if (removed.length) {
      await matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, removed);
    }

    await matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, devices.map(({ device, UUID }) => ({
      UUID,
      displayName: device.name,
      deviceType: matter.deviceTypes.ElectricalSensor,
      serialNumber: `FRONIUS-${device.id.toUpperCase()}`,
      manufacturer: 'Fronius',
      model: 'Solar API',
      context: { deviceId: device.id },
      clusters: buildClusters(device),
    })));

    const ready = await waitUntilRegistered(matter, devices.map(({ UUID }) => UUID), 30000);
    if (!ready) {
      this.log.warn('The Matter devices took more than 30 seconds to register; the first readings may be missed.');
    }
    this.log.info(`Publishing ${devices.length} Matter devices: ${devices.map(({ device }) => device.name).join(', ')}`);

    this.devices = devices;
    this.pollMs = Math.max(this.config.pollInterval ?? DEFAULT_POLL_SECONDS, MIN_POLL_SECONDS) * 1000;
    await this.poll();
  }

  // The next poll is only scheduled once this one is done, so they cannot overlap.
  async poll() {
    try {
      const reading = await fetchReading(this.config.host, REQUEST_TIMEOUT_MS);
      reading.houseWh = neverFalling(this.houseWh, reading.houseWh);
      this.houseWh = reading.houseWh ?? this.houseWh;

      await this.publish(reading);

      if (this.failing) {
        this.failing = false;
        this.log.info('The Fronius is reachable again.');
      }
    } catch (err) {
      if (!this.failing) {
        this.failing = true;
        this.log.warn(`Could not read the Fronius, keeping the last values: ${err.message ?? err}`);
      }
    }

    this.pollTimer = setTimeout(() => this.poll(), this.pollMs);
  }

  async publish(reading) {
    const matter = this.api.matter;
    const logReading = this.config.debug ? this.log.info : this.log.debug;

    for (const { device, UUID } of this.devices) {
      const state = stateFor(device, reading);
      const last = this.published.get(UUID) ?? {};
      const energy = JSON.stringify(state.energy);

      if (state.activePower !== undefined && state.activePower !== last.activePower) {
        await matter.updateAccessoryState(UUID, 'electricalPowerMeasurement', { activePower: state.activePower });
        last.activePower = state.activePower;
      }
      if (energy !== '{}' && energy !== last.energy) {
        await matter.updateAccessoryState(UUID, 'electricalEnergyMeasurement', state.energy);
        last.energy = energy;
      }

      this.published.set(UUID, last);
      logReading.call(this.log, `${device.name}: ${state.activePower === undefined ? 'no reading' : `${state.activePower / 1000} W`}`);
    }
  }
}

export default (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, FroniusMatterPlatform);
};
