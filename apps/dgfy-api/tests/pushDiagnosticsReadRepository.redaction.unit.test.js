import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const TOKEN = 'ExponentPushToken[customer-device-secret-token]';
const findAllToken = jest.fn();
const findAllLog = jest.fn();
const findAllEvent = jest.fn();
const plain = (value) => ({ get: () => value });

jest.unstable_mockModule('../src/models/index.js', () => ({
    PushDeviceToken: { findAll: findAllToken },
    PushDeliveryLog: { findAll: findAllLog },
    PushDispatchEvent: { findAll: findAllEvent }
}));

const { pushDiagnosticsReadRepository } = await import('../src/modules/pushDiagnostics/repositories/pushDiagnosticsReadRepository.js');

beforeEach(() => {
    process.env.PUSH_TOKEN_HASH_SECRET = 'redaction-test-secret';
    jest.clearAllMocks();
});

describe('push diagnostics read repository redaction', () => {
    it('returns a pseudonymous ref and owner type for registrations, never the token or owner ids', async () => {
        findAllToken.mockResolvedValue([plain({
            token: TOKEN, platform: 'android', app: 'storefront', brand: 'dgfy',
            dgfy_account_id: 'acct-uuid-1', guest_tenant_id: null, staff_tenant_id: null,
            last_seen_at: new Date('2026-10-18T00:00:00Z'), revoked_at: null, revoke_reason: null, created_at: new Date('2026-10-01T00:00:00Z')
        })]);
        const [row] = await pushDiagnosticsReadRepository.listRegistrations({ limit: 10 });
        expect(row).toMatchObject({ owner_type: 'account', platform: 'android', state: 'active', ref: expect.stringMatching(/^[0-9a-f]{12}$/) });
        const serialized = JSON.stringify(row);
        expect(serialized).not.toContain(TOKEN);
        expect(serialized).not.toContain('acct-uuid-1');
        expect(serialized).not.toMatch(/token"|dgfy_account_id|guest_tenant_id|staff_user_id/);
    });

    it('derives the same ref as the delivery log token hash prefix so rows can be correlated', async () => {
        const { hashExpoPushToken } = await import('../src/modules/pushDelivery/utils/pushTokenSecurity.js');
        const hash = hashExpoPushToken(TOKEN);
        findAllToken.mockResolvedValue([plain({ token: TOKEN, platform: 'ios', app: 'a', brand: 'b', staff_tenant_id: 't', last_seen_at: new Date(), revoked_at: null, created_at: new Date() })]);
        findAllLog.mockResolvedValue([plain({
            purpose: 'order_status', status: 'accepted', simulated: false, ticket_id: 'ticket-secret', receipt_status: 'ok',
            receipt_checked_at: null, error_code: null, tenant_id: 'tenant-1', reference: 'SK-TRACKING-PIN', token_hash: hash, sent_at: new Date()
        })]);
        const [reg] = await pushDiagnosticsReadRepository.listRegistrations();
        const [delivery] = await pushDiagnosticsReadRepository.listDeliveries({ since: new Date(0) });
        expect(delivery.registration_ref).toBe(reg.ref);
    });

    it('hides tracking PINs, tenant ids and provider ticket ids in delivery attempts', async () => {
        findAllLog.mockResolvedValue([plain({
            purpose: 'order_status', status: 'accepted', simulated: false, ticket_id: 'ticket-secret', receipt_status: null,
            receipt_checked_at: null, error_code: null, tenant_id: 'tenant-uuid-9', reference: 'SK-TRACKING-PIN', token_hash: 'f'.repeat(64), sent_at: new Date()
        })]);
        const [row] = await pushDiagnosticsReadRepository.listDeliveries({ since: new Date(0) });
        expect(row).toMatchObject({ ticket_issued: true, correlation_ref: expect.stringMatching(/^[0-9a-f]{12}$/), registration_ref: 'f'.repeat(12) });
        const serialized = JSON.stringify(row);
        for (const secret of ['ticket-secret', 'tenant-uuid-9', 'SK-TRACKING-PIN', 'f'.repeat(64)]) expect(serialized).not.toContain(secret);
    });

    it('correlates attempts and dispatch decisions for the same order without exposing it', async () => {
        const created = new Date();
        findAllLog.mockResolvedValue([plain({ purpose: 'order_status', status: 'accepted', simulated: false, tenant_id: 't1', reference: 'PIN1', token_hash: 'a'.repeat(64), sent_at: created })]);
        findAllEvent.mockResolvedValue([plain({ purpose: 'order_status', outcome: 'dispatched', reason_code: 'dispatched', eligible_token_count: 1, tenant_id: 't1', reference: 'PIN1', created_at: created })]);
        const [delivery] = await pushDiagnosticsReadRepository.listDeliveries({ since: new Date(0) });
        const [event] = await pushDiagnosticsReadRepository.listDispatchEvents({ since: new Date(0) });
        expect(event.correlation_ref).toBe(delivery.correlation_ref);
        expect(event.correlation_ref).not.toBeNull();
        expect(JSON.stringify(event)).not.toMatch(/PIN1|"t1"/);
    });

    it('returns a null correlation ref for diagnostic test sends that have no order', async () => {
        findAllLog.mockResolvedValue([plain({ purpose: 'diagnostic_test', status: 'accepted', simulated: false, tenant_id: null, reference: null, token_hash: 'a'.repeat(64), sent_at: new Date() })]);
        const [row] = await pushDiagnosticsReadRepository.listDeliveries({ since: new Date(0) });
        expect(row.correlation_ref).toBeNull();
    });
});
