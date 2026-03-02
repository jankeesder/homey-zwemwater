'use strict';

const Homey = require('homey');
const WaterkaartScraper = require('../../lib/waterkaart-scraper');

const QUALITY_MAP = {
  goed: 'good',
  waarschuwing: 'warning',
  'negatief zwemadvies': 'negative',
  zwemverbod: 'prohibited',
};

class SwimmingLocationDevice extends Homey.Device {
  async onInit() {
    this._scraper = new WaterkaartScraper(this.log.bind(this));
    this._refreshTimeout = null;

    // Remove old capabilities from previous versions
    for (const cap of ['swim_advice_text', 'measure_bacteria_ecoli', 'measure_bacteria_bluealgae',
      'last_measurement_date', 'next_measurement_date', 'water_temperature_trend', 'location_info']) {
      if (this.hasCapability(cap)) {
        await this.removeCapability(cap).catch(() => {});
      }
    }

    await this.refreshData();
    this._scheduleRefresh();
  }

  async onUninit() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
      this._refreshTimeout = null;
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('refresh_interval')) {
      this._scheduleRefresh();
    }
  }

  _scheduleRefresh() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
    const intervalMs = Number(this.getSetting('refresh_interval') || 21600) * 1000;
    this._refreshTimeout = setTimeout(async () => {
      try {
        await this.refreshData();
      } catch (err) {
        this.error('Refresh failed:', err.message);
      }
      this._scheduleRefresh();
    }, intervalMs);
  }

  async refreshData() {
    const urlName = this.getSetting('url_name');
    if (!urlName) {
      this.error('No url_name setting');
      return;
    }

    try {
      const detail = await this._scraper.getLocationDetail(urlName);
      if (!detail) {
        this.error('No data from waterkaart.net');
        return;
      }

      // Measurement time
      if (detail.measurementTime) {
        await this.setCapabilityValue('measurement_time', detail.measurementTime);
      }

      // Water temperature
      if (detail.temperature != null) {
        await this.setCapabilityValue('measure_temperature.water', detail.temperature);

        await this.homey.flow.getDeviceTriggerCard('water_temperature_threshold').trigger(this, {
          temperature: detail.temperature,
          location_name: this.getName(),
        }).catch(() => {});
      }

      // Swim advice
      if (detail.quality) {
        const advice = QUALITY_MAP[detail.quality.toLowerCase()] || 'good';
        const prevAdvice = this.getCapabilityValue('swim_advice');

        await this.setCapabilityValue('swim_advice', advice);

        if (prevAdvice && prevAdvice !== advice) {
          const STATUS_TEXT = { good: 'Goed', warning: 'Waarschuwing', negative: 'Negatief zwemadvies', prohibited: 'Zwemverbod' };
          await this.homey.flow.getDeviceTriggerCard('swim_advice_changed').trigger(this, {
            advice: STATUS_TEXT[advice] || advice,
            previous_advice: STATUS_TEXT[prevAdvice] || prevAdvice,
            location_name: this.getName(),
          }).catch(() => {});
        }
      }

      this.log(`Data refreshed: ${this.getName()} — ${detail.temperature}°C, ${detail.quality} (${detail.measurementTime})`);
    } catch (err) {
      this.error('Refresh error:', err.message);
    }
  }
}

module.exports = SwimmingLocationDevice;
