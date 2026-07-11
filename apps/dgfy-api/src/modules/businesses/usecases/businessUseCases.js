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

const generateInvitationToken = () => crypto.randomUUID();

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
 * Create business use case (API-02, D-10). Business creator automatically
 * becomes owner — repository.create() inserts the business and the owner
 * membership inside one transaction.
 * @param {{repository}} deps
 */
export function buildCreateBusinessUseCase({ repository }) {
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
        try {
            ({ business, membership } = await repository.create({
                business_handle: businessHandle,
                legal_name: legalName,
                display_name: displayName,
                creatorAccountId
            }));
        } catch (error) {
            const conflict = mapUniqueConstraintError(error);
            if (conflict) return ApplicationResult.failure(conflict);
            throw error;
        }

        return ApplicationResult.success({ business, membership });
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
 * @param {{repository, sendEmail}} deps
 */
export function buildOnboardStaffViaInvitationUseCase({ repository, sendEmail }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId } = input;
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

        const existingInvitation = await repository.findInvitationByEmail(businessId, email);
        if (existingInvitation) {
            return ApplicationResult.failure(conflictError('An invitation is already pending for this email.'));
        }
        const existingStaff = await repository.findStaffAccountByEmail(businessId, email);
        if (existingStaff) {
            return ApplicationResult.failure(conflictError('This email is already onboarded to this business.'));
        }

        if (typeof sendEmail !== 'function') {
            return ApplicationResult.failure(serviceUnavailableError('Staff invitation email service is unavailable.'));
        }

        const token = generateInvitationToken();
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
        const invitation = await repository.createInvitation({ businessId, email, name, token, expiresAt });

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

        return ApplicationResult.success({ invitation });
    };
}

/**
 * Staff onboarding via direct add (D-11, sync path). Creates a StaffAccount
 * record immediately. `initialPassword` is optional metadata for the
 * owner's records only — it is NEVER used for staff login (see
 * repository.createStaffAccount()'s doc comment).
 * @param {{repository}} deps
 */
export function buildOnboardStaffDirectUseCase({ repository }) {
    return async (input = {}) => {
        const { businessId, requestingAccountId, initialPassword } = input;
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

        const existingStaff = await repository.findStaffAccountByEmail(businessId, email);
        if (existingStaff) {
            return ApplicationResult.failure(conflictError('This email is already onboarded to this business.'));
        }
        const existingInvitation = await repository.findInvitationByEmail(businessId, email);
        if (existingInvitation) {
            return ApplicationResult.failure(conflictError('An invitation is already pending for this email.'));
        }

        const staffAccount = await repository.createStaffAccount({ businessId, email, name, initialPassword });
        return ApplicationResult.success({ staffAccount });
    };
}

/**
 * Accept invitation use case. Validates the token, marks the invitation
 * accepted, and creates an assignment record. Real DgfyAccount creation for
 * the invitee is a later-wave concern (see repository doc comments).
 * @param {{repository}} deps
 */
export function buildAcceptInvitationUseCase({ repository }) {
    return async (input = {}) => {
        const token = String(input.invitationToken || '').trim();
        if (!token) {
            return ApplicationResult.failure(validationError('invitationToken is required.'));
        }

        const invitation = await repository.findInvitationByToken(token);
        if (!invitation) {
            return ApplicationResult.failure(notFoundError('Invitation not found or invalid.'));
        }
        if (invitation.accepted_at) {
            return ApplicationResult.failure(conflictError('This invitation has already been accepted.'));
        }
        if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
            return ApplicationResult.failure(validationError('This invitation has expired.'));
        }

        await repository.markInvitationAccepted(token);
        const assignment = await repository.createAssignment({
            businessId: invitation.business_id,
            email: invitation.email,
            name: invitation.name,
            token
        });

        return ApplicationResult.success({ assignment });
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
