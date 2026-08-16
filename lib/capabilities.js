const SonyBraviaAndroidTvCommunicator = require('./sony-bravia-android-tv-communicator');
const { ERROR_STATUS } = require('./http');
const { isAuthOrConfigError, readSettings } = require('./device-config');

const POWER_WINDOW_MS = 20000;

async function powerOn(device) {
  const deadline = Date.now() + POWER_WINDOW_MS;
  const settings = readSettings(device);

  device.log('power-on → REST setPowerStatus');
  try {
    await SonyBraviaAndroidTvCommunicator.setDevicePowerState(device, true, {
      retry: true,
      deadline,
      retryableStatuses: [ERROR_STATUS.HTTP_404, ERROR_STATUS.HTTP_503],
    });
    device.log('power-on → REST accepted');
    return;
  } catch (err) {
    device.log(`power-on → REST ${err.status || 'error'}: ${err.message}`);
    if (isAuthOrConfigError(err)) {
      throw err;
    }

    if (Date.now() < deadline - 1000) {
      try {
        device.log('power-on → IRCC PowerOn');
        await SonyBraviaAndroidTvCommunicator.sendCommand(device, 'PowerOn');
        const state = await SonyBraviaAndroidTvCommunicator.getDevicePowerState(device, { retry: false });
        if (state === 'active') {
          device.log('power-on → IRCC accepted, TV active');
          return;
        }
      } catch (irccErr) {
        device.log(`power-on → IRCC ${irccErr.status || 'error'}: ${irccErr.message}`);
      }
    }

    device.log('power-on → WoL unicast');
    await device.homey.app.wakeOnLan(settings.macAddress, settings.ip);
  }

  device.log('power-on → verification');
  await SonyBraviaAndroidTvCommunicator.waitUntilReachable(device, deadline);
}

module.exports = [
  {
    name: 'onoff',
    function: async (device, _value) => {
      device.log(`setting device power state to: ${_value}`);
      if (_value) {
        await powerOn(device);
      } else {
        await SonyBraviaAndroidTvCommunicator.setDevicePowerState(device, false, { retry: true });
      }

      if (_value !== device.getCapabilityValue('onoff')) {
        await device._clearIntervals();
        await device._checkDeviceInterval({ onoff_state: _value });
      }
    },
  },
  {
    name: 'channel_up',
    function: async (device, _value) => {
      device.log('turning channel up.');
      await SonyBraviaAndroidTvCommunicator.sendCommand(device, 'ChannelUp');
    },
  },
  {
    name: 'channel_down',
    function: async (device, _value) => {
      device.log('turning channel down.');
      await SonyBraviaAndroidTvCommunicator.sendCommand(device, 'ChannelDown');
    },
  },
  {
    name: 'volume_up',
    function: async (device, _value) => {
      device.log('turn volume up.');
      await SonyBraviaAndroidTvCommunicator.setVolume(device, '+1', 'speaker', { retry: false });
    },
  },
  {
    name: 'volume_down',
    function: async (device, _value) => {
      device.log('turn volume down.');
      await SonyBraviaAndroidTvCommunicator.setVolume(device, '-1', 'speaker', { retry: false });
    },
  },
  {
    name: 'volume_mute',
    function: async (device, _value) => {
      device.log(`Set mute: ${_value}`);
      await SonyBraviaAndroidTvCommunicator.setMute(device, _value, { retry: true });
    },
  },
  {
    name: 'volume_set',
    function: async (device, _value) => {
      device.log(`set volume of speaker to ${_value}.`);
      const volume = (_value * device.data.device.speaker.maxVolume).toString();
      await SonyBraviaAndroidTvCommunicator.setVolume(device, volume, 'speaker', { retry: true });
    },
  },
  {
    name: 'input',
    function: async (device, _value) => {
      device.log(`set input to ${_value}.`);
      await SonyBraviaAndroidTvCommunicator.selectInput(device, _value, { retry: true });
    },
  },
  {
    name: 'audio_output',
    function: async (device, _value) => {
      device.log(`set audio_output to ${_value}.`);
      await SonyBraviaAndroidTvCommunicator.setSoundSettings(device, _value, { retry: true });
    },
  },
  {
    name: 'screen_off',
    function: async (device, _value) => {
      device.log(`set screen_off to ${_value}.`);
      await device.screenOff(_value);
    },
  },
];
