import crypto from 'crypto';
import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';

// businessUseCases.js — Clean Architecture Application layer, mirroring
// ../../accounts/usecases/accountUseCases.js. Each builder receives its
// dependencies via closure (repository, sendEmail) per Dependency Inversion,
// and every use case always returns an ApplicationResult. No HTTP concerns,
// no direct model imports — only the injected repository abstraction.

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BUSINESS_HANDLE_PATTERN = /^[a-z0-9-]{3,120}$/;
const ALLOWED_BUSINESS_STATUSES = ['pending', 'active', 'suspended', 'archived'];
// Mirrors ../../accounts/entities/accountEntity.js's EMAIL_FORMAT_PATTERN
// (WR-02) — kept as a local equivalent regex rather than importing the
// accounts module's entity, preserving this module's "only the injected
// repository abstraction" dependency boundary.
const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeHandle = (value) => String(value || '').trim().toLowerCase();
const normalizeText = (value) => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    return trimmed || null;
};
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isValidEmailFormat = (value) => typeof value === 'string' && EMAIL_FORMAT_PATTERN.test(value.trim());

const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/**
 * Escapes HTML-significant characters before interpolating user-supplied
 * text into an email's HTML body (WR-01). business.display_name/legal_name
 * are only normalized for whitespace, never restricted to safe characters,
 * so this guards against HTML injection in invitation emails (e.g. a
 * spoofed link/branding rendered in the invitee's email client).
 * @param {string} value
 * @returns {string}
 */
const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const conflictError = (message, details = null) => new DomainError(
    DomainErrorCode.CONFLICT,
    message,
    { statusCode: 409, details }
);

const notFoundError = (message = 'Business not found.') => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    message,
    { statusCode: 404 }
);

const forbiddenError = (message) => new DomainError(
    DomainErrorCode.AUTHORIZATION_FAILED,
    message,
    { statusCode: 403 }
);

const serviceUnavailableError = (message) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503 }
);

const noTenantDatabaseError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'No tenant database is registered for this business.',
    { statusCode: 404, details: { error_code: 'NO_TENANT_DATABASE' } }
);

/**
 * Wave 7 gap-closure (04-07-PLAN.md): duck-types on
 * `error.name === 'TenantDatabaseUnavailableError'` rather than importing
 * staffOnboardingRepository.js's class directly — mirrors
 * ../locationUseCases.js's identical convention of not reaching into a
 * sibling module's internals.
 * @param {Error} error
 */
const isTenantDatabaseUnavailableError = (error) => Boolean(error) && error.name === 'TenantDatabaseUnavailableError';

/**
 * Maps a thrown TenantDatabaseUnavailableError to a stable
 * ApplicationResult-ready DomainError — mirrors
 * ../locationUseCases.js's mapTenantDatabaseError() exactly.
 * @param {Error} error
 */
const mapTenantDatabaseError = (error) => {
    if (error.reason === 'missing' || error.reason === 'not_configured') {
        return noTenantDatabaseError();
    }
    return new DomainError(
        DomainErrorCode.SERVICE_UNAVAILABLE,
        error.message,
        { statusCode: 503, details: { error_code: 'TENANT_DATABASE_UNAVAILABLE', reason: error.reason } }
    );
};

// Wave 7 (04-07-PLAN.md): the invitation token is `${businessId}:${uuid}` —
// a composite, opaque-to-clients token whose cleartext businessId prefix is
// required to resolve WHICH tenant database an unauthenticated
// `POST /invitations/:token/accept` request should look the invitation up
// in (staff onboarding data now lives in per-business tenant databases, not
// a single process-local Map keyed by token). The uuid suffix is still the
// only part that matters for the persisted token_hash — this composite
// shape does not weaken the hash-only-persistence guarantee (T-04-07-02):
// the full raw composite token is hashed, never just the uuid part.
const generateInvitationToken = (businessId) => `${businessId}:${crypto.randomUUID()}`;

