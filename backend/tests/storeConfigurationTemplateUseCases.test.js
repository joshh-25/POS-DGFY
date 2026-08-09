import {
    buildCreateDraftTemplateUseCase,
    buildUpdateTemplateModulesUseCase,
    buildPublishTemplateUseCase,
    buildDeprecateTemplateUseCase,
    buildListTemplatesUseCase,
    buildGetTemplateUseCase,
    buildListTemplateAuditLogsUseCase
} from '../src/modules/templates/usecases/storeConfigurationTemplateUseCases.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

const ACTOR = { username: 'platform_admin_1' };
const REASON = 'curating a new template for the catalog';

// A minimal in-memory fake standing in for storeConfigurationTemplateRepository
// - exercises the use case logic (validation, status transitions, audit
// logging) without a real DB, matching this repo's convention for
// usecase-layer unit tests.
const buildFakeRepository = () => {
    let nextId = 1;
    const byId = new Map();
    const auditLogs = [];

    return {
        auditLogs,
        async findAll({ status = null, baseMode = null } = {}) {
            return [...byId.values()].filter((t) => (
                (!status || t.status === status) && (!baseMode || t.base_mode === baseMode)
            ));
        },
        async findByKey(templateKey) {
            return [...byId.values()].find((t) => t.template_key === templateKey) || null;
        },
        async findById(templateId) {
            return byId.get(templateId) || null;
        },
        // isPreset/isCanonical default to false, matching
        // storeConfigurationTemplateRepository.js's real defaults - the use
        // case under test never passes them (they're platform-owned), so
        // only the seed-flow-style direct-repository-call tests below set
        // them explicitly, exactly like seedCanonicalTemplatePresets.js does.
        async create({ templateKey, label, baseMode, isPreset = false, isCanonical = false, visibility, owner, moduleKeys }) {
            const template = {
                template_id: nextId++,
                template_key: templateKey,
                label,
                base_mode: baseMode,
                is_preset: isPreset,
                is_canonical: isCanonical,
                visibility,
                owner,
                status: 'draft',
                version: 1,
                modules: [...moduleKeys].sort()
            };
            byId.set(template.template_id, template);
            return template;
        },
        async replaceModules(templateId, moduleKeys) {
            const template = byId.get(templateId);
            template.modules = [...moduleKeys].sort();
            return template;
        },
        async setStatus(templateId, status) {
            const template = byId.get(templateId);
            template.status = status;
            return template;
        },
        async createAuditLog(entry) {
            auditLogs.push(entry);
            return entry;
        },
        async listAuditLogs(templateId) {
            return auditLogs.filter((entry) => entry.templateId === templateId);
        }
    };
};

