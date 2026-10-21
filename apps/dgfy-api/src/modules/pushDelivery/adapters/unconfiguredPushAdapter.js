export const unconfiguredPushAdapter = Object.freeze({
    async send(messages = []) {
        return messages.map(() => ({ status: 'unconfigured', simulated: false, ticketId: null }));
    },
    async getReceipts() {
        return {};
    }
});

export default unconfiguredPushAdapter;
