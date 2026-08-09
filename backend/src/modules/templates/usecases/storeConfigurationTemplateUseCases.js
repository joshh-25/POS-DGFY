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

export const buildCreateDraftTemplateUseCase = ({ repository }) => async ({
    templateKey,
    label,
    baseMode,
    isPreset = false,
    visibility = 'visible',
    owner = null,
    moduleKeys = []
}) => {
    assertValidModuleSelection(moduleKeys);

    const existing = await repository.findByKey(templateKey);
    if (existing) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `A template with key "${templateKey}" already exists`,
            { statusCode: 409 }
        );
    }

    return repository.create({ templateKey, label, baseMode, isPreset, visibility, owner, moduleKeys });
};

// Only draft templates may have their module list edited. A published
// template's modules are frozen (ADR 0056 clause 2's whole point: nothing
// may retroactively change what an already-materialized tenant Profile
// means). To change a published template's content, deprecate it and
// publish a new template/version instead.
export const buildUpdateTemplateModulesUseCase = ({ repository }) => async ({ templateId, moduleKeys }) => {
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
    return repository.replaceModules(templateId, moduleKeys);
};

export const buildPublishTemplateUseCase = ({ repository }) => async ({ templateId }) => {
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
    return repository.setStatus(templateId, 'published');
};

export const buildDeprecateTemplateUseCase = ({ repository }) => async ({ templateId }) => {
    const template = await repository.findById(templateId);
    if (!template) throw notFound(templateId);
    if (template.status === 'deprecated') return template;
    return repository.setStatus(templateId, 'deprecated');
};
