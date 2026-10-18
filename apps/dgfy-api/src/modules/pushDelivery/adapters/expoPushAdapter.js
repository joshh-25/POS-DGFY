import axios from 'axios';
import { toSafePushErrorCode } from '../utils/pushTokenSecurity.js';

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getTimeoutMs = () => {
    const configured = Number.parseInt(process.env.EXPO_PUSH_TIMEOUT_MS || '5000', 10);
    return Number.isInteger(configured) ? Math.min(10000, Math.max(1000, configured)) : 5000;
};

const buildHeaders = () => {
    const token = String(process.env.EXPO_ACCESS_TOKEN || '').trim();
    return {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
};

const requestWithRetry = async (url, payload) => {
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
            return await axios.post(url, payload, { headers: buildHeaders(), timeout: getTimeoutMs() });
        } catch (error) {
            const status = Number(error?.response?.status || 0);
            const retryable = !status || status === 429 || status >= 500;
            lastError = error;
            if (!retryable || attempt === MAX_RETRIES) break;
            await sleep(250 * (2 ** attempt));
        }
    }

    const status = Number(lastError?.response?.status || 0);
    const code = status ? `http_${status}` : toSafePushErrorCode(lastError?.code, 'network_error');
    const safeError = new Error(code);
    safeError.code = code;
    safeError.status = status || null;
    throw safeError;
};

const normalizeTicket = (ticket = {}) => {
    const providerError = ticket?.details?.error || ticket?.error || null;
    return {
        status: ticket?.status === 'ok' ? 'accepted' : ticket?.status === 'error' ? 'rejected' : 'failed',
        simulated: false,
        ticketId: ticket?.status === 'ok' ? ticket?.id || null : null,
        errorCode: providerError ? toSafePushErrorCode(providerError) : ticket?.status === 'error' ? 'provider_ticket_error' : null
    };
};

export const expoPushAdapter = Object.freeze({
    async send(messages = []) {
        if (!Array.isArray(messages) || messages.length > 100) {
            const error = new Error('Expo push batches must contain 100 or fewer messages');
            error.code = 'invalid_batch_size';
            throw error;
        }
        if (!messages.length) return [];

        const response = await requestWithRetry(SEND_URL, messages);
        const tickets = response?.data?.data;
        if (!Array.isArray(tickets)) {
            const error = new Error('Expo returned an invalid ticket response');
            error.code = 'invalid_ticket_response';
            throw error;
        }
        return messages.map((_, index) => normalizeTicket(tickets[index]));
    },

    async getReceipts(ticketIds = []) {
        if (!Array.isArray(ticketIds) || ticketIds.length > 1000) {
            const error = new Error('Expo receipt batches must contain 1000 or fewer ticket IDs');
            error.code = 'invalid_receipt_batch_size';
            throw error;
        }
        if (!ticketIds.length) return {};
        const response = await requestWithRetry(RECEIPTS_URL, { ids: ticketIds });
        const receipts = response?.data?.data;
        return receipts && typeof receipts === 'object' && !Array.isArray(receipts) ? receipts : {};
    }
});

export default expoPushAdapter;