/**
 * @param {string} rawToken
 * @returns {string|null} the businessId prefix, or null if the token does
 *   not have the expected `${businessId}:${uuid}` shape.
 */
const parseBusinessIdFromToken = (rawToken) => {
    const separatorIndex = rawToken.indexOf(':');
    if (separatorIndex <= 0) return null;
    return rawToken.slice(0, separatorIndex);
};

/**
 * Translates a Sequelize unique-constraint violation (business_handle) into
 * the same conflictError() shape the pre-check (findByHandle) path already
 * returns. Guards against the check-then-write race where two concurrent
 * requests both pass the pre-check and only the DB-level unique index
 * catches the second write (CR-01, mirrors ../../accounts/usecases/
 * accountUseCases.js's mapUniqueConstraintError). Returns null when the
 * error isn't a unique-constraint violation, so callers can re-throw
 * anything unexpected.
 * @param {Error} error
 * @returns {DomainError|null}
 */
const mapUniqueConstraintError = (error) => {
    if (error?.name !== 'SequelizeUniqueConstraintError') return null;
    return conflictError(
        'A business already exists with this handle.',
        { error_code: 'DUPLICATE_BUSINESS_HANDLE', field: 'business_handle' }
    );
};

/**
 * Shared access-control helper: resolves the requester's membership and
 * optionally enforces a specific role. Callers only enforce this when a
 * `requestingAccountId` is supplied, so this stays usable both from
 * HTTP-authenticated controllers and from unauthenticated internal callers.
 * @returns {Promise<{membership?: Object, error?: DomainError}>}
 */
async function requireMembership(repository, businessId, accountId, { role } = {}) {
    const membership = await repository.getMembership(accountId, businessId);
    if (!membership || membership.status !== 'active') {
        return { error: forbiddenError('You are not a member of this business.') };
    }
    if (role && membership.role !== role) {
        return { error: forbiddenError(`Only a business ${role} can perform this action.`) };
    }
    return { membership };
}

/**
 * Create business use case (API-02, API-03, D-10). Business creator
 * automatically becomes owner — repository.createWithOwnerAndRegistry()
 * inserts the business, the owner membership, and (when
 * businessDatabaseRegistryRepository is supplied) safe tenant registry
 * metadata, all inside one shared landlord transaction: a registry write
 * failure rolls back the business and membership rows too.
 *
 * `businessDatabaseRegistryRepository` is optional (mirrors
 * ../index.js's buildBusinessesModule() doc comment: it may be null before a
 * BusinessDatabaseRegistry model is wired up) — when omitted, the response
 * simply has no `tenant_registry` key, exactly matching this use case's
 * pre-existing (pre-04-06) response shape.
 * @param {{repository, businessDatabaseRegistryRepository?}} deps
 */
export function buildCreateBusinessUseCase({ repository, businessDatabaseRegistryRepository } = {}) {
    return async (input = {}) => {
        const legalName = normalizeText(input.legal_name);
        const displayName = normalizeText(input.display_name);
        const businessHandle = normalizeHandle(input.business_handle);
        const creatorAccountId = input.creatorAccountId;

        if (!legalName || !displayName || !businessHandle || !creatorAccountId) {
            return ApplicationResult.failure(validationError(
                'legal_name, display_name, business_handle, and an authenticated account are required.'
            ));
        }

        if (!BUSINESS_HANDLE_PATTERN.test(businessHandle)) {
            return ApplicationResult.failure(validationError(
                'business_handle must be 3-120 characters using lowercase letters, numbers, and hyphens only.',
                { field: 'business_handle' }
            ));
        }

        const existing = await repository.findByHandle(businessHandle);
        if (existing) {
            return ApplicationResult.failure(conflictError(
                'A business already exists with this handle.',
                { error_code: 'DUPLICATE_BUSINESS_HANDLE', field: 'business_handle' }
            ));
        }

        let business;
        let membership;
        let tenantRegistry;
        try {
            ({ business, membership, tenantRegistry } = await repository.createWithOwnerAndRegistry({
                payload: { business_handle: businessHandle, legal_name: legalName, display_name: displayName },
                accountId: creatorAccountId,
                registryRepository: businessDatabaseRegistryRepository || null
            }));
        } catch (error) {
            const conflict = mapUniqueConstraintError(error);
            if (conflict) return ApplicationResult.failure(conflict);
            throw error;
        }

        const data = { business, membership };
        if (businessDatabaseRegistryRepository && tenantRegistry) {
            data.tenant_registry = businessDatabaseRegistryRepository.toSafeMetadata(tenantRegistry);
        }

        return ApplicationResult.success(data);
    };
}

