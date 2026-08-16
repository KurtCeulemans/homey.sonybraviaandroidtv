'use strict';

const Homey = require('homey');
const SonyBraviaAndroidTvCommunicator = require('./lib/sony-bravia-android-tv-communicator');
const SonyBraviaFlowActions = require('./lib/flow-actions');
const wol = require('./lib/wol');
const { RETRY_WINDOW_MS } = require('./lib/http');

class SonyBraviaAndroidTvApp extends Homey.App {

  async onInit() {
    if (process.env.DEBUG === '1') {
      if (this.homey.platform === 'local') {
        try {
          require('inspector').waitForDebugger();
        } catch (error) {
          require('inspector').open(9910, '0.0.0.0', true);
        }
      }
    }

    this.log('SonyBraviaAndroidTvApp is running...');
    await this.registerFlowListeners();
  }

  async runDeviceCommand(device, actionName, fn) {
    if (device && typeof device.beginUserCommand === 'function') {
      await device.beginUserCommand();
    }
    try {
      this.log(`${actionName} → start`);
      const result = await fn();
      this.log(`${actionName} → ok`);
      return result;
    } catch (error) {
      this.error(`${actionName} → ${error.status || 'error'}: ${error.message}`);
      throw new Error(error.message);
    } finally {
      if (device && typeof device.endUserCommand === 'function') {
        await device.endUserCommand();
      }
    }
  }

