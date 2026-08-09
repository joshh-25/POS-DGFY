import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { validateModuleSelection } from '../../shared/constants/capabilityModules.js';

const notFound = (templateId) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    `Store configuration template not found: ${templateId}`,
    { statusCode: 404 }
);

const assertValidModuleSelection = (moduleKeys) => {
    const validation = validateModuleSelection(moduleKeys);
    if (!validation.ok) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'Template module selection is invalid',
            { statusCode: 422, details: validation }
        );
    }
};

const requireActorUsername = (actorUser) => {
    const username = String(actorUser?.username || '').trim();
    if (!username) {
        throw new DomainError(
            DomainErrorCode.AUTHORIZATION_FAILED,
            'A platform admin actor is required for this action',
            { statusCode: 403 }
        );
    }
    return username.slice(0, 120);
};

// Mirrors updateTenantCapabilitiesUseCase.js's requireReason shape exactly -
// every audited platform-admin write to tenant-visible configuration in
// this codebase requires a human-readable reason of the same minimum
// length, and template curation is no exception.
const requireReason = (reason) => {
    const normalized = String(reason || '').trim();
    if (normalized.length < 3) {
        throw new DomainError(
            DomainErrorCode.VALIDATION_FAILED,
            'reason is required and must be at least 3 characters',
            { statusCode: 422 }
        );
    }
    return normalized.slice(0, 500);
};

export const buildListTemplatesUseCase = ({ repository }) => async ({ status = null, baseMode = null } = {}) => (
    repository.findAll({ status, baseMode })
);

export const buildGetTemplateUseCase = ({ repository }) => async ({ templateId, templateKey }) => {
    const template = templateId
        ? await repository.findById(templateId)
        : await repository.findByKey(templateKey);
    if (!template) throw notFound(templateId ?? templateKey);
    return template;
};

export const buildListTemplateAuditLogsUseCase = ({ repository }) => async ({ templateId, limit = 50 }) => {
    const template = await repository.findById(templateId);
    if (!template) throw notFound(templateId);
    return repository.listAuditLogs(templateId, { limit });
};

export const buildCreateDraftTemplateUseCase = ({ repository }) => async ({
    templateKey,
    label,
    baseMode,
    isPreset = false,
    visibility = 'visible',
    owner = null,
    moduleKeys = [],
    actorUser = null
}) => {
    const actorUsername = requireActorUsername(actorUser);
    assertValidModuleSelection(moduleKeys);

    const existing = await repository.findByKey(templateKey);
    if (existing) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `A template with key "${templateKey}" already exists`,
            { statusCode: 409 }
        );
    }

    const template = await repository.create({ templateKey, label, baseMode, isPreset, visibility, owner, moduleKeys });
    await repository.createAuditLog({
        templateId: template.template_id,
        action: 'draft_created',
        actorUsername,
        afterSnapshot: template
    });
    return template;
};

// Only draft templates may have their module list edited. A published
// template's modules are frozen (ADR 0056 clause 2's whole point: nothing
// may retroactively change what an already-materialized tenant Profile
// means). To change a published template's content, deprecate it and
// publish a new template/version instead.
export const buildUpdateTemplateModulesUseCase = ({ repository }) => async ({ templateId, moduleKeys, reason, actorUser = null }) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);

    const template = await repository.findById(templateId);
    if (!template) throw notFound(templateId);
    if (template.status !== 'draft') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Cannot edit modules of a ${template.status} template. Deprecate it and create a new draft instead.`,
            { statusCode: 409 }
        );
    }

    assertValidModuleSelection(moduleKeys);
    const updated = await repository.replaceModules(templateId, moduleKeys);
    await repository.createAuditLog({
        templateId,
        action: 'modules_updated',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: template,
        afterSnapshot: updated
    });
    return updated;
};

export const buildPublishTemplateUseCase = ({ repository }) => async ({ templateId, reason, actorUser = null }) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);

    const template = await repository.findById(templateId);
    if (!template) throw notFound(templateId);
    if (template.status === 'published') return template;
    if (template.status === 'deprecated') {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            'Cannot publish a deprecated template',
            { statusCode: 409 }
        );
    }

    assertValidModuleSelection(template.modules);
    const published = await repository.setStatus(templateId, 'published');
    await repository.createAuditLog({
        templateId,
        action: 'published',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: template,
        afterSnapshot: published
    });
    return published;
};

export const buildDeprecateTemplateUseCase = ({ repository }) => async ({ templateId, reason, actorUser = null }) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);

    const template = await repository.findById(templateId);
    if (!template) throw notFound(templateId);
    if (template.status === 'deprecated') return template;

    const deprecated = await repository.setStatus(templateId, 'deprecated');
    await repository.createAuditLog({
        templateId,
        action: 'deprecated',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: template,
        afterSnapshot: deprecated
    });
    return deprecated;
};
