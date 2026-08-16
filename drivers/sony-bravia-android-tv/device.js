const Homey = require('homey');
const SonyBraviaAndroidTvCommunicator = require('../../lib/sony-bravia-android-tv-communicator');
const SonyBraviaCapabilities = require('../../lib/capabilities');

function sortByName(list) {
  return list.sort((a, b) => {
    const left = (a.name || '').toString();
    const right = (b.name || '').toString();
    if (left < right) {
      return -1;
    }
    if (left > right) {
      return 1;
    }
    return 0;
  });
}

class SonyBraviaAndroidTvDevice extends Homey.Device {

  async onInit() {
    this._pollInFlight = false;
    this._commandInFlight = 0;
    await this._checkCapabilities();
    this.data = this._generateDeviceObject();

    this.log(`${this.getName()} initialized.`);

    this._setCapabilityListeners();
    this._setFlowTrigger();
    this._checkDeviceInterval();
  }

  async _checkCapabilities() {
    if (!this.hasCapability('volume_set')) {
      await this.addCapability('volume_set');
    }
    if (!this.hasCapability('input')) {
      await this.addCapability('input');
    }
    if (!this.hasCapability('playing_content')) {
      await this.addCapability('playing_content');
    }
    if (!this.hasCapability('audio_output')) {
      await this.addCapability('audio_output');
    }
    if (!this.hasCapability('screen_off')) {
      await this.addCapability('screen_off');
    }
  }

  onUninit() {
    this._clearIntervals();
    this.log(`${this.getName()} unInit().`);
  }

  onDeleted() {
    this._clearIntervals();
    this.log(`${this.getName()} deleting.`);
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log(`[Device] ${this.getName()}: ${this.getData().id} settings were changed: ${changedKeys}`);
    this.data.settings = newSettings;
    this._clearIntervals();
    this._checkDeviceInterval({
      interval: newSettings.polling,
      unit: newSettings.polling_unit,
      interval_off: newSettings.polling_off,
      interval_off_active: newSettings.polling_off_active,
    });
  }

  _generateDeviceObject() {
    return {
      name: this.getName(),
      data: this.getData(),
      state: this.getState(),
      settings: this.getSettings(),
      capabilities: this.getCapabilities(),
      device: {
        speaker: {
          maxVolume: 100,
          minVolume: 0,
        },
        headphone: {
          maxVolume: 100,
          minVolume: 0,
        },
      },
    };
  }

  async _setCapabilityListeners() {
    SonyBraviaCapabilities.forEach((capability) => {
      this.registerCapabilityListener(capability.name, async (value) => {
        this._commandInFlight += 1;
        try {
          await capability.function(this, value);
        } catch (err) {
          this.log(`${this.getName()} capability listener ${capability.name} could not be executed: `, err.message);
          throw new Error(err.message);
        } finally {
          this._commandInFlight = Math.max(0, this._commandInFlight - 1);
        }
        this.homey.setTimeout(() => this.checkDevice(), 1000);
        return true;
      });
    });
  }

  async _setFlowTrigger() {
    this._flowTriggerInputChanged = this.homey.flow.getDeviceTriggerCard('input_changed');
    this._flowTriggerPlayingContentChanged = this.homey.flow.getDeviceTriggerCard('playing_content_changed');
  }

  async _checkDeviceInterval({
    interval = this.getSettings().polling,
    unit = this.getSettings().polling_unit,
    interval_off = this.getSettings().polling_off,
    interval_off_active = this.getSettings().polling_off_active,
    onoff_state = undefined,
  } = {}) {
    if (onoff_state === undefined) {
      onoff_state = this.getCapabilityValue('onoff');
    }
    interval = interval * 1000;
    if (unit === 'min') {
      interval = interval * 60;
    }
    if (!onoff_state && interval_off_active) {
      interval = interval_off * 1000 * 60;
    }
    try {
      this.log(`[Device] ${this.getName()}: onPollInterval =>`, interval);
      this.onPollInterval = this.homey.setInterval(() => this.checkDevice(), interval);
      this.checkDevice();
    } catch (error) {
      this.log(error);
    }
  }

  async _clearIntervals() {
    try {
      this.log(`[Device] ${this.getName()}: clearIntervals`);
      if (this.onPollInterval) {
        this.homey.clearInterval(this.onPollInterval);
        this.onPollInterval = null;
      }
    } catch (error) {
      this.log(error);
    }
  }

  async beginUserCommand() {
    this._commandInFlight += 1;
  }

  async endUserCommand() {
    this._commandInFlight = Math.max(0, this._commandInFlight - 1);
  }

