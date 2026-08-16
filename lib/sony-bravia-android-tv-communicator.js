const Homey = require('homey');

const RemoteControlCodes = require('./remote-control-codes');
const http = require('./http');
const { getBaseUrl, readSettings } = require('./device-config');

class SonyBraviaAndroidTVCommunicator extends Homey.SimpleClass {

  constructor() {
    super();
  }

  _logRetry(device, action, attempt, error) {
    if (device && typeof device.log === 'function') {
      device.log(`${action} → attempt ${attempt} → ${error.status || 'error'} → retry`);
    }
  }

  _logResult(device, action, result) {
    if (device && typeof device.log === 'function') {
      device.log(`${action} → ${result}`);
    }
  }

  async _jsonRpc(device, service, payload, options = {}) {
    const settings = readSettings(device);
    const retry = options.retry !== false;
    const url = `${getBaseUrl(settings)}/sony/${service}`;

    const data = await http.request({
      method: 'POST',
      url,
      headers: {
        'X-Auth-PSK': settings.psk || '',
        'Content-Type': 'application/json',
        'cache-control': 'no-cache',
      },
      body: JSON.stringify(payload),
      parseJson: true,
      retry,
      deadline: options.deadline,
      retryableStatuses: options.retryableStatuses,
      onRetry: (attempt, error) => {
        this._logRetry(device, `${service}.${payload.method}`, attempt, error);
      },
    });

    return data.result;
  }

  async sendCommand(device, command) {
    const settings = readSettings(device);
    const code = RemoteControlCodes[command] ? RemoteControlCodes[command] : command;
    const body = this.generateCommandRequest(code);

    try {
      const response = await http.request({
        method: 'POST',
        url: `${getBaseUrl(settings)}/sony/IRCC`,
        headers: {
          'X-Auth-PSK': settings.psk || '',
          SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"',
          'cache-control': 'no-cache',
        },
        body,
        parseJson: false,
        retry: false,
      });
      this._logResult(device, `IRCC ${command}`, 'ok');
      return response;
    } catch (err) {
      if (device && typeof device.log === 'function') {
        device.log(`IRCC ${command} → ${err.status || 'error'}: ${err.message}`);
      }
      throw err;
    }
  }

  generateCommandRequest(code) {
    return `<?xml version="1.0"?>
      <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <s:Body>
          <u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">
            <IRCCCode>${code}</IRCCCode>
          </u:X_SendIRCC>
        </s:Body>
      </s:Envelope>`;
  }

