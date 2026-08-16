import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { withEngineClassification } from '../../shared/constants/registrationIndustries.js';
import {
    WORKFLOW_MODE_VALUES,
    WORKFLOW_MODE_ALIASES,
    getWorkflowModeEngine
} from '../../shared/constants/workflowModes.js';
import { normalizeRegistrationIndustryNiches } from '../registrationIndustryNiches.js';

const notFound = (industryKey) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    `Registration industry not found: ${industryKey}`,
    { statusCode: 404 }
);

const validationFailed = (message) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 422 }
);

// Mirrors storeConfigurationTemplateUseCases.js's requireActorUsername/
// requireReason exactly - every audited platform-admin write in this
// codebase requires an actor and a human-readable reason of the same
// minimum length.
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

const describeRow = (row) => ({
    key: row.industry_key,
    order: row.display_order,
    label: row.label,
    summary: row.summary,
    niches: normalizeRegistrationIndustryNiches(row.niches),
    workflow_mode: row.workflow_mode,
    template_key: row.template_key,
    is_system: row.is_system === true,
    hidden: row.hidden === true,
    hidden_reason: row.hidden_reason ?? null,
    hidden_updated_by: row.updated_by ?? null,
    hidden_updated_at: row.updated_at ?? null,
    ...withEngineClassification(row)
});

// Every non-alias member of WORKFLOW_MODE_VALUES - the same "offered modes"
// accounting registrationIndustries.contract.test.js pins the seed baseline
// against. Unlike adminTemplateValidator.js's TEMPLATE_AUTHORABLE_MODES,
// external-engine modes ARE selectable here: a registration industry with
// no template (mode-only provisioning) is a legitimate, existing shape
// (healthcare, ticketing_transport, ...) - it is templates, not industries,
// that clause 3 restricts to native/transitional modes.
const OFFERED_WORKFLOW_MODES = WORKFLOW_MODE_VALUES.filter((mode) => !(mode in WORKFLOW_MODE_ALIASES));

// The cross-field validation Joi can't express: workflow_mode must be a
// real, de-aliased, offered mode (ADR 0056 clause 3 - the vocabulary
// itself stays code-owned; an industry row may only reference it), and
// template_key must be null iff the mode's engine is external, otherwise
// it must reference an existing, published template whose base_mode
// matches - the same invariant registrationIndustries.contract.test.js
// pins for the seed baseline, now enforced for every admin write too.
const validateModeAndTemplate = async (workflowMode, templateKey, templateRepository) => {
    const normalizedMode = String(workflowMode || '').trim().toLowerCase();
    if (!OFFERED_WORKFLOW_MODES.includes(normalizedMode)) {
        throw validationFailed(`workflow_mode "${workflowMode}" is not a recognized, offered workflow mode`);
    }

    const engine = getWorkflowModeEngine(normalizedMode);
    const normalizedTemplateKey = templateKey === null || templateKey === undefined || String(templateKey).trim() === ''
        ? null
        : String(templateKey).trim();

    if (engine === 'external') {
        if (normalizedTemplateKey !== null) {
            throw validationFailed(`template_key must be null for an external-engine workflow_mode ("${normalizedMode}")`);
        }
        return { workflowMode: normalizedMode, templateKey: null };
    }

    if (normalizedTemplateKey === null) {
        throw validationFailed(`template_key is required for workflow_mode "${normalizedMode}"`);
    }

    const template = await templateRepository.findByKey(normalizedTemplateKey);
    if (!template) {
        throw validationFailed(`template_key "${normalizedTemplateKey}" does not reference an existing template`);
    }
    if (template.status !== 'published') {
        throw validationFailed(`template_key "${normalizedTemplateKey}" must reference a published template`);
    }
    if (template.base_mode !== normalizedMode) {
        throw validationFailed(`template_key "${normalizedTemplateKey}"'s base_mode ("${template.base_mode}") does not match workflow_mode ("${normalizedMode}")`);
    }

    return { workflowMode: normalizedMode, templateKey: normalizedTemplateKey };
};

// Admin-facing list (issue #178 Phase 39, DB-driven by issue #316): every
// row in the registration_industries catalog table, including any
// admin-created industry the seed-baseline constant has never heard of.
// Unlike the public listRegistrationIndustriesUseCase, engine
// classification is left in place here - this is an admin surface.
export const buildListAdminRegistrationIndustriesUseCase = ({ repository }) => async () => {
    const rows = await repository.findAll();
    return rows.map(describeRow);
};

// New industries are created hidden by default (issue #316) - a
// draft-ish workflow without a full lifecycle. is_system is never
// accepted from the API; repository.create() always sets it false.
export const buildCreateRegistrationIndustryUseCase = ({ repository, templateRepository }) => async ({
    industryKey,
    label,
    summary,
    niches = [],
    workflowMode,
    templateKey = null,
    displayOrder,
    reason,
    actorUser = null
}) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);
    const normalizedKey = String(industryKey || '').trim().toLowerCase();

    const existing = await repository.findByKey(normalizedKey);
    if (existing) {
        throw new DomainError(
            DomainErrorCode.CONFLICT,
            `Registration industry already exists: ${normalizedKey}`,
            { statusCode: 409 }
        );
    }

    const validated = await validateModeAndTemplate(workflowMode, templateKey, templateRepository);

    const displayOrderProvided = Number.isFinite(Number(displayOrder)) && Number(displayOrder) > 0;
    const resolvedOrder = displayOrderProvided
        ? Math.trunc(Number(displayOrder))
        : (await repository.getMaxDisplayOrder()) + 1;

    const row = await repository.create({
        industryKey: normalizedKey,
        label: String(label || '').trim().slice(0, 120),
        summary: String(summary || '').trim().slice(0, 500),
        niches: normalizeRegistrationIndustryNiches(niches),
        workflowMode: validated.workflowMode,
        templateKey: validated.templateKey,
        displayOrder: resolvedOrder,
        actorUsername,
        reason: normalizedReason
    });

    return describeRow(row);
};

