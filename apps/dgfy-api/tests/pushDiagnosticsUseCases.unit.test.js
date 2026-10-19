import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { buildPushDiagnosticsUseCases } from '../src/modules/pushDiagnostics/usecases/pushDiagnosticsUseCases.js';
import { DomainError } from '../src/modules/shared/contracts/domainErrors.js';
import { hashPushDiagnosticEnrollmentCode } from '../src/modules/pushDelivery/utils/pushTokenSecurity.js';

const SECRET = 'unit-test-hash-secret';
const TOKEN = 'ExponentPushToken[diagnostic-device-token]';
const ENV = {
    NODE_ENV: 'production',
    DEPLOY_ENV_LABEL: 'staging',
    PUSH_PROVIDER: 'expo',
    EXPO_ACCESS_TOKEN: 'expo-access-token-SHOULD-NEVER-APPEAR',
    PUSH_TOKEN_HASH_SECRET: SECRET,
    STORE_PUSH_PROOF_SECRET: 'proof-secret-SHOULD-NEVER-APPEAR'
};
const NOW = new Date('2026-10-19T00:00:00.000Z');
const ADMIN = { id: '7d54bdb5-7b8a-4a10-a788-6b8897770001', username: 'ops' };
const REQUEST = { requestId: 'req-12345678', method: 'GET', path: '/api/v1/admin/push-diagnostics/overview' };

const makeUseCases = (overrides = {}) => {
    const readRepository = {
        registrationSummary: jest.fn().mockResolvedValue([{ app: 'storefront', brand: 'dgfy', platform: 'ios', total: 2, active: 1, revoked: 1, last_seen_at: null }]),
        deliveryStatusCounts: jest.fn().mockResolvedValue([]),
        dispatchOutcomeCounts: jest.fn().mockResolvedValue([{ purpose: 'order_status', outcome: 'skipped', reason_code: 'no_active_tokens', count: 3 }]),
        listRegistrations: jest.fn().mockResolvedValue([]),
        listDeliveries: jest.fn().mockResolvedValue([
            { purpose: 'order_status', status: 'accepted', simulated: false, receipt_status: null },
            { purpose: 'order_status', status: 'accepted', simulated: false, receipt_status: 'ok' },
            { purpose: 'order_status', status: 'unconfigured', simulated: false, receipt_status: null }
        ]),
        listDispatchEvents: jest.fn().mockResolvedValue([])
    };
    const auditRepository = { write: jest.fn().mockResolvedValue(undefined) };
    const settingsRepository = {
        listVisibilitySettings: jest.fn().mockResolvedValue([]),
        getEnabledByApp: jest.fn().mockResolvedValue(false),
        setVisibility: jest.fn(async ({ app, enabled }) => ({ app, enabled, changed: true }))
    };
    const deviceRepository = {
        list: jest.fn().mockResolvedValue([]),
        findActiveById: jest.fn().mockResolvedValue({ id: 'device-1', token: TOKEN, platform: 'ios', app: 'storefront', brand: 'dgfy' }),
        revokeById: jest.fn().mockResolvedValue(1),
        countRecentTestSends: jest.fn().mockResolvedValue(0),
        createTestSendLog: jest.fn().mockImplementation(async (row) => ({ id: 'log-1', ...row }))
    };
    const enrollmentRepository = {
        create: jest.fn().mockResolvedValue({}),
        consumeAndEnroll: jest.fn().mockResolvedValue({ status: 'enrolled', device: { id: 'device-1' }, adminId: ADMIN.id })
    };
    const logRepository = { updateById: jest.fn().mockResolvedValue({}) };
    const send = jest.fn().mockResolvedValue([{ status: 'accepted', ticketId: 'ticket-1' }]);
    const adapterResolver = jest.fn(() => ({ mode: 'expo', adapter: { send } }));
    const useCases = buildPushDiagnosticsUseCases({
        readRepository, auditRepository, settingsRepository, deviceRepository, enrollmentRepository, logRepository, adapterResolver,
        env: ENV, now: () => NOW, random: () => 'rand', ...overrides
    });
    return { useCases, readRepository, auditRepository, settingsRepository, deviceRepository, enrollmentRepository, logRepository, send, adapterResolver };
};