  async getInterfaceInformation(device, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'getInterfaceInformation',
      params: [],
      id: 2,
      version: '1.0',
    }, options);
    if (!result || !result[0]) {
      throw new http.SonyRequestError(
        'Interface information not available.',
        http.ERROR_STATUS.API_ERROR
      );
    }
    return result[0];
  }

  async getSystemInformation(device, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'getSystemInformation',
      params: [],
      id: 5,
      version: '1.0',
    }, options);
    if (!result || !result[0]) {
      throw new http.SonyRequestError(
        'System information not available.',
        http.ERROR_STATUS.API_ERROR
      );
    }
    return result[0];
  }

  async getDevicePowerState(device, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'getPowerStatus',
      params: [],
      id: 2,
      version: '1.0',
    }, options);
    if (!result || !result[0] || result[0].status === undefined) {
      throw new http.SonyRequestError(
        'Power status not available.',
        http.ERROR_STATUS.API_ERROR
      );
    }
    return result[0].status;
  }

  async setDevicePowerState(device, value, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'setPowerStatus',
      id: 55,
      params: [{ status: value }],
      version: '1.0',
    }, options);
    return result && result[0];
  }

  async getVolume(device, target = 'speaker', options = {}) {
    const result = await this._jsonRpc(device, 'audio', {
      method: 'getVolumeInformation',
      id: 33,
      params: [],
      version: '1.0',
    }, options);
    const volumes = result && result[0];
    if (!Array.isArray(volumes)) {
      throw new http.SonyRequestError('Volume not available.', http.ERROR_STATUS.API_ERROR);
    }
    const state = volumes.filter((entry) => entry.target === target)[0];
    if (!state) {
      throw new http.SonyRequestError('Volume not available.', http.ERROR_STATUS.API_ERROR);
    }
    return state;
  }

  async setVolume(device, value, target = 'speaker', options = {}) {
    const result = await this._jsonRpc(device, 'audio', {
      method: 'setAudioVolume',
      id: 98,
      params: [{
        volume: value,
        target,
      }],
      version: '1.2',
    }, options);
    return result && result[0];
  }

  async setMute(device, value, options = {}) {
    const result = await this._jsonRpc(device, 'audio', {
      method: 'setAudioMute',
      id: 601,
      params: [{ status: value }],
      version: '1.0',
    }, options);
    return result && result[0];
  }

  async getApps(device, options = {}) {
    const result = await this._jsonRpc(device, 'appControl', {
      method: 'getApplicationList',
      id: 60,
      params: [],
      version: '1.0',
    }, options);
    const apps = result && result[0];
    if (!apps) {
      throw new http.SonyRequestError('Apps not available.', http.ERROR_STATUS.API_ERROR);
    }
    return apps;
  }

  async startApp(device, uri, options = {}) {
    return this._jsonRpc(device, 'appControl', {
      method: 'setActiveApp',
      id: 601,
      params: [{ uri }],
      version: '1.0',
    }, options);
  }

  async getCurrentExternalInputs(device, options = {}) {
    const result = await this._jsonRpc(device, 'avContent', {
      method: 'getCurrentExternalInputsStatus',
      id: 105,
      params: [],
      version: '1.0',
    }, options);
    const inputs = result && result[0];
    if (!inputs) {
      throw new http.SonyRequestError('Inputs not available.', http.ERROR_STATUS.API_ERROR);
    }
    return inputs;
  }

  async getSourcess(device, scheme, options = {}) {
    const result = await this._jsonRpc(device, 'avContent', {
      method: 'getSourceList',
      id: 1,
      params: [{ scheme }],
      version: '1.0',
    }, options);
    const inputs = result && result[0];
    if (!inputs) {
      throw new http.SonyRequestError('Inputs not available.', http.ERROR_STATUS.API_ERROR);
    }
    return inputs;
  }

  async getInputs(device, source, options = {}) {
    const result = await this._jsonRpc(device, 'avContent', {
      method: 'getContentList',
      id: 88,
      params: [{
        stIdx: 0,
        cnt: 50,
        uri: source,
      }],
      version: '1.5',
    }, options);
    const inputs = result && result[0];
    if (!inputs) {
      throw new http.SonyRequestError('Inputs not available.', http.ERROR_STATUS.API_ERROR);
    }
    return inputs;
  }

  async selectInput(device, uri, options = {}) {
    return this._jsonRpc(device, 'avContent', {
      method: 'setPlayContent',
      id: 101,
      params: [{ uri }],
      version: '1.0',
    }, options);
  }

  async getPlayingContentInfo(device, options = {}) {
    const result = await this._jsonRpc(device, 'avContent', {
      method: 'getPlayingContentInfo',
      id: 103,
      params: [],
      version: '1.0',
    }, options);
    const info = result && result[0];
    if (!info) {
      throw new http.SonyRequestError('PlayingContentInfo not available.', http.ERROR_STATUS.API_ERROR);
    }
    return info;
  }

  async getIrccCommands(device, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'getRemoteControllerInfo',
      id: 54,
      params: [],
      version: '1.0',
    }, options);
    const commands = result && result[1];
    if (!commands) {
      throw new http.SonyRequestError('IRCC-Codes not available.', http.ERROR_STATUS.API_ERROR);
    }
    return commands;
  }

  async getSoundSettings(device, options = {}) {
    const result = await this._jsonRpc(device, 'audio', {
      method: 'getSoundSettings',
      id: 73,
      params: [{ target: 'outputTerminal' }],
      version: '1.1',
    }, options);
    const state = result && result[0] && result[0][0];
    if (!state) {
      throw new http.SonyRequestError('SoundSettings not available.', http.ERROR_STATUS.API_ERROR);
    }
    return state;
  }

  async setSoundSettings(device, value, options = {}) {
    const result = await this._jsonRpc(device, 'audio', {
      method: 'setSoundSettings',
      id: 5,
      params: [{
        settings: [{
          value,
          target: 'outputTerminal',
        }],
      }],
      version: '1.1',
    }, options);
    return result && result[0];
  }

  async getPowerSavingMode(device, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'getPowerSavingMode',
      id: 51,
      params: [],
      version: '1.0',
    }, options);
    const state = result && result[0];
    if (!state) {
      throw new http.SonyRequestError('PowerSavingMode not available.', http.ERROR_STATUS.API_ERROR);
    }
    return state;
  }

  async setPowerSavingMode(device, value, options = {}) {
    const result = await this._jsonRpc(device, 'system', {
      method: 'setPowerSavingMode',
      id: 52,
      params: [{ mode: value }],
      version: '1.0',
    }, options);
    return result && result[0];
  }

  async getPictureQualitySettings(device, type = '', options = {}) {
    const result = await this._jsonRpc(device, 'video', {
      method: 'getPictureQualitySettings',
      id: 52,
      params: [{ target: type }],
      version: '1.0',
    }, options);
    const modes = result && result[0];
    if (!modes) {
      throw new http.SonyRequestError('PictureQualitySettings not available.', http.ERROR_STATUS.API_ERROR);
    }
    return modes;
  }

  async setPictureQualitySettings(device, type, value, options = {}) {
    const result = await this._jsonRpc(device, 'video', {
      method: 'setPictureQualitySettings',
      id: 12,
      params: [{
        settings: [{
          value,
          target: type,
        }],
      }],
      version: '1.0',
    }, options);
    return result && result[0];
  }

  async waitUntilReachable(device, deadline) {
    while (Date.now() < deadline) {
      try {
        const status = await this.getDevicePowerState(device, { retry: false });
        this._logResult(device, 'power-on verification', `TV reachable (${status})`);
        return status;
      } catch (_error) {
        await http.delay(1000);
      }
    }
    throw new http.SonyRequestError(
      'TV did not become reachable in time.',
      http.ERROR_STATUS.OFFLINE,
      { retryable: false }
    );
  }

}

module.exports = new SonyBraviaAndroidTVCommunicator();
