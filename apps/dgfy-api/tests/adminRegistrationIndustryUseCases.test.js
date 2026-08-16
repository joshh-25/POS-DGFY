import {
    buildListAdminRegistrationIndustriesUseCase,
    buildCreateRegistrationIndustryUseCase,
    buildUpdateRegistrationIndustryUseCase,
    buildSetRegistrationIndustryVisibilityUseCase,
    buildListRegistrationIndustryVisibilityAuditLogsUseCase
} from '../src/modules/registration/usecases/adminRegistrationIndustryUseCases.js';
import { REGISTRATION_INDUSTRIES } from '../src/modules/shared/constants/registrationIndustries.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const ACTOR = { username: 'platform_admin_1' };
const REASON = 'temporarily pausing this vertical';

// A minimal in-memory fake standing in for registrationIndustryRepository
// (issue #316) - exercises the use case logic (validation, audit logging,
// 404s, idempotency) without a real DB, matching this repo's
// storeConfigurationTemplateUseCases.test.js convention. Seeded with the
// 11 baseline industries so list/update/visibility tests have realistic
// starting state.
const seedRow = (industryKey, entry, overrides = {}) => ({
    industry_key: industryKey,
    label: entry.label,
    summary: entry.summary,
    niches: [...entry.niches],
    workflow_mode: entry.workflow_mode,
    template_key: entry.template_key,
    display_order: entry.order,
    hidden: false,
    hidden_reason: null,
    is_system: true,
    created_by: 'system_seed',
    updated_by: 'system_seed',
    created_at: '2026-08-12T00:00:00.000Z',
    updated_at: '2026-08-12T00:00:00.000Z',
    ...overrides
});

