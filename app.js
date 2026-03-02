'use strict';

const Homey = require('homey');

class ZwemwaterApp extends Homey.App {
  async onInit() {
    this.log('Zwemwater app initialized');

    // Temperature threshold trigger
    const tempThresholdTrigger = this.homey.flow.getDeviceTriggerCard('water_temperature_threshold');
    tempThresholdTrigger.registerRunListener(async (args, state) => {
      return state.temperature >= args.threshold || state.temperature <= args.threshold;
    });

    // Condition: swim advice is ...
    const adviceCondition = this.homey.flow.getConditionCard('swim_advice_is');
    adviceCondition.registerRunListener(async (args) => {
      return args.device.getCapabilityValue('swim_advice') === args.advice;
    });

    // Condition: water temperature comparison
    const tempCondition = this.homey.flow.getConditionCard('water_temperature_compare');
    tempCondition.registerRunListener(async (args) => {
      const current = args.device.getCapabilityValue('measure_temperature.water');
      if (current === null) return false;
      return args.comparison === 'gt' ? current > args.temperature : current < args.temperature;
    });

    // Action: refresh data
    const refreshAction = this.homey.flow.getActionCard('refresh_data');
    refreshAction.registerRunListener(async (args) => {
      await args.device.refreshData();
    });
  }
}

module.exports = ZwemwaterApp;
