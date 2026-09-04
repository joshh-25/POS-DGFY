// Unit tests for the #450 (Phase 199) revocation audit trail additions to
// buildUpdateAffiliateEnrollmentUseCase (backend/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js).
//
// A new file, not an extension of dgfyAffiliatePriceRuleUseCases.unit.test.js - that file's own
// header scopes it to the Phase 1 pricing rule engine. No database is used: the use case builder
// accepts `repository` as an injectable parameter, so a plain in-memory fake stands in for
// dgfyAffiliateRepository.js, mirroring dgfyAffiliateCashoutUseCases.unit.test.js (Phase 197).

import { jest } from '@jest/globals';
import { buildUpdateAffiliateEnrollmentUseCase } from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';

const makeFakeRepository = ({ enrollments = [] } = {}) => {
    let findEnrollmentByIdCalls = 0;
    return {
        get findEnrollmentByIdCallCount() {
            return findEnrollmentByIdCalls;
        },
        async findEnrollmentById(tenantId, enrollmentId) {
            findEnrollmentByIdCalls += 1;
            return enrollments.find((e) => e.tenant_id === tenantId && String(e.enrollment_id) === String(enrollmentId)) || null;
        },
        async updateEnrollment(tenantId, enrollmentId, updates) {
            const enrollment = enrollments.find((e) => e.tenant_id === tenantId && String(e.enrollment_id) === String(enrollmentId));
            if (!enrollment) return null;
            Object.assign(enrollment, updates);
            return enrollment;
        }
    };
};

describe('buildUpdateAffiliateEnrollmentUseCase — revocation audit trail (#450 Phase 199)', () => {
    test('1: active -> revoked stamps all three columns', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 1, status: 'active', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 1,
            body: { status: 'revoked', revocation_reason: 'fraud' },
            revokedBy: 42
        });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.status).toBe('revoked');
        expect(result.data.enrollment.revoked_at).toBeInstanceOf(Date);
        expect(result.data.enrollment.revoked_by).toBe(42);
        expect(result.data.enrollment.revocation_reason).toBe('fraud');
    });

    test('2: active -> suspended stamps with no reason supplied', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 2, status: 'active', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 2,
            body: { status: 'suspended' },
            revokedBy: 7
        });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_at).toBeInstanceOf(Date);
        expect(result.data.enrollment.revoked_by).toBe(7);
        expect(result.data.enrollment.revocation_reason).toBeNull();
    });

    // #1191 (Phase 207): reactivation via this generic PATCH is no longer possible at all - the
    // new AFFILIATE_REACTIVATION_MOVED guard rejects `status: 'active'` before the stamp-preserving
    // behaviour these two tests originally exercised is ever reached. Retitled and reassigned to
    // assert the rejection rather than deleted, so the "reactivation preserves the stamp" property
    // stays covered - now by dgfyAffiliateReactivationUseCase.unit.test.js test 8, which asserts it
    // against the real reactivation endpoint instead of the now-removed PATCH path.
    test('3: suspended -> active via PATCH is rejected (#1191), not a reactivation path anymore', async () => {
        const stampedAt = new Date('2026-08-01T00:00:00.000Z');
        const enrollments = [{ tenant_id: TENANT_ID, enrollment_id: 3, status: 'suspended', revoked_at: stampedAt, revoked_by: 5, revocation_reason: 'past reason' }];
        const repository = makeFakeRepository({ enrollments });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 3, body: { status: 'active' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toMatchObject({ reason_code: 'AFFILIATE_REACTIVATION_MOVED' });
        expect(enrollments[0].status).toBe('suspended');
    });

    test('4: revoked -> active via PATCH is rejected (#1191), not a reactivation path anymore', async () => {
        const stampedAt = new Date('2026-08-01T00:00:00.000Z');
        const enrollments = [{ tenant_id: TENANT_ID, enrollment_id: 4, status: 'revoked', revoked_at: stampedAt, revoked_by: 9, revocation_reason: 'past reason' }];
        const repository = makeFakeRepository({ enrollments });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 4, body: { status: 'active' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toMatchObject({ reason_code: 'AFFILIATE_REACTIVATION_MOVED' });
        expect(enrollments[0].status).toBe('revoked');
    });

    test('5: PATCH commission_type only never triggers the prior-status read and never stamps', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 5, status: 'active', commission_type: null, revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 5, body: { commission_type: 'NONE' } });
        expect(result.success).toBe(true);
        expect(repository.findEnrollmentByIdCallCount).toBe(0);
        expect(result.data.enrollment.revoked_at).toBeNull();
        expect(result.data.enrollment.revoked_by).toBeNull();
        expect(result.data.enrollment.revocation_reason).toBeNull();
    });

    test('6: revoked -> revoked (idempotent re-PATCH) does not re-stamp, preserving the original revoked_at', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
        const stampedAt = new Date('2026-08-01T00:00:00.000Z');
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 6, status: 'revoked', revoked_at: stampedAt, revoked_by: 1, revocation_reason: 'original' }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });

        jest.setSystemTime(new Date('2026-08-05T00:00:00.000Z'));
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 6, body: { status: 'revoked' } });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_at).toBe(stampedAt);
        expect(result.data.enrollment.revoked_at.toISOString()).toBe('2026-08-01T00:00:00.000Z');
        jest.useRealTimers();
    });

    test('7: suspended -> revoked advances the stamp past the prior revoked_at', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-08-01T00:00:00.000Z'));
        const stampedAt = new Date('2026-08-01T00:00:00.000Z');
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 7, status: 'suspended', revoked_at: stampedAt, revoked_by: 1, revocation_reason: 'first' }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });

        jest.setSystemTime(new Date('2026-08-05T00:00:00.000Z'));
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 7,
            body: { status: 'revoked', revocation_reason: 'escalated' },
            revokedBy: 99
        });

        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_at.toISOString()).toBe('2026-08-05T00:00:00.000Z');
        expect(result.data.enrollment.revoked_at).not.toBe(stampedAt);
        expect(result.data.enrollment.revoked_by).toBe(99);
        expect(result.data.enrollment.revocation_reason).toBe('escalated');
        jest.useRealTimers();
    });

    // #1191 (Phase 207): status: 'active' is now rejected by the earlier AFFILIATE_REACTIVATION_MOVED
    // guard, so the D7 revocation_reason guard below is unreachable for this body shape - it stays
    // covered by test 9 (reason-only body) instead. Assertions are unchanged from before Phase 207.
    test('8: status: active is rejected (422) before the revocation_reason guard is reached (#1191)', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 8, status: 'suspended', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 8,
            body: { status: 'active', revocation_reason: 'x' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('9: revocation_reason alone does not satisfy the "No updatable fields" check', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 9, status: 'active', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 9, body: { revocation_reason: 'x' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.message).toMatch(/No updatable fields were provided\./);
    });

    test('10: active -> revoked with revokedBy omitted stamps revoked_by as null, not a crash', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 10, status: 'active', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 10, body: { status: 'revoked' } });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.revoked_by).toBeNull();
        expect(result.data.enrollment.revoked_at).toBeInstanceOf(Date);
    });

    test('11: revocation_reason longer than 500 chars is truncated to 500 on persist', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 11, status: 'active', revoked_at: null, revoked_by: null, revocation_reason: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const longReason = 'x'.repeat(600);
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 11,
            body: { status: 'revoked', revocation_reason: longReason },
            revokedBy: 1
        });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.revocation_reason).toHaveLength(500);
    });
});

