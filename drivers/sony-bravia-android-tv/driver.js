const Homey = require('homey');
const SonyBraviaAndroidTvCommunicator = require('../../lib/sony-bravia-android-tv-communicator');
const {
  normalizeMac,
  pickDeviceId,
  validateHost,
} = require('../../lib/device-config');
const { ERROR_STATUS } = require('../../lib/http');

class SonyBraviaAndroidTvDriver extends Homey.Driver {

  async onInit() {
    this.log('Sony BRAVIA Android TV driver initialized.');
  }

  onPair(session) {
    session.setHandler('showView', async (view) => {
      this.log(`pair view: ${view}`);
    });

    session.setHandler('pair_device', async (data) => this.pairManualDevice(session, data));
  }

  pairingErrorMessage(error) {
    const status = error && error.status;
    if (status === ERROR_STATUS.INVALID_CONFIG) {
      return error.message || this.homey.__('errors.invalid_ip');
    }
    if (status === ERROR_STATUS.AUTHENTICATION) {
      return this.homey.__('errors.authentication');
    }
    if (status === ERROR_STATUS.REQUEST_TIMEOUT || status === ERROR_STATUS.CONNECTION_TIMEOUT) {
      return this.homey.__('errors.timeout');
    }
    if (status === ERROR_STATUS.CONNECTION_REFUSED || status === ERROR_STATUS.OFFLINE || status === ERROR_STATUS.CONNECTION_RESET) {
      return this.homey.__('errors.unreachable');
    }
    if (status === ERROR_STATUS.HTTP_404 || status === ERROR_STATUS.HTTP_503 || status === ERROR_STATUS.API_ERROR || status === ERROR_STATUS.PARSE_ERROR) {
      return this.homey.__('errors.api') + (error.message ? ` ${error.message}` : '');
    }
    return error && error.message ? error.message : this.homey.__('errors.unkown');
  }

  async pairManualDevice(session, data) {
    try {
      const ip = validateHost(data && data.ipAddress);
      const psk = data && data.psk ? String(data.psk) : '';
      if (!psk.trim()) {
        throw new Error(this.homey.__('errors.preshared_key'));
      }

      let macFromUser = '';
      if (data && data.macAddress) {
        macFromUser = normalizeMac(data.macAddress);
      }

      const device = {
        name: 'Sony BRAVIA TV',
        data: {
          id: 'pending',
          type: 'device',
          class: 'tv',
          product: '',
          region: '',
          language: '',
          model: '',
          serial: '',
          generation: '',
          name: '',
          area: '',
          cid: '',
        },
        settings: {
          ip,
          psk,
          https: Boolean(data && data.https),
          polling: 1,
          polling_unit: 'min',
          polling_off_active: false,
          polling_off: 5,
          macAddress: macFromUser,
        },
        log: (...args) => this.log(...args),
      };

      this.log(`pair: validating TV at ${ip} (https=${device.settings.https})`);
      const iface = await SonyBraviaAndroidTvCommunicator.getInterfaceInformation(device, { retry: false });
      this.log('pair: TV reachable');

      if (!iface.interfaceVersion) {
        throw new Error(this.homey.__('errors.api'));
      }

      const system = await SonyBraviaAndroidTvCommunicator.getSystemInformation(device, { retry: false });
      const macFromTv = system.macAddr ? normalizeMac(system.macAddr) : '';
      const macAddress = macFromUser || macFromTv;
      const id = pickDeviceId({
        cid: system.cid,
        serial: system.serial,
        macAddr: macAddress,
      });

      if (iface.productCategory === 'tv' && iface.productName === 'BRAVIA' && iface.modelName) {
        device.name = `Sony ${iface.productName} ${iface.modelName}`;
      } else if (system.name) {
        device.name = system.name;
      } else if (system.model) {
        device.name = `Sony BRAVIA ${system.model}`;
      }

      device.data.id = id;
      device.data.product = system.product || '';
      device.data.region = system.region || '';
      device.data.language = system.language || '';
      device.data.model = system.model || '';
      device.data.serial = system.serial || '';
      device.data.generation = system.generation || '';
      device.data.name = system.name || '';
      device.data.area = system.area || '';
      device.data.cid = system.cid || '';
      device.settings.macAddress = macAddress;
      delete device.log;

      const existingDevices = this.getDevices();
      const duplicate = existingDevices.filter((existing) => {
        const existingData = existing.getData();
        return existingData.id === device.data.id
          || (device.data.cid && existingData.cid === device.data.cid)
          || (device.data.serial && existingData.serial === device.data.serial);
      });
      if (duplicate.length > 0) {
        this.log(`pair: device already added (${device.data.id})`);
        await session.showView('already_added');
        return undefined;
      }

      this.log(`pair: ready to add ${device.name} id=${device.data.id}`);
      return device;
    } catch (err) {
      this.log(`pair error: ${err.status || ''} ${err.message}`);
      throw new Error(this.pairingErrorMessage(err));
    }
  }

}

module.exports = SonyBraviaAndroidTvDriver;