  async checkDevice() {
    if (this._pollInFlight || this._commandInFlight > 0) {
      return;
    }
    this._pollInFlight = true;
    try {
      await this._pollOnce();
    } catch (err) {
      this.error(`poll error: ${err.message}`);
    } finally {
      this._pollInFlight = false;
    }
  }

  async _pollOnce() {
    const pollOptions = { retry: false };
    let powerStatus;

    try {
      powerStatus = await SonyBraviaAndroidTvCommunicator.getDevicePowerState(this, pollOptions);
    } catch (err) {
      this.log(`poll: TV not reachable (${err.status || err.message})`);
      if (this.getCapabilityValue('onoff') !== false) {
        await this.setCapabilityValue('onoff', false);
        this._clearIntervals();
        this._checkDeviceInterval({ onoff_state: false });
      }
      return;
    }

    const isOn = powerStatus === 'active';
    if (isOn !== this.getCapabilityValue('onoff')) {
      this._clearIntervals();
      this._checkDeviceInterval({ onoff_state: isOn });
    }
    await this.setCapabilityValue('onoff', isOn);

    if (!isOn) {
      return;
    }

    await this._checkDeviceVolume(pollOptions);
    await this._checkPlayingContent(pollOptions);
    await this._checkSoundSettings(pollOptions);
    await this._checkPowerSavingMode(pollOptions);
  }

  async _checkPowerSavingMode(options = { retry: false }) {
    try {
      const state = await SonyBraviaAndroidTvCommunicator.getPowerSavingMode(this, options);
      if (state && state.mode) {
        if (state.mode === 'pictureOff') {
          await this.setCapabilityValue('screen_off', true);
        } else {
          await this.setCapabilityValue('screen_off', false);
          await this.setStoreValue('power_saving_mode', state.mode);
        }
      }
    } catch (_err) {
      // Keep last known screen_off during poll failures.
    }
  }

  async _checkDeviceVolume(options = { retry: false }) {
    try {
      const state = await SonyBraviaAndroidTvCommunicator.getVolume(this, 'speaker', options);
      this.data.device.speaker.maxVolume = state.maxVolume;
      this.data.device.speaker.minVolume = state.minVolume;
      const volume = state.volume / state.maxVolume;
      await this.setCapabilityValue('volume_set', volume);
      await this.setCapabilityValue('volume_mute', state.mute);
    } catch (_err) {
      // Keep last known volume during poll failures.
    }
  }

  async _checkSoundSettings(options = { retry: false }) {
    try {
      const state = await SonyBraviaAndroidTvCommunicator.getSoundSettings(this, options);
      if (state && state.currentValue) {
        await this.setCapabilityValue('audio_output', state.currentValue);
      } else {
        await this.setCapabilityValue('audio_output', null);
      }
    } catch (_err) {
      // Keep last known audio output during poll failures.
    }
  }

  async _checkPlayingContent(options = { retry: false }) {
    let playingContent;
    try {
      playingContent = await SonyBraviaAndroidTvCommunicator.getPlayingContentInfo(this, options);
    } catch (_err) {
      playingContent = null;
    }

    const input = this._inputFromPlayingContent(playingContent);
    if (this.getCapabilityValue('input') !== input.input_capability_value) {
      await this.setCapabilityValue('input', input.input_capability_value);
      await this._flowTriggerInputChanged.trigger(
        this,
        {
          input: input.input_uri,
          input_text: input.input_title,
        },
        {}
      );
    }

    const playingContentString = JSON.stringify(playingContent || {});
    if (this.getCapabilityValue('playing_content') !== playingContentString) {
      await this.setCapabilityValue('playing_content', playingContentString);

      const playingContentTokens = {
        uri: '',
        source: '',
        title: '',
        disp_num: '',
        triplet_str: '',
        program_title: '',
        start_date_time: '',
        duration: 0,
      };
      if (playingContent && playingContent.uri) {
        playingContentTokens.uri = playingContent.uri;
      }
      if (playingContent && playingContent.source) {
        playingContentTokens.source = playingContent.source;
      }
      if (playingContent && playingContent.title) {
        playingContentTokens.title = playingContent.title;
      }
      if (playingContent && playingContent.disp_num) {
        playingContentTokens.disp_num = playingContent.disp_num;
      }
      if (playingContent && playingContent.triplet_str) {
        playingContentTokens.triplet_str = playingContent.triplet_str;
      }
      if (playingContent && playingContent.program_title) {
        playingContentTokens.program_title = playingContent.program_title;
      }
      if (playingContent && playingContent.start_date_time) {
        playingContentTokens.start_date_time = playingContent.start_date_time;
      }
      if (playingContent && playingContent.duration) {
        playingContentTokens.duration = playingContent.duration;
      }
      await this._flowTriggerPlayingContentChanged.trigger(
        this,
        playingContentTokens,
        {}
      );
    }
  }