// System (seeded baseline) rows are undeletable and mode-immutable - only
// the platform seed sets workflow_mode on them, the curation surface never
// does, mirroring StoreConfigurationTemplate.is_preset. Admin-created rows
// remain fully editable, including workflow_mode: with no delete endpoint
// anywhere in this feature, an admin who mispicks a mode at create time
// must otherwise be stuck with a permanently unfixable row.
export const buildUpdateRegistrationIndustryUseCase = ({ repository, templateRepository }) => async ({
    industryKey,
    label,
    summary,
    niches,
    workflowMode,
    templateKey,
    displayOrder,
    reason,
    actorUser = null
}) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);
    const normalizedKey = String(industryKey || '').trim();

    const existing = await repository.findByKey(normalizedKey);
    if (!existing) throw notFound(industryKey);

    // Only workflow_mode is locked on a system row - template_key stays
    // editable (a system industry's template can be repointed at a
    // different published preset without touching its mode), matching the
    // design note on buildCreateRegistrationIndustryUseCase's doc comment.
    if (workflowMode !== undefined && existing.is_system === true) {
        throw validationFailed("A baseline industry's operating mode is engineering-owned and cannot be changed");
    }

    const modeOrTemplateChanging = workflowMode !== undefined || templateKey !== undefined;

    const fields = {};

    if (label !== undefined) {
        const nextLabel = String(label).trim().slice(0, 120);
        if (nextLabel !== existing.label) fields.label = nextLabel;
    }
    if (summary !== undefined) {
        const nextSummary = String(summary).trim().slice(0, 500);
        if (nextSummary !== existing.summary) fields.summary = nextSummary;
    }
    if (niches !== undefined) {
        const nextNiches = normalizeRegistrationIndustryNiches(niches);
        if (JSON.stringify(nextNiches) !== JSON.stringify(existing.niches)) fields.niches = nextNiches;
    }
    if (displayOrder !== undefined) {
        const nextOrder = Math.trunc(Number(displayOrder));
        if (Number.isFinite(nextOrder) && nextOrder > 0 && nextOrder !== existing.display_order) fields.display_order = nextOrder;
    }
    if (modeOrTemplateChanging) {
        const effectiveMode = workflowMode !== undefined ? workflowMode : existing.workflow_mode;
        const effectiveTemplateKey = templateKey !== undefined ? templateKey : existing.template_key;
        const validated = await validateModeAndTemplate(effectiveMode, effectiveTemplateKey, templateRepository);
        if (validated.workflowMode !== existing.workflow_mode) fields.workflow_mode = validated.workflowMode;
        if (validated.templateKey !== existing.template_key) fields.template_key = validated.templateKey;
    }

    if (Object.keys(fields).length === 0) {
        return describeRow(existing);
    }

    fields.updated_by = actorUsername;
    const after = await repository.updateByKey(normalizedKey, fields);
    await repository.createAuditLog({
        industryKey: normalizedKey,
        action: 'updated',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: existing,
        afterSnapshot: after
    });

    return describeRow(after);
};

// Toggling visibility is idempotent-with-no-audit-write when the requested
// state matches the current one, mirroring buildPublishTemplateUseCase's
// "if (status === 'published') return template" short-circuit - a repeat
// hide/unhide is a no-op, not a fresh audit event. Re-backed onto the
// unified catalog repository (issue #316) - the API contract (route,
// payload shape, response shape) is unchanged from Phase 39.
export const buildSetRegistrationIndustryVisibilityUseCase = ({ repository }) => async ({
    industryKey,
    hidden,
    reason,
    actorUser = null
}) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);
    const normalizedKey = String(industryKey || '').trim();

    const before = await repository.findByKey(normalizedKey);
    if (!before) throw notFound(industryKey);

    const currentlyHidden = before.hidden === true;
    if (currentlyHidden === Boolean(hidden)) {
        return describeRow(before);
    }

    const after = await repository.updateByKey(normalizedKey, {
        hidden: Boolean(hidden),
        hidden_reason: normalizedReason,
        updated_by: actorUsername
    });
    await repository.createAuditLog({
        industryKey: normalizedKey,
        action: hidden ? 'hidden' : 'unhidden',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: before,
        afterSnapshot: after
    });

    return describeRow(after);
};

export const buildListRegistrationIndustryVisibilityAuditLogsUseCase = ({ repository }) => async ({ industryKey, limit = 50 }) => {
    const normalizedKey = String(industryKey || '').trim();
    const existing = await repository.findByKey(normalizedKey);
    if (!existing) throw notFound(industryKey);
    return repository.listAuditLogs(normalizedKey, { limit });
};