const rejects = async (promise, matcher) => {
    const error = await promise.then(() => null, (e) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject(matcher);
    return error;
};

// hashExpoPushToken only falls back to a development secret outside production, and it reads the
// real process NODE_ENV for that decision, so pin it to production like the deployed API.
const originalNodeEnv = process.env.NODE_ENV;
beforeEach(() => { process.env.NODE_ENV = 'production'; });
afterEach(() => { process.env.NODE_ENV = originalNodeEnv; });

describe('push diagnostics use cases', () => {
    describe('overview', () => {
        it('audits access first, labels the environment, and exposes only presence booleans', async () => {
            const { useCases, auditRepository } = makeUseCases();
            const overview = await useCases.getOverview({ admin: ADMIN, request: REQUEST });

            expect(auditRepository.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'push_diagnostics.accessed', admin: ADMIN }));
            expect(overview.environment).toEqual({ label: 'staging', source: 'DEPLOY_ENV_LABEL' });
            expect(overview.readiness).toMatchObject({
                provider: { configured_mode: 'expo', effective_mode: expect.any(String) },
                expo_access_token_present: true,
                token_hash_secret_present: true,
                token_hash_ready: true,
                guest_proof_secret_present: true
            });
            const serialized = JSON.stringify(overview);
            expect(serialized).not.toContain('SHOULD-NEVER-APPEAR');
            expect(serialized).not.toContain(SECRET);
            expect(overview.outcomes.last_24h.dispatch_events[0]).toMatchObject({ reason_code: 'no_active_tokens' });
        });

        it('fails closed when the access cannot be audited', async () => {
            const { useCases, readRepository } = makeUseCases();
            const auditRepository = { write: jest.fn().mockRejectedValue(new Error('audit down')) };
            const failing = buildPushDiagnosticsUseCases({
                readRepository, auditRepository, deviceRepository: {}, enrollmentRepository: {}, logRepository: {},
                adapterResolver: jest.fn(), env: ENV, now: () => NOW
            });
            await expect(failing.getOverview({ admin: ADMIN, request: REQUEST })).rejects.toThrow('audit down');
            expect(readRepository.registrationSummary).not.toHaveBeenCalled();
            expect(useCases).toBeDefined();
        });

        it('reports an unlabeled environment as unknown instead of guessing', async () => {
            const { useCases } = makeUseCases({ env: { ...ENV, DEPLOY_ENV_LABEL: '', SENTRY_ENVIRONMENT: '' } });
            const overview = await useCases.getOverview({ admin: ADMIN, request: REQUEST });
            expect(overview.environment).toEqual({ label: 'unknown', source: 'unset' });
        });

        it('falls back to the Sentry environment name when no deploy label is set', async () => {
            const { useCases } = makeUseCases({ env: { ...ENV, DEPLOY_ENV_LABEL: undefined, SENTRY_ENVIRONMENT: 'STAGING' } });
            const overview = await useCases.getOverview({ admin: ADMIN, request: REQUEST });
            expect(overview.environment).toEqual({ label: 'staging', source: 'SENTRY_ENVIRONMENT' });
        });

        it('flags a missing hash secret in production as not ready', async () => {
            const { useCases } = makeUseCases({ env: { ...ENV, PUSH_TOKEN_HASH_SECRET: '' } });
            const overview = await useCases.getOverview({ admin: ADMIN, request: REQUEST });
            expect(overview.readiness).toMatchObject({ token_hash_secret_present: false, token_hash_ready: false });
        });
    });

    describe('lists', () => {
        it('clamps limits, validates filters, and never accepts free-form filter text', async () => {
            const { useCases, readRepository } = makeUseCases();
            await useCases.listRegistrations({ limit: '9999', platform: 'ios', state: 'active', app: 'storefront' });
            expect(readRepository.listRegistrations).toHaveBeenCalledWith(expect.objectContaining({ limit: 100, platform: 'ios', state: 'active' }));
            await rejects(useCases.listRegistrations({ platform: 'windows' }), { code: 'VALIDATION_FAILED' });
            await rejects(useCases.listRegistrations({ app: "x'; DROP TABLE" }), { code: 'VALIDATION_FAILED' });
            await rejects(useCases.listAttempts({ status: 'nonsense' }), { code: 'VALIDATION_FAILED' });
            await rejects(useCases.listAttempts({ outcome: 'nonsense' }), { code: 'VALIDATION_FAILED' });
        });

        it('maps delivery rows to provider-acceptance vs receipt states and bounds the window', async () => {
            const { useCases, readRepository } = makeUseCases();
            const result = await useCases.listAttempts({ window_hours: '100000' });
            expect(result.deliveries.map((row) => row.state)).toEqual(['accepted_receipt_pending', 'receipt_ok', 'no_provider']);
            const since = readRepository.listDeliveries.mock.calls[0][0].since;
            expect(NOW.getTime() - since.getTime()).toBe(168 * 60 * 60 * 1000);
        });
    });

    describe('mobile app visibility', () => {
        it('lists all supported apps, defaults missing rows to off, and returns only safe fields', async () => {
            const { useCases, settingsRepository } = makeUseCases();
            settingsRepository.listVisibilitySettings.mockResolvedValue([
                { app: 'pos', enabled: true, updated_at: NOW, updated_by_admin_id: ADMIN.id, secret: 'omit' }
            ]);

            const result = await useCases.listAppVisibility();

            expect(result.apps).toEqual([
                { app: 'storefront', enabled: false, updated_at: null },
                { app: 'pos', enabled: true, updated_at: NOW.toISOString() },
                { app: 'fiscalpos', enabled: false, updated_at: null }
            ]);
            expect(JSON.stringify(result)).not.toContain(ADMIN.id);
            expect(JSON.stringify(result)).not.toContain('secret');
        });

        it('validates app and exact boolean request body before delegating a change', async () => {
            const { useCases, settingsRepository } = makeUseCases();
            await expect(useCases.setAppVisibility({ admin: ADMIN, app: 'storefront', body: { enabled: true }, request: REQUEST }))
                .resolves.toEqual({ app: 'storefront', enabled: true, changed: true });
            expect(settingsRepository.setVisibility).toHaveBeenCalledWith({ app: 'storefront', enabled: true, admin: ADMIN, request: REQUEST });

            for (const app of ['Storefront', 'unknown']) {
                await rejects(useCases.setAppVisibility({ app, body: { enabled: true } }), { code: 'VALIDATION_FAILED' });
            }
            for (const body of [undefined, null, [], { enabled: 'true' }, { enabled: true, extra: 1 }, {}]) {
                await rejects(useCases.setAppVisibility({ app: 'storefront', body }), { code: 'VALIDATION_FAILED' });
            }
            expect(settingsRepository.setVisibility).toHaveBeenCalledTimes(1);
        });

        it('fails closed for invalid availability inputs and applies an app setting to any well-formed brand', async () => {
            const { useCases, settingsRepository } = makeUseCases();
            settingsRepository.getEnabledByApp.mockResolvedValue(true);

            for (const query of [
                {}, { app: 'unknown', brand: 'dgfy' }, { app: 'pos' }, { app: 'pos', brand: 'bad brand' },
                { app: 'pos', brand: 'dgfy', extra: 'ignored' }, { app: ['pos'], brand: 'dgfy' }
            ]) {
                await expect(useCases.getAvailability(query)).resolves.toEqual({ enabled: false });
            }
            await expect(useCases.getAvailability({ app: 'pos', brand: 'zzz' })).resolves.toEqual({ enabled: true });
            expect(settingsRepository.getEnabledByApp).toHaveBeenCalledTimes(1);
            expect(settingsRepository.getEnabledByApp).toHaveBeenCalledWith('pos');
        });

        it('maps availability storage errors to a generic 503', async () => {
            const { useCases, settingsRepository } = makeUseCases();
            settingsRepository.getEnabledByApp.mockRejectedValue(new Error('database secret=hidden'));
            await rejects(useCases.getAvailability({ app: 'pos', brand: 'dgfy' }), {
                statusCode: 503,
                code: 'SERVICE_UNAVAILABLE',
                message: 'Push diagnostics availability is temporarily unavailable.'
            });
        });
    });

    describe('enrollment codes and diagnostic devices', () => {
        it('returns the plaintext code once, stores only its keyed hash, and audits creation', async () => {
            const { useCases, enrollmentRepository, auditRepository } = makeUseCases();
            const created = await useCases.createEnrollmentCode({ admin: ADMIN, request: REQUEST });

            expect(created.code.length).toBeGreaterThanOrEqual(32);
            expect(created.expires_at).toBe('2026-10-19T00:10:00.000Z');
            const stored = enrollmentRepository.create.mock.calls[0][0];
            expect(stored.codeHash).toBe(hashPushDiagnosticEnrollmentCode(created.code, { secret: SECRET }));
            expect(JSON.stringify(stored)).not.toContain(created.code);
            const audited = auditRepository.write.mock.calls[0][0];
            expect(audited.action).toBe('push_diagnostics.enrollment_code_created');
            expect(JSON.stringify(audited)).not.toContain(created.code);
        });

        it('lists devices without ever returning the token', async () => {
            const { useCases, deviceRepository } = makeUseCases();
            deviceRepository.list.mockResolvedValue([{ id: 'device-1', token: TOKEN, platform: 'ios', app: 'storefront', brand: 'dgfy', label: null, revoked_at: null, last_seen_at: NOW, created_at: NOW }]);
            const result = await useCases.listDiagnosticDevices();
            expect(JSON.stringify(result)).not.toContain(TOKEN);
            expect(result.items[0]).toMatchObject({ id: 'device-1', state: 'active', ref: expect.stringMatching(/^[0-9a-f]{12}$/) });
        });

        it('revokes an enrolled device with an audit row and 404s unknown ids', async () => {
            const { useCases, deviceRepository, auditRepository } = makeUseCases();
            await expect(useCases.revokeDiagnosticDevice({ admin: ADMIN, id: 'device-1', request: REQUEST })).resolves.toEqual({ revoked: true });
            expect(auditRepository.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'push_diagnostics.device_revoked' }));
            deviceRepository.revokeById.mockResolvedValue(0);
            await rejects(useCases.revokeDiagnosticDevice({ admin: ADMIN, id: 'missing', request: REQUEST }), { code: 'RESOURCE_NOT_FOUND' });
        });
    });

    describe('test send', () => {
        it('sends fixed copy only to the enrolled device, logs it as diagnostic_test, and audits it', async () => {
            const { useCases, send, deviceRepository, logRepository, auditRepository } = makeUseCases();
            const result = await useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: {}, request: REQUEST });

            expect(send).toHaveBeenCalledTimes(1);
            expect(send.mock.calls[0][0]).toEqual([{
                to: TOKEN,
                title: 'DGFY push diagnostic',
                body: 'Test notification from DGFY Platform Admin.',
                data: { event: 'push_diagnostic_test' }
            }]);
            expect(deviceRepository.findActiveById).toHaveBeenCalledWith('device-1');
            expect(deviceRepository.createTestSendLog).toHaveBeenCalledWith(expect.objectContaining({
                purpose: 'diagnostic_test', token_id: 'device-1', tenant_id: null, reference: null, status: 'pending'
            }));
            expect(logRepository.updateById).toHaveBeenCalledWith('log-1', expect.objectContaining({ status: 'accepted', ticket_id: 'ticket-1' }));
            expect(result).toMatchObject({ status: 'accepted', state: 'accepted_receipt_pending', provider_mode: 'expo' });
            const audit = auditRepository.write.mock.calls[0][0];
            expect(audit.action).toBe('push_diagnostics.test_send');
            expect(JSON.stringify(audit)).not.toContain(TOKEN);
            expect(JSON.stringify(result)).not.toContain(TOKEN);
        });

        it.each([
            [{ token: 'ExponentPushToken[arbitrary-customer-token]' }],
            [{ to: 'ExponentPushToken[arbitrary-customer-token]' }],
            [{ device_id: 'someone-else' }]
        ])('rejects any request body (%j) so a token or other target cannot be supplied', async (body) => {
            const { useCases, send, deviceRepository } = makeUseCases();
            await rejects(useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body, request: REQUEST }), { code: 'VALIDATION_FAILED' });
            expect(send).not.toHaveBeenCalled();
            expect(deviceRepository.findActiveById).not.toHaveBeenCalled();
        });

        it('refuses a revoked or unknown device', async () => {
            const { useCases, send, deviceRepository } = makeUseCases();
            deviceRepository.findActiveById.mockResolvedValue(null);
            await rejects(useCases.sendTestNotification({ admin: ADMIN, id: 'revoked', body: {}, request: REQUEST }), { code: 'RESOURCE_NOT_FOUND' });
            expect(send).not.toHaveBeenCalled();
        });

        it('enforces the per-device hourly cap with a 429 before contacting the provider', async () => {
            const { useCases, send, deviceRepository } = makeUseCases();
            deviceRepository.countRecentTestSends.mockResolvedValue(10);
            await rejects(useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: undefined, request: REQUEST }), { statusCode: 429, code: 'PUSH_TEST_SEND_LIMIT' });
            expect(send).not.toHaveBeenCalled();
        });

        it('records an unconfigured provider as no_provider rather than claiming delivery', async () => {
            const send = jest.fn().mockResolvedValue([{ status: 'unconfigured' }]);
            const { useCases, logRepository } = makeUseCases({ adapterResolver: () => ({ mode: 'unconfigured', adapter: { send } }) });
            const result = await useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: {}, request: REQUEST });
            expect(result).toMatchObject({ status: 'unconfigured', state: 'no_provider' });
            expect(logRepository.updateById).toHaveBeenCalledWith('log-1', expect.objectContaining({ status: 'unconfigured', ticket_id: null }));
        });

        it('records a provider exception as a sanitized failure and revokes on DeviceNotRegistered', async () => {
            const send = jest.fn().mockResolvedValue([{ status: 'rejected', errorCode: 'DeviceNotRegistered' }]);
            const { useCases, deviceRepository, logRepository } = makeUseCases({ adapterResolver: () => ({ mode: 'expo', adapter: { send } }) });
            const result = await useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: {}, request: REQUEST });
            expect(result).toMatchObject({ status: 'rejected', state: 'rejected_by_expo', error_code: 'devicenotregistered' });
            expect(deviceRepository.revokeById).toHaveBeenCalledWith('device-1', 'device_not_registered');
            expect(logRepository.updateById).toHaveBeenCalled();

            const throwing = jest.fn().mockRejectedValue(Object.assign(new Error('boom: ExponentPushToken[leak]'), { code: 'http_500' }));
            const second = makeUseCases({ adapterResolver: () => ({ mode: 'expo', adapter: { send: throwing } }) });
            const failed = await second.useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: {}, request: REQUEST });
            expect(failed).toMatchObject({ status: 'failed', state: 'send_failed', error_code: 'http_500' });
            expect(JSON.stringify(failed)).not.toContain('leak');
        });

        it('is unavailable (503) rather than unsafe when the hash secret is missing in production', async () => {
            const { useCases, send } = makeUseCases({ env: { ...ENV, PUSH_TOKEN_HASH_SECRET: '' } });
            await rejects(useCases.sendTestNotification({ admin: ADMIN, id: 'device-1', body: {}, request: REQUEST }), { statusCode: 503 });
            expect(send).not.toHaveBeenCalled();
        });
    });

    describe('device-side enrollment', () => {
        const payload = { code: 'issued-code-value', token: TOKEN, platform: 'ios', app: 'storefront', brand: 'dgfy' };

        it('consumes a valid code with its keyed hash and returns only a pseudonymous ref', async () => {
            const { useCases, enrollmentRepository, auditRepository } = makeUseCases();
            const result = await useCases.enrollDevice(payload);
            expect(enrollmentRepository.consumeAndEnroll).toHaveBeenCalledWith(expect.objectContaining({
                codeHash: hashPushDiagnosticEnrollmentCode('issued-code-value', { secret: SECRET }),
                device: { token: TOKEN, platform: 'ios', app: 'storefront', brand: 'dgfy' }
            }));
            expect(result).toEqual({ enrolled: true, ref: expect.stringMatching(/^[0-9a-f]{12}$/) });
            expect(JSON.stringify(result)).not.toContain(TOKEN);
            expect(auditRepository.write).toHaveBeenCalledWith(expect.objectContaining({ action: 'push_diagnostics.device_enrolled' }));
            expect(JSON.stringify(auditRepository.write.mock.calls)).not.toContain(TOKEN);
        });

        it.each([
            ['unknown / expired / replayed code', { status: 'invalid_code' }]
        ])('gives one identical 404 for %s', async (_label, outcome) => {
            const { useCases, enrollmentRepository, auditRepository } = makeUseCases();
            enrollmentRepository.consumeAndEnroll.mockResolvedValue(outcome);
            await rejects(useCases.enrollDevice(payload), { statusCode: 404, code: 'RESOURCE_NOT_FOUND', message: 'Enrollment code is invalid or expired.' });
            expect(auditRepository.write).not.toHaveBeenCalled();
        });

        it.each([
            [{ ...payload, token: 'not-an-expo-token' }],
            [{ ...payload, platform: 'windows' }],
            [{ ...payload, code: '' }],
            [{ ...payload, extra: 'field' }],
            [{ ...payload, app: 'bad app name!' }],
            [null]
        ])('rejects a malformed request before touching the code store (%j)', async (bad) => {
            const { useCases, enrollmentRepository } = makeUseCases();
            await rejects(useCases.enrollDevice(bad), { code: 'VALIDATION_FAILED' });
            expect(enrollmentRepository.consumeAndEnroll).not.toHaveBeenCalled();
        });
    });
});
