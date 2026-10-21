import { afterEach, describe, expect, it, jest } from '@jest/globals';

const post = jest.fn();
jest.unstable_mockModule('axios', () => ({ default: { post } }));
const { expoPushAdapter } = await import('../src/modules/pushDelivery/adapters/expoPushAdapter.js');
const { resolvePushAdapter } = await import('../src/modules/pushDelivery/adapters/index.js');
const { fakePushAdapter } = await import('../src/modules/pushDelivery/adapters/fakePushAdapter.js');
const { unconfiguredPushAdapter } = await import('../src/modules/pushDelivery/adapters/unconfiguredPushAdapter.js');

afterEach(() => {
    jest.clearAllMocks();
});

describe('push provider adapters', () => {
    it('maps Expo tickets in request order and enforces the 100-message batch limit', async () => {
        post.mockResolvedValue({ data: { data: [{ status: 'ok', id: 'ticket-1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] } });
        await expect(expoPushAdapter.send([{ to: 'token-1' }, { to: 'token-2' }])).resolves.toEqual([
            { status: 'accepted', simulated: false, ticketId: 'ticket-1', errorCode: null },
            { status: 'rejected', simulated: false, ticketId: null, errorCode: 'devicenotregistered' }
        ]);
        await expect(expoPushAdapter.send(Array.from({ length: 101 }, () => ({ to: 'token' }))))
            .rejects.toMatchObject({ code: 'invalid_batch_size' });
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('does not retry an HTTP 400 response', async () => {
        post.mockRejectedValue(Object.assign(new Error('bad request'), { response: { status: 400 } }));
        await expect(expoPushAdapter.send([{ to: 'token' }])).rejects.toMatchObject({ code: 'http_400' });
        expect(post).toHaveBeenCalledTimes(1);
    });

    it('blocks fake delivery in production and marks non-production fake results as simulated', async () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousProvider = process.env.PUSH_PROVIDER;
        try {
            process.env.NODE_ENV = 'production';
            process.env.PUSH_PROVIDER = 'fake';
            expect(resolvePushAdapter().mode).toBe('unconfigured');

            process.env.NODE_ENV = 'test';
            const fake = resolvePushAdapter();
            expect(fake.mode).toBe('fake');
            await expect(fakePushAdapter.send([{ to: 'token' }])).resolves.toEqual([
                { status: 'accepted', simulated: true, ticketId: null }
            ]);
        } finally {
            if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = previousNodeEnv;
            if (previousProvider === undefined) delete process.env.PUSH_PROVIDER;
            else process.env.PUSH_PROVIDER = previousProvider;
        }
    });

    it('marks unconfigured provider results as not delivered', async () => {
        await expect(unconfiguredPushAdapter.send([{ to: 'token' }])).resolves.toEqual([
            { status: 'unconfigured', simulated: false, ticketId: null }
        ]);
    });
});
