const calls = [];

export const fakeSmsAdapter = {
  async send(input) {
    calls.push({ ...input });
    return { status: 'accepted', simulated: true, providerMessageId: null };
  }
};

export const getFakeSmsCalls = () => calls.map((call) => ({ ...call }));
export const resetFakeSmsCalls = () => { calls.length = 0; };

export default fakeSmsAdapter;
