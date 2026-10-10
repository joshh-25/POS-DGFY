export const unconfiguredSmsAdapter = {
  async send() {
    return { status: 'unconfigured', simulated: false, errorCode: 'SMS_PROVIDER_UNCONFIGURED' };
  }
};

export default unconfiguredSmsAdapter;
