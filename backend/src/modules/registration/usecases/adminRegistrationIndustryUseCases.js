import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
    REGISTRATION_INDUSTRY_KEYS,
    describeRegistrationIndustry,
    resolveRegistrationIndustry
} from '../../shared/constants/registrationIndustries.js';

const notFound = (industryKey) => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    `Registration industry not found: ${industryKey}`,
    { statusCode: 404 }
);

// Mirrors storeConfigurationTemplateUseCases.js's requireActorUsername/
// requireReason exactly - every audited platform-admin write in this
// codebase requires an actor and a human-readable reason of the same
// minimum length, and toggling registration visibility is no exception.
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

const describeWithVisibility = (key, visibilityByKey) => {
    const entry = describeRegistrationIndustry(key);
    const visibility = visibilityByKey.get(key) || null;
    return {
        ...entry,
        hidden: visibility?.hidden === true,
        hidden_reason: visibility?.reason ?? null,
        hidden_updated_by: visibility?.updated_by ?? null,
        hidden_updated_at: visibility?.updated_at ?? null
    };
};

// Admin-facing list (issue #178 Phase 39): every registration Industry,
// left-joined against whatever visibility state an admin has set. Unlike
// the public listRegistrationIndustriesUseCase, engine classification is
// left in place here - this is an admin surface.
export const buildListAdminRegistrationIndustriesUseCase = ({ repository }) => async () => {
    const rows = await repository.findAll();
    const visibilityByKey = new Map(rows.map((row) => [row.industry_key, row]));
    return REGISTRATION_INDUSTRY_KEYS.map((key) => describeWithVisibility(key, visibilityByKey));
};

// Toggling visibility is idempotent-with-no-audit-write when the requested
// state matches the current one, mirroring buildPublishTemplateUseCase's
// "if (status === 'published') return template" short-circuit - a repeat
// hide/unhide is a no-op, not a fresh audit event.
export const buildSetRegistrationIndustryVisibilityUseCase = ({ repository }) => async ({
    industryKey,
    hidden,
    reason,
    actorUser = null
}) => {
    const actorUsername = requireActorUsername(actorUser);
    const normalizedReason = requireReason(reason);

    // resolveRegistrationIndustry() returns the raw catalog entry (no `key`
    // field of its own - only describeRegistrationIndustry() adds that), so
    // the normalized input string, not a field on the resolved entry, is
    // the canonical key from here on - the same pattern
    // registerCompanyRequestUseCase.js uses.
    const normalizedKey = String(industryKey || '').trim();
    const resolved = resolveRegistrationIndustry(normalizedKey);
    if (!resolved) throw notFound(industryKey);

    const before = await repository.findByKey(normalizedKey);
    const currentlyHidden = before?.hidden === true;
    if (currentlyHidden === Boolean(hidden)) {
        const visibilityByKey = new Map(before ? [[before.industry_key, before]] : []);
        return describeWithVisibility(normalizedKey, visibilityByKey);
    }

    const after = await repository.upsertVisibility({
        industryKey: normalizedKey,
        hidden: Boolean(hidden),
        reason: normalizedReason,
        actorUsername
    });
    await repository.createAuditLog({
        industryKey: normalizedKey,
        action: hidden ? 'hidden' : 'unhidden',
        actorUsername,
        reason: normalizedReason,
        beforeSnapshot: before,
        afterSnapshot: after
    });

    return describeWithVisibility(normalizedKey, new Map([[after.industry_key, after]]));
};

export const buildListRegistrationIndustryVisibilityAuditLogsUseCase = ({ repository }) => async ({ industryKey, limit = 50 }) => {
    const normalizedKey = String(industryKey || '').trim();
    const resolved = resolveRegistrationIndustry(normalizedKey);
    if (!resolved) throw notFound(industryKey);
    return repository.listAuditLogs(normalizedKey, { limit });
};
