// Unit tests for the Phase 1 affiliate pricing rule engine additions to
// backend/src/modules/dgfy/usecases/dgfyAffiliateUseCases.js - the owner-facing API surface behind
// AffiliatesWorkspacePanel.jsx (see
// docs/proposals/2026-07-29-affiliate-pricing-rule-engine-scope.md, Stage G).
//
// No database is used: every use case builder here accepts `repository` as an injectable
// parameter, so a plain in-memory fake stands in for dgfyAffiliateRepository.js, mirroring the
// pattern in tests/affiliateCommissionAccrual.unit.test.js.

import {
    buildUpdateAffiliateSettingsUseCase,
    buildUpdateAffiliateEnrollmentUseCase,
    buildListAffiliatePriceRulesUseCase,
    buildUpsertAffiliatePriceRuleUseCase,
    buildDeactivateAffiliatePriceRuleUseCase
} from '../src/modules/dgfy/usecases/dgfyAffiliateUseCases.js';

const TENANT_ID = 'tenant-1';

const makeFakeRepository = ({ enrollments = [], priceRules = [] } = {}) => {
    const state = { priceRules: [...priceRules], nextId: priceRules.length + 1 };
    return {
        __state: state,
        async upsertSettings(tenantId, updates) {
            return { tenant_id: tenantId, ...updates };
        },
        async findEnrollmentById(tenantId, enrollmentId) {
            return enrollments.find((e) => e.tenant_id === tenantId && String(e.enrollment_id) === String(enrollmentId)) || null;
        },
        async updateEnrollment(tenantId, enrollmentId, updates) {
            const enrollment = enrollments.find((e) => e.tenant_id === tenantId && String(e.enrollment_id) === String(enrollmentId));
            if (!enrollment) return null;
            Object.assign(enrollment, updates);
            return enrollment;
        },
        async listPriceRulesForTenant(tenantId) {
            return state.priceRules.filter((r) => r.tenant_id === tenantId);
        },
        async upsertPriceRule({ tenantId, enrollmentId, itemId, ruleType, rateBps, amountCentavos, active }) {
            const existing = state.priceRules.find((r) => (
                r.tenant_id === tenantId && r.enrollment_id === enrollmentId && r.item_id === itemId
            ));
            if (existing) {
                Object.assign(existing, { rule_type: ruleType, rate_bps: rateBps, amount_centavos: amountCentavos, active });
                return existing;
            }
            const row = {
                price_rule_id: state.nextId++,
                tenant_id: tenantId,
                enrollment_id: enrollmentId,
                item_id: itemId,
                rule_type: ruleType,
                rate_bps: rateBps,
                amount_centavos: amountCentavos,
                active
            };
            state.priceRules.push(row);
            return row;
        },
        async deactivatePriceRule(tenantId, priceRuleId) {
            const row = state.priceRules.find((r) => r.tenant_id === tenantId && String(r.price_rule_id) === String(priceRuleId));
            if (!row) return null;
            row.active = false;
            return row;
        }
    };
};

describe('buildUpdateAffiliateSettingsUseCase — Phase 1 additions', () => {
    test('accepts a valid commission_type, settlement_policy, and commission_base_mode', async () => {
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: {
                commission_type: 'RESELLER_MARGIN',
                settlement_policy: 'RESELLER_MARGIN',
                commission_base_mode: 'base_price_subtotal'
            }
        });
        expect(result.success).toBe(true);
        expect(result.data.settings).toEqual(expect.objectContaining({
            commission_type: 'RESELLER_MARGIN',
            settlement_policy: 'RESELLER_MARGIN',
            commission_base_mode: 'base_price_subtotal'
        }));
    });

    test('rejects an unrecognized commission_type', async () => {
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { commission_type: 'NOT_REAL' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('rejects an unrecognized commission_base_mode', async () => {
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { commission_base_mode: 'sometimes' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('settlement_policy can be explicitly cleared with null', async () => {
        const useCase = buildUpdateAffiliateSettingsUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { settlement_policy: null } });
        expect(result.success).toBe(true);
        expect(result.data.settings.settlement_policy).toBeNull();
    });
});

describe('buildUpdateAffiliateEnrollmentUseCase — commission_type override', () => {
    test('sets a per-affiliate commission_type override', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 1, commission_type: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 1, body: { commission_type: 'NONE' } });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.commission_type).toBe('NONE');
    });

    test('clearing commission_type with an empty string reverts to inheriting the tenant default', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 2, commission_type: 'NONE' }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 2, body: { commission_type: '' } });
        expect(result.success).toBe(true);
        expect(result.data.enrollment.commission_type).toBeNull();
    });

    test('rejects an unrecognized commission_type', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 3, commission_type: null }]
        });
        const useCase = buildUpdateAffiliateEnrollmentUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, enrollmentId: 3, body: { commission_type: 'BOGUS' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });
});