// #449 (Phase 208) - per-enrollment lifetime earnings cap override fields.
describe('buildUpdateAffiliateEnrollmentUseCase — earnings cap fields (#449 Phase 208)', () => {
    test('12: accepts a positive integer cap and a valid ISO date', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 12, status: 'active', max_lifetime_earnings_centavos: null, earnings_cap_active_until: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 12,
            body: { max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.max_lifetime_earnings_centavos).toBe(200000);
        expect(result.data.enrollment.earnings_cap_active_until).toBeInstanceOf(Date);
    });

    test('13: null on max_lifetime_earnings_centavos means inherit the tenant default', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 13, status: 'active', max_lifetime_earnings_centavos: 500000, earnings_cap_active_until: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 13,
            body: { max_lifetime_earnings_centavos: null }
        });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.max_lifetime_earnings_centavos).toBeNull();
    });

    test('14: an invalid earnings_cap_active_until is rejected with 422', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 14, status: 'active', max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 14,
            body: { earnings_cap_active_until: 'not-a-date' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('15: §2.3 guard - setting a date with no cap on the row (and no update to the cap) is rejected 422 EARNINGS_CAP_DATE_WITHOUT_CAP', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 15, status: 'active', max_lifetime_earnings_centavos: null, earnings_cap_active_until: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 15,
            body: { earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
        expect(result.error.details).toMatchObject({ reason_code: 'EARNINGS_CAP_DATE_WITHOUT_CAP' });
    });

    test('16: §2.3 guard - explicitly clearing the cap while a date remains from a prior PATCH (both in the same PATCH) is accepted only when the date is cleared too', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 16, status: 'active', max_lifetime_earnings_centavos: 200000, earnings_cap_active_until: new Date('2026-12-31T00:00:00.000Z') }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        // Clearing the cap but leaving the existing date untouched on the row would resolve to
        // "date with no cap" - rejected.
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 16,
            body: { max_lifetime_earnings_centavos: null }
        });
        expect(result.success).toBe(false);
        expect(result.error.details).toMatchObject({ reason_code: 'EARNINGS_CAP_DATE_WITHOUT_CAP' });
    });

    test('17: a cap set together with its date in the same PATCH is accepted (merged-state check, not payload-only)', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 17, status: 'active', max_lifetime_earnings_centavos: null, earnings_cap_active_until: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            enrollmentId: 17,
            body: { max_lifetime_earnings_centavos: 100000, earnings_cap_active_until: '2026-12-31T00:00:00.000Z' }
        });
        expect(result.success).toBe(true);
    });
});