describe('store configuration template use cases (issue #178 Phase 13/14)', () => {
    it('rejects an invalid module selection on create (missing requires)', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await expect(createDraft({
            templateKey: 'bad_template',
            label: 'Bad',
            baseMode: 'retail',
            moduleKeys: ['pos'], // requires 'catalog'
            actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED });
    });

    it('rejects create with no actor', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await expect(createDraft({
            templateKey: 'no_actor', label: 'X', baseMode: 'retail', moduleKeys: ['catalog']
        })).rejects.toMatchObject({ code: DomainErrorCode.AUTHORIZATION_FAILED });
    });

    it('rejects a duplicate template_key', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        await createDraft({ templateKey: 'dup', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR });
        await expect(createDraft({
            templateKey: 'dup', label: 'B', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('creates a valid draft template and audits it', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'retail_lean',
            label: 'Lean Retail',
            baseMode: 'retail',
            moduleKeys: ['catalog', 'pos'],
            actorUser: ACTOR
        });

        expect(template.status).toBe('draft');
        expect(template.modules).toEqual(['catalog', 'pos']);
        expect(repository.auditLogs).toEqual([expect.objectContaining({
            templateId: template.template_id,
            action: 'draft_created',
            actorUsername: 'platform_admin_1'
        })]);
    });

    it('allows editing modules while draft, with a required reason', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'services_draft', label: 'S', baseMode: 'services', moduleKeys: ['catalog', 'services'], actorUser: ACTOR
        });

        await expect(updateModules({
            templateId: template.template_id, moduleKeys: ['catalog', 'services', 'inventory'], actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.VALIDATION_FAILED });

        const updated = await updateModules({
            templateId: template.template_id, moduleKeys: ['catalog', 'services', 'inventory'], reason: REASON, actorUser: ACTOR
        });

        expect(updated.modules).toEqual(['catalog', 'inventory', 'services']);
        expect(repository.auditLogs).toContainEqual(expect.objectContaining({ action: 'modules_updated', reason: REASON }));
    });

    it('publishing validates the module selection and freezes the template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const updateModules = buildUpdateTemplateModulesUseCase({ repository });

        const template = await createDraft({
            templateKey: 'fnb_counter', label: 'Counter', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining'], actorUser: ACTOR
        });
        const published = await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        expect(published.status).toBe('published');
        expect(repository.auditLogs).toContainEqual(expect.objectContaining({ action: 'published', reason: REASON }));

        await expect(updateModules({
            templateId: template.template_id, moduleKeys: ['catalog'], reason: REASON, actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('publishing an already-published template is idempotent and does not double-audit', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'idempotent_pub', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        const secondPublish = await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        expect(secondPublish.status).toBe('published');
        expect(repository.auditLogs.filter((entry) => entry.action === 'published')).toHaveLength(1);
    });

    it('rejects publishing a deprecated template', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const deprecate = buildDeprecateTemplateUseCase({ repository });

        const template = await createDraft({
            templateKey: 'to_deprecate', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
        await deprecate({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });

        await expect(publish({
            templateId: template.template_id, reason: REASON, actorUser: ACTOR
        })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
    });

    it('lists and gets templates, and 404s a missing one', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const list = buildListTemplatesUseCase({ repository });
        const get = buildGetTemplateUseCase({ repository });

        await createDraft({ templateKey: 'a', label: 'A', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR });
        await createDraft({ templateKey: 'b', label: 'B', baseMode: 'fnb', moduleKeys: ['catalog', 'pos', 'fnbDining'], actorUser: ACTOR });

        const all = await list();
        expect(all).toHaveLength(2);

        const filtered = await list({ baseMode: 'fnb' });
        expect(filtered).toHaveLength(1);
        expect(filtered[0].template_key).toBe('b');

        const found = await get({ templateKey: 'a' });
        expect(found.label).toBe('A');

        await expect(get({ templateId: 999 })).rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND });
    });

    it('lists audit logs for a template and 404s a missing one', async () => {
        const repository = buildFakeRepository();
        const createDraft = buildCreateDraftTemplateUseCase({ repository });
        const publish = buildPublishTemplateUseCase({ repository });
        const listAuditLogs = buildListTemplateAuditLogsUseCase({ repository });

        const template = await createDraft({
            templateKey: 'audited', label: 'X', baseMode: 'retail', moduleKeys: ['catalog'], actorUser: ACTOR
        });
        await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });

        const logs = await listAuditLogs({ templateId: template.template_id });
        expect(logs.map((l) => l.action)).toEqual(['draft_created', 'published']);

        await expect(listAuditLogs({ templateId: 999 })).rejects.toMatchObject({ code: DomainErrorCode.RESOURCE_NOT_FOUND });
    });

    // issue #178 final-touch hardening: platform presets and canonical
    // defaults are unremovable through the curation surface.
    describe('preset/canonical protection (issue #178 final-touch hardening)', () => {
        it('rejects deprecating an is_preset template and leaves it untouched', async () => {
            const repository = buildFakeRepository();
            const deprecate = buildDeprecateTemplateUseCase({ repository });

            // Mirrors seedCanonicalTemplatePresets.js: calls repository.create
            // directly with isPreset true, bypassing the create use case
            // (which can no longer set it).
            const preset = await repository.create({
                templateKey: 'fnb_counter_service', label: 'Counter Service', baseMode: 'fnb',
                isPreset: true, isCanonical: false, visibility: 'visible', owner: 'platform', moduleKeys: ['catalog']
            });
            await repository.setStatus(preset.template_id, 'published');

            await expect(deprecate({
                templateId: preset.template_id, reason: REASON, actorUser: ACTOR
            })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });

            const stillPublished = await repository.findById(preset.template_id);
            expect(stillPublished.status).toBe('published');
            expect(repository.auditLogs.filter((entry) => entry.action === 'deprecated')).toHaveLength(0);
        });

        it('rejects deprecating an is_canonical template', async () => {
            const repository = buildFakeRepository();
            const deprecate = buildDeprecateTemplateUseCase({ repository });

            const canonical = await repository.create({
                templateKey: 'fnb_full_service', label: 'Full Service', baseMode: 'fnb',
                isPreset: true, isCanonical: true, visibility: 'visible', owner: 'platform', moduleKeys: ['catalog']
            });
            await repository.setStatus(canonical.template_id, 'published');

            await expect(deprecate({
                templateId: canonical.template_id, reason: REASON, actorUser: ACTOR
            })).rejects.toMatchObject({ code: DomainErrorCode.CONFLICT });
        });

        it('still allows deprecating a plain admin-authored template', async () => {
            const repository = buildFakeRepository();
            const createDraft = buildCreateDraftTemplateUseCase({ repository });
            const publish = buildPublishTemplateUseCase({ repository });
            const deprecate = buildDeprecateTemplateUseCase({ repository });

            const template = await createDraft({
                templateKey: 'admin_authored', label: 'Admin Authored', baseMode: 'retail',
                moduleKeys: ['catalog'], actorUser: ACTOR
            });
            expect(template.is_preset).toBe(false);
            await publish({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });

            const deprecated = await deprecate({ templateId: template.template_id, reason: REASON, actorUser: ACTOR });
            expect(deprecated.status).toBe('deprecated');
            expect(repository.auditLogs).toContainEqual(expect.objectContaining({ action: 'deprecated' }));
        });

        it('the create use case never forwards is_preset/is_canonical to the repository', async () => {
            const repository = buildFakeRepository();
            const createDraft = buildCreateDraftTemplateUseCase({ repository });

            // Passing isPreset/isCanonical as if a caller tried to sneak them
            // through - the use case signature no longer accepts them at all,
            // so they're simply ignored (repository defaults win).
            const template = await createDraft({
                templateKey: 'attempted_preset_claim', label: 'X', baseMode: 'retail',
                moduleKeys: ['catalog'], actorUser: ACTOR, isPreset: true, isCanonical: true
            });

            expect(template.is_preset).toBe(false);
            expect(template.is_canonical).toBe(false);
        });
    });
});