  _inputFromPlayingContent(state) {
    const input = {
      input_uri: '',
      input_title: '',
      input_capability_value: null,
    };

    if (!state) {
      return input;
    }

    try {
      if (state.source && state.source.startsWith('tv:')) {
        input.input_uri = state.source;
      } else {
        input.input_uri = state.uri;
      }

      const match = this.homey.app.manifest.capabilities.input.values.filter((entry) => entry.id === input.input_uri)[0];
      if (match && match.title !== undefined) {
        input.input_title = match.title;
        input.input_capability_value = input.input_uri;
      }
    } catch (_err) {
      // Unknown input stays empty.
    }
    return input;
  }

  async getPlayingContentInfoInput() {
    let state;
    try {
      state = await SonyBraviaAndroidTvCommunicator.getPlayingContentInfo(this, { retry: false });
    } catch (_err) {
      state = undefined;
    }
    return this._inputFromPlayingContent(state);
  }

  async getAutocompleteAppList() {
    const result = [];
    const apps = await SonyBraviaAndroidTvCommunicator.getApps(this);
    for (let i = 0; i < apps.length; i++) {
      result.push({
        name: apps[i].title,
        uri: apps[i].uri,
        image: apps[i].icon,
      });
    }
    return sortByName(result);
  }

  async getAutocompleteInputList() {
    const result = [];
    const sources = await SonyBraviaAndroidTvCommunicator.getSourcess(this, 'tv');
    for (let i = 0; i < sources.length; i++) {
      result.push({
        name: sources[i].source.toUpperCase(),
        uri: sources[i].source,
      });
    }

    const inputs = await SonyBraviaAndroidTvCommunicator.getCurrentExternalInputs(this);
    for (let i = 0; i < inputs.length; i++) {
      result.push({
        name: inputs[i].title,
        uri: inputs[i].uri,
      });
    }

    return sortByName(result);
  }

  async getAutocompleteTvSourceList() {
    const result = [];
    const sources = await SonyBraviaAndroidTvCommunicator.getSourcess(this, 'tv');
    for (let i = 0; i < sources.length; i++) {
      result.push({
        name: sources[i].source.toUpperCase(),
        uri: sources[i].source,
      });
    }
    return sortByName(result);
  }

  async getAutocompleteTvChannelList(source) {
    const result = [];
    const inputs = await SonyBraviaAndroidTvCommunicator.getInputs(this, source);
    for (let i = 0; i < inputs.length; i++) {
      result.push({
        name: inputs[i].title,
        uri: inputs[i].uri,
      });
    }
    return sortByName(result);
  }

  async getAutocompleteIrccList() {
    const result = [];
    const list = await SonyBraviaAndroidTvCommunicator.getIrccCommands(this);
    for (let i = 0; i < list.length; i++) {
      result.push({
        name: list[i].name,
        ircc: list[i].value,
      });
    }
    return sortByName(result);
  }

  async getAutocompleteQualitySettingsList(type) {
    const result = [];
    const list = await SonyBraviaAndroidTvCommunicator.getPictureQualitySettings(this, type);
    for (let i = 0; i < list.length; i++) {
      if (list[i].target === type) {
        for (let j = 0; j < list[i].candidate.length; j++) {
          result.push({
            name: list[i].candidate[j].value,
            id: list[i].candidate[j].value,
          });
        }
      }
    }
    return sortByName(result);
  }

  async screenOff(_value) {
    if (_value === true) {
      const lastMode = await SonyBraviaAndroidTvCommunicator.getPowerSavingMode(this, { retry: true });
      await this.setStoreValue('power_saving_mode', lastMode.mode);
      return SonyBraviaAndroidTvCommunicator.setPowerSavingMode(this, 'pictureOff', { retry: true });
    }

    const lastMode = this.getStoreValue('power_saving_mode');
    if (lastMode !== undefined && lastMode !== 'pictureOff') {
      return SonyBraviaAndroidTvCommunicator.setPowerSavingMode(this, lastMode, { retry: true });
    }
    return SonyBraviaAndroidTvCommunicator.setPowerSavingMode(this, 'low', { retry: true });
  }

}

module.exports = SonyBraviaAndroidTvDevice;
