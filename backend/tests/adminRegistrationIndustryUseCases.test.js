import {
    buildListAdminRegistrationIndustriesUseCase,
    buildSetRegistrationIndustryVisibilityUseCase,
    buildListRegistrationIndustryVisibilityAuditLogsUseCase
} from '../src/modules/registration/usecases/adminRegistrationIndustryUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const ACTOR = { username: 'platform_admin_1' };
const REASON = 'temporarily pausing this vertical';

// A minimal in-memory fake standing in for
// registrationIndustryVisibilityRepository - exercises the use case logic
// (idempotency, audit logging, 404s) without a real DB, matching this
// repo's storeConfigurationTemplateUseCases.test.js convention.
const buildFakeRepository = () => {
    const byKey = new Map();
    const auditLogs = [];

    return {
        auditLogs,
        async findAll() {
            return [...byKey.values()];
        },
        async findByKey(industryKey) {
            return byKey.get(industryKey) || null;
        },
        async findHiddenKeys() {
            return [...byKey.values()].filter((row) => row.hidden === true).map((row) => row.industry_key);
        },
        async upsertVisibility({ industryKey, hidden, reason, actorUsername }) {
            const row = {
                industry_key: industryKey,
                hidden,
                reason,
                updated_by: actorUsername,
                updated_at: new Date().toISOString()
            };
            byKey.set(industryKey, row);
            return row;
        },
        async createAuditLog({ industryKey, action, actorUsername, reason, beforeSnapshot, afterSnapshot }) {
            const entry = {
                audit_log_id: auditLogs.length + 1,
                industry_key: industryKey,
                action,
                actor_username: actorUsername,
                reason,
                before_snapshot: beforeSnapshot,
                after_snapshot: afterSnapshot
            };
            auditLogs.push(entry);
            return entry;
        },
        async listAuditLogs(industryKey) {
            return auditLogs.filter((entry) => entry.industry_key === industryKey);
        }
    };
};

describe('admin registration-industry visibility use cases (issue #178 Phase 39)', () => {
    it('lists every catalog industry, left-joined against visibility state', async () => {
        const repository = buildFakeRepository();
        await repository.upsertVisibility({ industryKey: 'food_manufacturing', hidden: true, reason: REASON, actorUsername: ACTOR.username });
        const listUseCase = buildListAdminRegistrationIndustriesUseCase({ repository });

        const industries = await listUseCase();

        expect(industries).toHaveLength(11);
        const foodManufacturing = industries.find((entry) => entry.key === 'food_manufacturing');
        expect(foodManufacturing.hidden).toBe(true);
        expect(foodManufacturing.hidden_reason).toBe(REASON);
        const retail = industries.find((entry) => entry.key === 'retail');
        expect(retail.hidden).toBe(false);
        expect(retail.hidden_reason).toBeNull();
        // Admin surface: engine classification stays present, unlike the
        // merchant-facing catalog (IndustrySelect.jsx never reads it).
        expect(retail).toHaveProperty('engine');
    });

    it('rejects setting visibility with no actor', async () => {
        const useCase = buildSetRegistrationIndustryVisibilityUseCase({ repository: buildFakeRepository() });
        await expect(useCase({ industryKey: 'micro_fnb', hidden: true, reason: REASON, actorUser: null }))
            .rejects.toMatchObject({ code: DomainErrorCode.AUTHORIZATION_FAILED, statusCode: 403 });
    });

    it('rejects setting visibility with a too-short reason', async () => {
        const useCase = buildSetRegistrationIndustryVisibilityUseCase({ repository: buildFakeRepository() });
        await expect(useCase({ industryKey: 'micro_fnb', hidden: true, reason: 'no', actorUser: ACTOR }))
            .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
    });

    it('404s an unknown industry key', async () => {
        const useCase = buildSetRegistrationIndustryVisibilityUseCase({ repository: buildFakeRepository() });
        await expect(useCase({ industryKey: 'not_a_real_industry', hidden: true, reason: REASON, actorUser: ACTOR }))
            .rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND, statusCode: 404 });
    });

    it('hides then unhides an industry, auditing both transitions with before/after snapshots', async () => {
        const repository = buildFakeRepository();
        const useCase = buildSetRegistrationIndustryVisibilityUseCase({ repository });

        const hidden = await useCase({ industryKey: 'micro_fnb', hidden: true, reason: REASON, actorUser: ACTOR });
        expect(hidden.hidden).toBe(true);
        expect(repository.auditLogs).toHaveLength(1);
        expect(repository.auditLogs[0]).toEqual(expect.objectContaining({
            industry_key: 'micro_fnb',
            action: 'hidden',
            actor_username: ACTOR.username,
            reason: REASON
        }));
        expect(repository.auditLogs[0].before_snapshot).toBeNull();
        expect(repository.auditLogs[0].after_snapshot).toEqual(expect.objectContaining({ hidden: true }));

        const shown = await useCase({ industryKey: 'micro_fnb', hidden: false, reason: 'reopening this vertical', actorUser: ACTOR });
        expect(shown.hidden).toBe(false);
        expect(repository.auditLogs).toHaveLength(2);
        expect(repository.auditLogs[1].action).toBe('unhidden');
        expect(repository.auditLogs[1].before_snapshot).toEqual(expect.objectContaining({ hidden: true }));
    });

    it('is idempotent - repeating the same hidden state writes no new audit entry', async () => {
        const repository = buildFakeRepository();
        const useCase = buildSetRegistrationIndustryVisibilityUseCase({ repository });

        await useCase({ industryKey: 'micro_fnb', hidden: true, reason: REASON, actorUser: ACTOR });
        expect(repository.auditLogs).toHaveLength(1);

        const repeat = await useCase({ industryKey: 'micro_fnb', hidden: true, reason: 'hiding it again for no reason', actorUser: ACTOR });
        expect(repeat.hidden).toBe(true);
        expect(repository.auditLogs).toHaveLength(1);
    });

    it('lists audit logs for a known industry and 404s an unknown one', async () => {
        const repository = buildFakeRepository();
        const setUseCase = buildSetRegistrationIndustryVisibilityUseCase({ repository });
        const listLogsUseCase = buildListRegistrationIndustryVisibilityAuditLogsUseCase({ repository });

        await setUseCase({ industryKey: 'micro_fnb', hidden: true, reason: REASON, actorUser: ACTOR });
        const logs = await listLogsUseCase({ industryKey: 'micro_fnb' });
        expect(logs).toHaveLength(1);

        await expect(listLogsUseCase({ industryKey: 'not_a_real_industry' }))
            .rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND, statusCode: 404 });
    });
});