const buildFakeRepository = ({ seeded = true } = {}) => {
    const byKey = new Map();
    if (seeded) {
        for (const [industryKey, entry] of Object.entries(REGISTRATION_INDUSTRIES)) {
            byKey.set(industryKey, seedRow(industryKey, entry));
        }
    }
    const auditLogs = [];

    return {
        byKey,
        auditLogs,
        async findAll() {
            return [...byKey.values()].sort((a, b) => a.display_order - b.display_order);
        },
        async findByKey(industryKey) {
            return byKey.get(industryKey) || null;
        },
        async findHiddenKeys() {
            return [...byKey.values()].filter((row) => row.hidden === true).map((row) => row.industry_key);
        },
        async getMaxDisplayOrder() {
            const orders = [...byKey.values()].map((row) => row.display_order);
            return orders.length > 0 ? Math.max(...orders) : 0;
        },
        async create({ industryKey, label, summary, niches, workflowMode, templateKey, displayOrder, actorUsername, reason }) {
            const row = {
                industry_key: industryKey,
                label,
                summary,
                niches,
                workflow_mode: workflowMode,
                template_key: templateKey,
                display_order: displayOrder,
                hidden: true,
                hidden_reason: reason,
                is_system: false,
                created_by: actorUsername,
                updated_by: actorUsername,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            byKey.set(industryKey, row);
            auditLogs.push({
                audit_log_id: auditLogs.length + 1,
                industry_key: industryKey,
                action: 'created',
                actor_username: actorUsername,
                reason,
                before_snapshot: null,
                after_snapshot: { ...row }
            });
            return row;
        },
        async updateByKey(industryKey, fields) {
            const current = byKey.get(industryKey);
            const updated = { ...current, ...fields, updated_at: new Date().toISOString() };
            byKey.set(industryKey, updated);
            return updated;
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

// A published, mode-matching template for whichever key/mode a test asks
// for - findByKey resolves any key to a published template whose
// base_mode is the key itself unless a fixture overrides the map.
const buildFakeTemplateRepository = (overrides = {}) => ({
    async findByKey(templateKey) {
        if (templateKey in overrides) return overrides[templateKey];
        return { template_key: templateKey, status: 'published', base_mode: 'services' };
    }
});

describe('admin registration-industry catalog use cases (issue #316)', () => {
    describe('list', () => {
        it('lists every catalog row, engine classification included', async () => {
            const repository = buildFakeRepository();
            const listUseCase = buildListAdminRegistrationIndustriesUseCase({ repository });

            const industries = await listUseCase();

            expect(industries).toHaveLength(11);
            const retail = industries.find((entry) => entry.key === 'retail');
            expect(retail).toHaveProperty('engine');
            expect(retail.is_system).toBe(true);
            expect(retail.hidden).toBe(false);
        });

        it('normalizes a JSON-encoded niches string from a legacy catalog row', async () => {
            const repository = buildFakeRepository();
            repository.byKey.get('retail').niches = '["Supermarket", "Grocery store"]';

            const listUseCase = buildListAdminRegistrationIndustriesUseCase({ repository });
            const industries = await listUseCase();

            expect(industries.find((entry) => entry.key === 'retail').niches)
                .toEqual(['Supermarket', 'Grocery store']);
        });

        it('includes an admin-created row alongside the seeded baseline', async () => {
            const repository = buildFakeRepository();
            byKeySet(repository, 'pet_grooming', {
                industry_key: 'pet_grooming',
                label: 'Pet Grooming',
                summary: 'Grooming and boarding.',
                niches: ['Pet salon'],
                workflow_mode: 'services',
                template_key: 'services_shop',
                display_order: 12,
                hidden: true,
                hidden_reason: 'New, not launched',
                is_system: false,
                updated_by: ACTOR.username
            });
            const listUseCase = buildListAdminRegistrationIndustriesUseCase({ repository });

            const industries = await listUseCase();

            expect(industries).toHaveLength(12);
            const petGrooming = industries.find((entry) => entry.key === 'pet_grooming');
            expect(petGrooming.is_system).toBe(false);
            expect(petGrooming.hidden).toBe(true);
        });
    });

    describe('create', () => {
        const validBody = () => ({
            industryKey: 'pet_grooming',
            label: 'Pet Grooming',
            summary: 'Grooming and boarding services for pets.',
            niches: ['Pet salon', 'Mobile grooming'],
            workflowMode: 'services',
            templateKey: 'services_shop',
            reason: REASON,
            actorUser: ACTOR
        });

        it('rejects with no actor', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), actorUser: null }))
                .rejects.toMatchObject({ code: DomainErrorCode.AUTHORIZATION_FAILED, statusCode: 403 });
        });

        it('rejects with a too-short reason', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), reason: 'no' }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects an unrecognized workflow_mode', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), workflowMode: 'not_a_real_mode' }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects the deprecated manufacturing alias, requiring the canonical food_manufacturing', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), workflowMode: 'manufacturing', templateKey: 'food_manufacturer' }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects a non-null template_key on an external-engine mode', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), workflowMode: 'healthcare', templateKey: 'services_shop' }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('accepts a null template_key on an external-engine mode', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            const result = await useCase({ ...validBody(), industryKey: 'pest_control', workflowMode: 'ticketing_transport', templateKey: null });
            expect(result.template_key).toBeNull();
            expect(result.engine).toBe('external');
        });

        it('rejects a missing template_key on a non-external mode', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), templateKey: null }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects a template_key that does not resolve to any template', async () => {
            const templateRepository = buildFakeTemplateRepository({ services_shop: null });
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository });
            await expect(useCase(validBody()))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects an unpublished template_key', async () => {
            const templateRepository = buildFakeTemplateRepository({ services_shop: { template_key: 'services_shop', status: 'draft', base_mode: 'services' } });
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository });
            await expect(useCase(validBody()))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects a template_key whose base_mode does not match workflow_mode', async () => {
            const templateRepository = buildFakeTemplateRepository({ services_shop: { template_key: 'services_shop', status: 'published', base_mode: 'retail' } });
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository });
            await expect(useCase(validBody()))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('rejects a duplicate industry_key with a 409', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ ...validBody(), industryKey: 'retail' }))
                .rejects.toMatchObject({ code: DomainErrorCode.CONFLICT, statusCode: 409 });
        });

        it('creates the row hidden by default, is_system false, never accepting is_system from the caller', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            const result = await useCase(validBody());

            expect(result.hidden).toBe(true);
            expect(result.is_system).toBe(false);
            expect(result.key).toBe('pet_grooming');
            expect(result.workflow_mode).toBe('services');
            expect(result.template_key).toBe('services_shop');
        });

        it('defaults display_order to one past the current maximum when not supplied', async () => {
            const repository = buildFakeRepository();
            const useCase = buildCreateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });
            const result = await useCase(validBody());
            expect(result.order).toBe(12); // 11 seeded orders 1-11
        });

        it('honors an explicit display_order when supplied', async () => {
            const useCase = buildCreateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            const result = await useCase({ ...validBody(), displayOrder: 3 });
            expect(result.order).toBe(3);
        });

        it('writes a single "created" audit row with an after-snapshot', async () => {
            const repository = buildFakeRepository();
            const useCase = buildCreateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });
            await useCase(validBody());

            expect(repository.auditLogs).toHaveLength(1);
            expect(repository.auditLogs[0]).toEqual(expect.objectContaining({
                industry_key: 'pet_grooming',
                action: 'created',
                actor_username: ACTOR.username
            }));
            expect(repository.auditLogs[0].after_snapshot).toBeTruthy();
        });
    });

    describe('update', () => {
        it('404s an unknown industry key', async () => {
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ industryKey: 'not_a_real_industry', label: 'New label', reason: REASON, actorUser: ACTOR }))
                .rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND, statusCode: 404 });
        });

        it('rejects a workflow_mode change on a system (baseline) row', async () => {
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository: buildFakeRepository(), templateRepository: buildFakeTemplateRepository() });
            await expect(useCase({ industryKey: 'retail', workflowMode: 'services', templateKey: 'services_shop', reason: REASON, actorUser: ACTOR }))
                .rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('allows label/summary/niches/order edits on a system row', async () => {
            const repository = buildFakeRepository();
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });
            const result = await useCase({
                industryKey: 'retail',
                label: 'Retail & Trade',
                niches: ['Supermarket', 'Convenience store'],
                displayOrder: 2,
                reason: REASON,
                actorUser: ACTOR
            });

            expect(result.label).toBe('Retail & Trade');
            expect(result.niches).toEqual(['Supermarket', 'Convenience store']);
            expect(result.order).toBe(2);
            expect(result.workflow_mode).toBe('retail'); // unchanged
        });

        it('allows a template_key-only change on a system row (mode stays untouched, template stays editable)', async () => {
            const repository = buildFakeRepository();
            const templateRepository = buildFakeTemplateRepository({
                fnb_full_service: { template_key: 'fnb_full_service', status: 'published', base_mode: 'fnb' }
            });
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository });

            const result = await useCase({
                industryKey: 'micro_fnb', // seeded with template_key: 'fnb_counter_service', mode: 'fnb'
                templateKey: 'fnb_full_service',
                reason: 'repointing to the full-service preset',
                actorUser: ACTOR
            });

            expect(result.template_key).toBe('fnb_full_service');
            expect(result.workflow_mode).toBe('fnb'); // unchanged, and never rejected
        });

        it('allows a workflow_mode change on an admin-created row, revalidating mode/template together', async () => {
            const repository = buildFakeRepository();
            const createUseCase = buildCreateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });
            await createUseCase({
                industryKey: 'pet_grooming',
                label: 'Pet Grooming',
                summary: 'Grooming and boarding.',
                niches: ['Pet salon'],
                workflowMode: 'services',
                templateKey: 'services_shop',
                reason: REASON,
                actorUser: ACTOR
            });

            const templateRepository = buildFakeTemplateRepository({
                retail_store: { template_key: 'retail_store', status: 'published', base_mode: 'retail' }
            });
            const updateUseCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository });
            const result = await updateUseCase({
                industryKey: 'pet_grooming',
                workflowMode: 'retail',
                templateKey: 'retail_store',
                reason: 'Re-classifying as retail',
                actorUser: ACTOR
            });

            expect(result.workflow_mode).toBe('retail');
            expect(result.template_key).toBe('retail_store');
        });

        it('rejects an admin-row mode change that leaves an incompatible template_key in place', async () => {
            const repository = buildFakeRepository();
            const createUseCase = buildCreateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });
            await createUseCase({
                industryKey: 'pet_grooming',
                label: 'Pet Grooming',
                summary: 'Grooming and boarding.',
                niches: ['Pet salon'],
                workflowMode: 'services',
                templateKey: 'services_shop',
                reason: REASON,
                actorUser: ACTOR
            });

            const templateRepository = buildFakeTemplateRepository({ services_shop: { template_key: 'services_shop', status: 'published', base_mode: 'services' } });
            const updateUseCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository });
            // Changing mode to retail without also changing template_key -
            // the existing services_shop template's base_mode no longer
            // matches, so this must be rejected, not silently accepted.
            await expect(updateUseCase({
                industryKey: 'pet_grooming',
                workflowMode: 'retail',
                reason: 'Re-classifying as retail',
                actorUser: ACTOR
            })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED, statusCode: 422 });
        });

        it('is idempotent - a request with no effective change writes no audit entry', async () => {
            const repository = buildFakeRepository();
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });

            const result = await useCase({ industryKey: 'retail', label: 'Retail', reason: REASON, actorUser: ACTOR });

            expect(result.label).toBe('Retail'); // unchanged from the seed
            expect(repository.auditLogs).toHaveLength(0);
        });

        it('writes an "updated" audit row with before/after snapshots on a real change', async () => {
            const repository = buildFakeRepository();
            const useCase = buildUpdateRegistrationIndustryUseCase({ repository, templateRepository: buildFakeTemplateRepository() });

            await useCase({ industryKey: 'retail', label: 'Retail & Trade', reason: REASON, actorUser: ACTOR });

            expect(repository.auditLogs).toHaveLength(1);
            expect(repository.auditLogs[0]).toEqual(expect.objectContaining({ industry_key: 'retail', action: 'updated' }));
            expect(repository.auditLogs[0].before_snapshot.label).toBe('Retail');
            expect(repository.auditLogs[0].after_snapshot.label).toBe('Retail & Trade');
        });
    });

    describe('visibility (re-backed onto the catalog repository)', () => {
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
            expect(repository.auditLogs[0].before_snapshot.hidden).toBe(false);
            expect(repository.auditLogs[0].after_snapshot.hidden).toBe(true);

            const shown = await useCase({ industryKey: 'micro_fnb', hidden: false, reason: 'reopening this vertical', actorUser: ACTOR });
            expect(shown.hidden).toBe(false);
            expect(repository.auditLogs).toHaveLength(2);
            expect(repository.auditLogs[1].action).toBe('unhidden');
            expect(repository.auditLogs[1].before_snapshot.hidden).toBe(true);
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
});

// Small helper for tests that need to seed a non-baseline row directly.
function byKeySet(repository, key, row) {
    repository.byKey.set(key, row);
}