/**
 * @param {{repository}} deps
 */
export function buildListUserBusinessesUseCase({ repository }) {
    return async (input = {}) => {
        if (!input.accountId) {
            return ApplicationResult.failure(validationError('accountId is required.'));
        }

        const businesses = await repository.findAccountBusinesses(input.accountId);
        return ApplicationResult.success({ businesses });
    };
}

/**
 * Enforces membership (D-04-style access control) when requestingAccountId
 * is supplied — the HTTP layer always supplies it (authenticated route).
 * @param {{repository}} deps
 */
export function buildGetBusinessUseCase({ repository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const business = await repository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        if (requestingAccountId) {
            const { error } = await requireMembership(repository, businessId, requestingAccountId);
            if (error) return ApplicationResult.failure(error);
        }

        return ApplicationResult.success({ business });
    };
}

/**
 * Enforces owner-role access control when requestingAccountId is supplied.
 * @param {{repository}} deps
 */
export function buildUpdateBusinessUseCase({ repository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, updates = {} } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const business = await repository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        if (requestingAccountId) {
            const { error } = await requireMembership(repository, businessId, requestingAccountId, { role: 'owner' });
            if (error) return ApplicationResult.failure(error);
        }

        const patch = {};
        const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);

        if (has('legal_name')) {
            const legalName = normalizeText(updates.legal_name);
            if (!legalName) return ApplicationResult.failure(validationError('legal_name cannot be empty.'));
            patch.legal_name = legalName;
        }

        if (has('display_name')) {
            const displayName = normalizeText(updates.display_name);
            if (!displayName) return ApplicationResult.failure(validationError('display_name cannot be empty.'));
            patch.display_name = displayName;
        }

        if (has('status')) {
            if (!ALLOWED_BUSINESS_STATUSES.includes(updates.status)) {
                return ApplicationResult.failure(validationError('Invalid business status.', { field: 'status' }));
            }
            patch.status = updates.status;
        }

        let updated;
        try {
            updated = await repository.update(businessId, patch);
        } catch (error) {
            const conflict = mapUniqueConstraintError(error);
            if (conflict) return ApplicationResult.failure(conflict);
            throw error;
        }
        return ApplicationResult.success({ business: updated });
    };
}

/**
 * Staff onboarding via email invitation (D-11, async path). Staff does NOT
 * receive a DgfyAccount or StaffAccount yet — that happens during
 * buildAcceptInvitationUseCase. Requires the requester to be the business
 * owner when requestingAccountId is supplied.
 *
 * Wave 7 gap-closure (04-07-PLAN.md, API-02/API-04): `repository`
 * (BusinessRepository) is used ONLY for business existence + landlord
 * membership/owner-role access control now — invitation persistence lives
 * in the tenant database via `staffOnboardingRepository`
 * (StaffOnboardingRepository), closing the process-local invitation store
 * 04-03-SUMMARY.md sanctioned as a temporary Wave 3 measure.
 * @param {{repository, staffOnboardingRepository, sendEmail}} deps
 */
