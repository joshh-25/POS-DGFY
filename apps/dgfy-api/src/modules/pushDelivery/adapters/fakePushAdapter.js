export const fakePushAdapter = Object.freeze({
    async send(messages = []) {
        return messages.map(() => ({ status: 'accepted', simulated: true, ticketId: null }));
    },
    async getReceipts() {
        return {};
    }
});

export default fakePushAdapter;