describe('buildUpsertAffiliatePriceRuleUseCase', () => {
    test('creates a tenant-wide template rule when enrollment_id is omitted', async () => {
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { rule_type: 'PERCENTAGE_DISCOUNT', rate_bps: 1000 }
        });
        expect(result.success).toBe(true);
        expect(result.data.price_rule).toEqual(expect.objectContaining({
            enrollment_id: 0,
            item_id: 0,
            rule_type: 'PERCENTAGE_DISCOUNT',
            rate_bps: 1000
        }));
    });

    test('creates a per-affiliate override when enrollment_id is a real enrollment', async () => {
        const repository = makeFakeRepository({
            enrollments: [{ tenant_id: TENANT_ID, enrollment_id: 5, status: 'active' }]
        });
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { enrollment_id: 5, rule_type: 'EXACT_AFFILIATE_PRICE', amount_centavos: 12000 }
        });
        expect(result.success).toBe(true);
        expect(result.data.price_rule.enrollment_id).toBe(5);
    });

    test('rejects an enrollment_id that does not exist for this tenant', async () => {
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { enrollment_id: 999, rule_type: 'BASE_PRICE' }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    test('requires rate_bps for a percentage-based rule type', async () => {
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { rule_type: 'PERCENTAGE_MARKUP' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('rejects a discount percentage above 100% (test 12 from the acceptance pack)', async () => {
        // Caught by the generic rate_bps range parser (0-10000) before ever reaching
        // validateAffiliatePriceRule's discount-specific INVALID_DISCOUNT_PERCENTAGE check - the two
        // happen to coincide exactly for PERCENTAGE_DISCOUNT (100% is the same ceiling either way).
        // The pure policy module's own check still matters for other callers, e.g. the frontend
        // live preview, which calls validateAffiliatePriceRule directly without this parsing layer.
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({
            tenantId: TENANT_ID,
            body: { rule_type: 'PERCENTAGE_DISCOUNT', rate_bps: 11000 }
        });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('requires amount_centavos for an amount-based rule type', async () => {
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { rule_type: 'FIXED_DISCOUNT' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('rejects an unrecognized rule_type', async () => {
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, body: { rule_type: 'NOT_REAL' } });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(422);
    });

    test('re-saving the same scope updates the existing row rather than creating a duplicate', async () => {
        const repository = makeFakeRepository();
        const useCase = buildUpsertAffiliatePriceRuleUseCase({ repository });
        await useCase({ tenantId: TENANT_ID, body: { rule_type: 'PERCENTAGE_DISCOUNT', rate_bps: 1000 } });
        await useCase({ tenantId: TENANT_ID, body: { rule_type: 'PERCENTAGE_DISCOUNT', rate_bps: 1500 } });
        expect(repository.__state.priceRules).toHaveLength(1);
        expect(repository.__state.priceRules[0].rate_bps).toBe(1500);
    });
});

describe('buildListAffiliatePriceRulesUseCase / buildDeactivateAffiliatePriceRuleUseCase', () => {
    test('lists all price rules for a tenant', async () => {
        const repository = makeFakeRepository({
            priceRules: [{ price_rule_id: 1, tenant_id: TENANT_ID, enrollment_id: 0, item_id: 0, rule_type: 'BASE_PRICE', active: true }]
        });
        const useCase = buildListAffiliatePriceRulesUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID });
        expect(result.success).toBe(true);
        expect(result.data.price_rules).toHaveLength(1);
    });

    test('deactivating an unknown price rule reports not found', async () => {
        const useCase = buildDeactivateAffiliatePriceRuleUseCase({ repository: makeFakeRepository() });
        const result = await useCase({ tenantId: TENANT_ID, priceRuleId: 999 });
        expect(result.success).toBe(false);
        expect(result.error.statusCode).toBe(404);
    });

    test('deactivating an existing price rule flips active to false', async () => {
        const repository = makeFakeRepository({
            priceRules: [{ price_rule_id: 7, tenant_id: TENANT_ID, enrollment_id: 0, item_id: 0, rule_type: 'BASE_PRICE', active: true }]
        });
        const useCase = buildDeactivateAffiliatePriceRuleUseCase({ repository });
        const result = await useCase({ tenantId: TENANT_ID, priceRuleId: 7 });
        expect(result.success).toBe(true);
        expect(result.data.price_rule.active).toBe(false);
    });
});