export function buildOnboardStaffViaInvitationUseCase({ repository, staffOnboardingRepository, sendEmail }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
        const email = normalizeEmail(input.email);

        if (!businessId || !email) {
            return ApplicationResult.failure(validationError('businessId and email are required.'));
        }

        if (!isValidEmailFormat(email)) {
            return ApplicationResult.failure(validationError('Enter a valid email address.', { field: 'email' }));
        }

        const business = await repository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        if (requestingAccountId) {
            const { error } = await requireMembership(repository, businessId, requestingAccountId, { role: 'owner' });
            if (error) return ApplicationResult.failure(error);
        }

        try {
            const existingInvitation = await staffOnboardingRepository.findInvitationByEmail(businessId, email);
            if (existingInvitation) {
                return ApplicationResult.failure(conflictError('An invitation is already pending for this email.'));
            }
            const existingStaff = await staffOnboardingRepository.findStaffAccountByEmail(businessId, email);
            if (existingStaff) {
                return ApplicationResult.failure(conflictError('This email is already onboarded to this business.'));
            }

            if (typeof sendEmail !== 'function') {
                return ApplicationResult.failure(
                    serviceUnavailableError('Staff invitation email service is unavailable.')
                );
            }

            const token = generateInvitationToken(businessId);
            const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
            const invitation = await staffOnboardingRepository.createInvitation({ businessId, email, token, expiresAt });

            const businessLabel = business.display_name || business.legal_name;
            const businessLabelHtml = escapeHtml(businessLabel);
            try {
                await sendEmail({
                    to: email,
                    subject: `You're invited to join ${businessLabel} on DGFY`,
                    text: `You have been invited to join ${businessLabel} on DGFY. `
                        + `Accept your invitation using this token: ${token}`,
                    html: `<p>You have been invited to join <strong>${businessLabelHtml}</strong> on DGFY.</p>`
                        + `<p>Accept your invitation using this token: <code>${token}</code></p>`
                });
            } catch (error) {
                return ApplicationResult.failure(serviceUnavailableError('Failed to send the invitation email.'));
            }

            // The raw token is only ever surfaced here (transient response +
            // outbound email) — the persisted invitation row carries only a
            // token_hash (T-04-07-02).
            return ApplicationResult.success({ invitation: { ...invitation, token } });
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Staff onboarding via direct add (D-11, sync path). Creates a StaffAccount
 * record immediately and, when `dgfyAccountId` (a target DGFY account to
 * link) is supplied, an active tenant assignment too — staff-to-DGFY-account
 * linking is otherwise deferred (04-07-PLAN.md's Source Audit / Deferred
 * section: "Deferred staff-to-DGFY account linking ... are not planned").
 * `initialPassword` is accepted for controller-body compatibility but is no
 * longer forwarded anywhere — the real tenant staff_accounts schema has no
 * password/credential column (see staffOnboardingRepository.js's doc
 * comment); staff login credentials always come from their own DgfyAccount.
 * @param {{repository, staffOnboardingRepository}} deps
 */
export function buildOnboardStaffDirectUseCase({ repository, staffOnboardingRepository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, dgfyAccountId } = input;
        const email = normalizeEmail(input.email);
        const name = normalizeText(input.name);

        if (!businessId || !email) {
            return ApplicationResult.failure(validationError('businessId and email are required.'));
        }

        if (!isValidEmailFormat(email)) {
            return ApplicationResult.failure(validationError('Enter a valid email address.', { field: 'email' }));
        }

        const business = await repository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        if (requestingAccountId) {
            const { error } = await requireMembership(repository, businessId, requestingAccountId, { role: 'owner' });
            if (error) return ApplicationResult.failure(error);
        }

        try {
            const existingStaff = await staffOnboardingRepository.findStaffAccountByEmail(businessId, email);
            if (existingStaff) {
                return ApplicationResult.failure(conflictError('This email is already onboarded to this business.'));
            }
            const existingInvitation = await staffOnboardingRepository.findInvitationByEmail(businessId, email);
            if (existingInvitation) {
                return ApplicationResult.failure(conflictError('An invitation is already pending for this email.'));
            }

            const staffAccount = await staffOnboardingRepository.createStaffAccount({ businessId, email, name });

            let assignment = null;
            if (dgfyAccountId) {
                assignment = await staffOnboardingRepository.createOrActivateAssignment({
                    businessId,
                    dgfyAccountId,
                    staffAccountId: staffAccount.id,
                    role: 'staff'
                });
            }

            const data = { staffAccount };
            if (assignment) data.assignment = assignment;
            return ApplicationResult.success(data);
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Accept invitation use case. Validates the token, marks the invitation
 * accepted, and creates/links a StaffAccount plus (when `dgfyAccountId` is
 * supplied — the invitee's own DGFY account) an active tenant assignment.
 * Real DgfyAccount creation for the invitee is a later-wave concern (see
 * staffOnboardingRepository.js's doc comments and 04-07-PLAN.md's Deferred
 * section).
 *
 * Wave 7 gap-closure (04-07-PLAN.md): the invitation token's cleartext
 * `${businessId}:${uuid}` prefix (see generateInvitationToken()'s doc
 * comment) is parsed to resolve WHICH tenant database to look the
 * invitation up in — required now that invitations live per-tenant rather
 * than in one process-local Map keyed by token alone.
 * @param {{staffOnboardingRepository}} deps
 */
export function buildAcceptInvitationUseCase({ staffOnboardingRepository }) {
    return async (input = {}) => {
        const rawToken = String(input.invitationToken || '').trim();
        if (!rawToken) {
            return ApplicationResult.failure(validationError('invitationToken is required.'));
        }

        const businessId = parseBusinessIdFromToken(rawToken);
        if (!businessId) {
            return ApplicationResult.failure(notFoundError('Invitation not found or invalid.'));
        }

        try {
            const invitation = await staffOnboardingRepository.findInvitationByToken(businessId, rawToken);
            if (!invitation) {
                return ApplicationResult.failure(notFoundError('Invitation not found or invalid.'));
            }
            if (invitation.status === 'accepted') {
                return ApplicationResult.failure(conflictError('This invitation has already been accepted.'));
            }
            if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
                return ApplicationResult.failure(validationError('This invitation has expired.'));
            }

            await staffOnboardingRepository.markInvitationAccepted(businessId, rawToken);

            let staffAccount = await staffOnboardingRepository.findStaffAccountByEmail(businessId, invitation.email);
            if (!staffAccount) {
                staffAccount = await staffOnboardingRepository.createStaffAccount({
                    businessId,
                    email: invitation.email
                });
            }

            let assignment = null;
            if (input.dgfyAccountId) {
                assignment = await staffOnboardingRepository.createOrActivateAssignment({
                    businessId,
                    dgfyAccountId: input.dgfyAccountId,
                    staffAccountId: staffAccount.id,
                    role: 'staff'
                });
            }

            const data = { staffAccount };
            if (assignment) data.assignment = assignment;
            return ApplicationResult.success(data);
        } catch (tenantError) {
            if (isTenantDatabaseUnavailableError(tenantError)) {
                return ApplicationResult.failure(mapTenantDatabaseError(tenantError));
            }
            throw tenantError;
        }
    };
}

/**
 * Enforces membership (any role) access control when requestingAccountId is
 * supplied.
 * @param {{repository}} deps
 */
export function buildListBusinessMembersUseCase({ repository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
        if (!businessId) {
            return ApplicationResult.failure(validationError('businessId is required.'));
        }

        const business = await repository.findById(businessId);
        if (!business) {
            return ApplicationResult.failure(notFoundError());
        }

        if (requestingAccountId) {
            const { error } = await requireMembership(repository, businessId, requestingAccountId);
            if (error) return ApplicationResult.failure(error);
        }

        const members = await repository.listMembers(businessId);
        return ApplicationResult.success({ members });
    };
}