  async registerFlowListeners() {
    SonyBraviaFlowActions.forEach((flow) => {
      try {
        const flowCard = this.homey.flow.getActionCard(flow.action);

        flowCard.registerRunListener(async (args, state) => {
          const result = await this.runDeviceCommand(args.device, flow.action, async () => {
            let parsedCommand = flow.command;
            if (flow.command instanceof Function) {
              parsedCommand = flow.command(args, state);
            }
            await SonyBraviaAndroidTvCommunicator.sendCommand(args.device, parsedCommand);
            return true;
          });
          await args.device.checkDevice();
          return result;
        });
      } catch (err) {
        this.log(`${this.homey.manifest.id} - ${this.homey.manifest.version}: flow command could not be registered: `, flow, err);
      }
    });

    this._flowActionStartApp = this.homey.flow.getActionCard('app_start');
    this._flowActionStartApp.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'app_start', async () => {
        await SonyBraviaAndroidTvCommunicator.startApp(args.device, args.app.uri, { retry: true });
        return true;
      });
      await args.device.checkDevice();
      return result;
    });
    this._flowActionStartApp.registerArgumentAutocompleteListener('app', async (query, args) => {
      this._autocompleteAppList = await args.device.getAutocompleteAppList();
      return this._autocompleteAppList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });

    this._flowActionSelectInput = this.homey.flow.getActionCard('input_select');
    this._flowActionSelectInput.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'input_select', async () => {
        await SonyBraviaAndroidTvCommunicator.selectInput(args.device, args.input.uri, { retry: true });
        return true;
      });
      await args.device.checkDevice();
      return result;
    });
    this._flowActionSelectInput.registerArgumentAutocompleteListener('input', async (query, args) => {
      this._autocompleteInputList = await args.device.getAutocompleteInputList();
      return this._autocompleteInputList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });

    this._flowActionSelectTvChannel = this.homey.flow.getActionCard('tv_channel_select');
    this._flowActionSelectTvChannel.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'tv_channel_select', async () => {
        await SonyBraviaAndroidTvCommunicator.selectInput(args.device, args.channel.uri, { retry: true });
        return true;
      });
      await args.device.checkDevice();
      return result;
    });
    this._flowActionSelectTvChannel.registerArgumentAutocompleteListener('source', async (query, args) => {
      this._autocompleteTvSourceList = await args.device.getAutocompleteTvSourceList();
      return this._autocompleteTvSourceList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });
    this._flowActionSelectTvChannel.registerArgumentAutocompleteListener('channel', async (query, args) => {
      try {
        if (args && args.source && args.source.uri) {
          this._autocompleteTvChannelList = await args.device.getAutocompleteTvChannelList(args.source.uri);
          return this._autocompleteTvChannelList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
        }
        return [];
      } catch (_error) {
        return [];
      }
    });

    this._flowActionIrccCommand = this.homey.flow.getActionCard('ircc_command');
    this._flowActionIrccCommand.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'ircc_command', async () => {
        await SonyBraviaAndroidTvCommunicator.sendCommand(args.device, args.ircc.ircc);
        return true;
      });
      await args.device.checkDevice();
      return result;
    });
    this._flowActionIrccCommand.registerArgumentAutocompleteListener('ircc', async (query, args) => {
      this._autocompleteIrccList = await args.device.getAutocompleteIrccList();
      return this._autocompleteIrccList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });

    this._flowActionAudioOutput = this.homey.flow.getActionCard('audio_output');
    this._flowActionAudioOutput.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'audio_output', async () => {
        await SonyBraviaAndroidTvCommunicator.setSoundSettings(args.device, args.output, { retry: true });
        return true;
      });
      await args.device.checkDevice();
      return result;
    });

    this._flowActionScreenOffTrue = this.homey.flow.getActionCard('screen_off_true');
    this._flowActionScreenOffTrue.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'screen_off_true', async () => {
        await args.device.screenOff(true);
        return true;
      });
      await args.device.checkDevice();
      return result;
    });

    this._flowActionScreenOffFalse = this.homey.flow.getActionCard('screen_off_false');
    this._flowActionScreenOffFalse.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'screen_off_false', async () => {
        await args.device.screenOff(false);
        return true;
      });
      await args.device.checkDevice();
      return result;
    });

    this._flowActionSelectPictureMode = this.homey.flow.getActionCard('picture_mode_select');
    this._flowActionSelectPictureMode.registerRunListener(async (args) => {
      const result = await this.runDeviceCommand(args.device, 'picture_mode_select', async () => {
        await SonyBraviaAndroidTvCommunicator.setPictureQualitySettings(args.device, 'pictureMode', args.mode.id, { retry: true });
        return true;
      });
      await args.device.checkDevice();
      return result;
    });
    this._flowActionSelectPictureMode.registerArgumentAutocompleteListener('mode', async (query, args) => {
      this._autocompletePictureModeList = await args.device.getAutocompleteQualitySettingsList('pictureMode');
      return this._autocompletePictureModeList.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });

    this._flowActionWakeOnLan = this.homey.flow.getActionCard('wake_on_lan');
    this._flowActionWakeOnLan.registerRunListener(async (args) => {
      return this._wakeOnLanAction(args);
    });
    this._flowActionWakeOnLan.registerArgumentAutocompleteListener('device', async (query) => {
      const results = [];
      const devices = this.homey.drivers.getDriver('sony-bravia-android-tv').getDevices();
      for (let i = 0; i < devices.length; i++) {
        results.push({
          name: devices[i].getName(),
          id: devices[i].getData().id,
        });
      }
      return results.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    });

    this.homey.flow.getConditionCard('input').registerRunListener(async (args) => {
      await args.device.checkDevice();
      return args.device.getCapabilityValue('input') === args.input;
    });

    this.homey.flow.getConditionCard('audio_output').registerRunListener(async (args) => {
      await args.device.checkDevice();
      return args.device.getCapabilityValue('audio_output') === args.output;
    });

    this.homey.flow.getConditionCard('available').registerRunListener(async (args) => {
      try {
        await SonyBraviaAndroidTvCommunicator.getDevicePowerState(args.device, { retry: false });
        return true;
      } catch (_err) {
        return false;
      }
    });

    this.homey.flow.getConditionCard('screen_off').registerRunListener(async (args) => {
      await args.device.checkDevice();
      return Boolean(args.device.getCapabilityValue('screen_off'));
    });
  }

  async _wakeOnLanAction(args) {
    const devices = this.homey.drivers.getDriver('sony-bravia-android-tv').getDevices();
    for (let i = 0; i < devices.length; i++) {
      if (devices[i].getData().id === args.device.id) {
        const settings = devices[i].getSettings();
        await this.wakeOnLan(settings.macAddress, settings.ip);
        await SonyBraviaAndroidTvCommunicator.waitUntilReachable(
          devices[i],
          Date.now() + RETRY_WINDOW_MS
        );
        await devices[i].checkDevice();
        return true;
      }
    }
    throw new Error('TV device not found.');
  }

  async wakeOnLan(mac, ip) {
    if (!mac) {
      throw new Error('MAC address is not configured.');
    }
    if (!ip) {
      throw new Error('IP address is not configured.');
    }

    this.log(`Wake-on-LAN → sending magic packet to ${ip}:9`);
    try {
      await wol.wake(mac, { address: ip, port: 9 });
      this.log('Wake-on-LAN → packet sent (local send only, not TV confirmation)');
    } catch (err) {
      this.error(`Wake-on-LAN → error: ${err.message}`);
      throw err;
    }
  }

}

module.exports = SonyBraviaAndroidTvApp;
