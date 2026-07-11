import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ApplicationResult } from '../../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../../shared/contracts/domainErrors.js';
import { AccountEntity } from '../entities/accountEntity.js';

// accountUseCases.js — Clean Architecture Application layer. Each builder
// receives its dependencies via closure (repository, entity validators,
// password hashing/comparison) per Dependency Inversion, and every use case
// always returns an ApplicationResult — no exceptions leak past this layer.
// No HTTP concerns, no direct model imports (only the AccountEntity domain
// model and the injected repository abstraction).

const SESSION_TOKEN_EXPIRY = process.env.ACCOUNT_SESSION_JWT_EXPIRY || process.env.JWT_EXPIRY || '24h';
const SESSION_TOKEN_EXPIRY_SECONDS = 24 * 60 * 60;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeName = (value) => {
    const trimmed = String(value || '').trim().replace(/\s+/g, ' ');
    return trimmed || null;
};
const normalizePhone = (value) => {
    const trimmed = String(value || '').trim();
    return trimmed || null;
};

const validationError = (message, details = null) => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    message,
    { statusCode: 400, details }
);

const conflictError = (field) => new DomainError(
    DomainErrorCode.CONFLICT,
    field === 'phone'
        ? 'An account already exists with this phone number.'
        : 'An account already exists with this email.',
    { statusCode: 409, details: { error_code: `DUPLICATE_${field.toUpperCase()}`, field } }
);

const notFoundError = () => new DomainError(
    DomainErrorCode.RESOURCE_NOT_FOUND,
    'Account not found.',
    { statusCode: 404 }
);

const invalidCredentialsError = () => new DomainError(
    DomainErrorCode.AUTHENTICATION_FAILED,
    'Invalid email or password.',
    { statusCode: 401 }
);

const currentPasswordRequiredError = () => new DomainError(
    DomainErrorCode.VALIDATION_FAILED,
    'current_password is required to change your email or password.',
    { statusCode: 400, details: { field: 'current_password' } }
);

const currentPasswordInvalidError = () => new DomainError(
    DomainErrorCode.AUTHENTICATION_FAILED,
    'The current password you entered is incorrect.',
    { statusCode: 401, details: { field: 'current_password' } }
);

const serviceUnavailableError = (message) => new DomainError(
    DomainErrorCode.SERVICE_UNAVAILABLE,
    message,
    { statusCode: 503 }
);

/**
 * Translates a Sequelize unique-constraint violation into the same
 * conflictError() shape the pre-check (findByEmail/findByPhone) path
 * already returns. Guards against the check-then-write race where two
 * concurrent requests both pass the pre-check and only the DB-level unique
 * index catches the second write (CR-01). Returns null (not this app's
 * concern) when the error isn't a unique-constraint violation, so callers
 * can re-throw anything unexpected.
 * @param {Error} error
 * @returns {DomainError|null}
 */
const mapUniqueConstraintError = (error) => {
    if (error?.name !== 'SequelizeUniqueConstraintError') return null;
    const path = error.errors?.[0]?.path || '';
    const field = path.includes('phone') ? 'phone' : 'email';
    return conflictError(field);
};

/**
 * Strips internal fields (password_hash) before returning an account to a
 * caller. Applied at every use case boundary that returns account data.
 * @param {import('../entities/accountEntity.js').AccountEntity|null} account
 */
export const sanitizeAccount = (account) => {
    if (!account) return null;
    return {
        id: account.id,
        first_name: account.first_name,
        last_name: account.last_name,
        email: account.email,
        phone: account.phone,
        status: account.status,
        email_verified_at: account.email_verified_at || null,
        phone_verified_at: account.phone_verified_at || null,
        last_login_at: account.last_login_at || null,
        is_email_verified: Boolean(account.email_verified_at)
    };
};

/**
 * Session token per D-07 (match existing backend behavior — JWT with a jti,
 * signed with the shared JWT_SECRET). Uses a distinct token_scope
 * ('dgfy_account_session') from dgfyAuth's tokens ('dgfy') so the two
 * modules' sessions are never confused, even though dgfyAuth is out of
 * scope for Phase 4.
 * @param {import('../entities/accountEntity.js').AccountEntity} account
 */
export const generateAccountSessionToken = (account) => jwt.sign({
    token_scope: 'dgfy_account_session',
    jti: randomUUID(),
    account_id: account.id,
    email: account.email
}, process.env.JWT_SECRET, { expiresIn: SESSION_TOKEN_EXPIRY });

/**
 * Registration use case (API-01). Creates an account immediately but marked
 * unverified (D-01) — email_verified_at stays null; login still works.
 * @param {{repository, accountEntity?, hashPassword}} deps
 */
export function buildRegisterAccountUseCase({ repository, accountEntity = AccountEntity, hashPassword }) {
    return async (input = {}) => {
        const email = normalizeEmail(input.email);
        const password = String(input.password || '');
        const firstName = normalizeName(input.first_name);
        const lastName = normalizeName(input.last_name);
        const phone = normalizePhone(input.phone);

        if (!email || !password) {
            return ApplicationResult.failure(validationError('Email and password are required.'));
        }

        if (!accountEntity.validateEmailFormat(email)) {
            return ApplicationResult.failure(validationError('Enter a valid email address.', { field: 'email' }));
        }

        if (!accountEntity.validatePasswordStrength(password)) {
            return ApplicationResult.failure(
                validationError('Password must be at least 8 characters.', { field: 'password' })
            );
        }

        const existingByEmail = await repository.findByEmail(email);
        if (existingByEmail) {
            return ApplicationResult.failure(conflictError('email'));
        }

        if (phone) {
            const existingByPhone = await repository.findByPhone(phone);
            if (existingByPhone) {
                return ApplicationResult.failure(conflictError('phone'));
            }
        }

        if (typeof hashPassword !== 'function') {
            return ApplicationResult.failure(
                serviceUnavailableError('Account registration is temporarily unavailable.')
            );
        }

        const passwordHash = await hashPassword(password);

        let created;
        try {
            created = await repository.create({
                email,
                password_hash: passwordHash,
                first_name: firstName,
                last_name: lastName,
                phone,
                status: 'active',
                email_verified_at: null // per D-01: accounts start unverified; login still works
            });
        } catch (error) {
            const conflict = mapUniqueConstraintError(error);
            if (conflict) return ApplicationResult.failure(conflict);
            throw error;
        }

        return ApplicationResult.success({
            account: sanitizeAccount(created),
            token: generateAccountSessionToken(created),
            expiresIn: SESSION_TOKEN_EXPIRY_SECONDS
        });
    };
}

/**
 * Login use case (API-01). Validates credentials and returns a session
 * token plus the account's business list (D-05). When a businessRepository
 * is injected (Wave 3, 04-03-PLAN.md Task 8), the real membership list is
 * fetched: 0 businesses -> unbound session with an empty list; exactly 1 ->
 * auto-bind (active_business_id set); 2+ -> unbound session with the full
 * list for the client to choose from. When businessRepository is omitted
 * (e.g. an older caller), businesses stays [] — the original Wave 1
 * behavior, preserved for backward compatibility.
 * @param {{repository, bcrypt, businessRepository?}} deps
 */
export function buildLoginAccountUseCase({ repository, bcrypt, businessRepository }) {
    return async (input = {}) => {
        const email = normalizeEmail(input.email);
        const password = String(input.password || '');

        if (!email || !password) {
            return ApplicationResult.failure(validationError('Email and password are required.'));
        }

        const account = await repository.findByEmail(email);
        if (!account) {
            return ApplicationResult.failure(invalidCredentialsError());
        }

        if (account.status !== 'active') {
            return ApplicationResult.failure(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'This account is not active.',
                { statusCode: 403 }
            ));
        }

        if (typeof bcrypt?.compare !== 'function') {
            return ApplicationResult.failure(serviceUnavailableError('Login is temporarily unavailable.'));
        }

        const passwordValid = await bcrypt.compare(password, account.password_hash);
        if (!passwordValid) {
            return ApplicationResult.failure(invalidCredentialsError());
        }

        await repository.update(account.id, { last_login_at: new Date() });
        const refreshed = (await repository.findById(account.id)) || account;

        const businesses = typeof businessRepository?.findAccountBusinesses === 'function'
            ? await businessRepository.findAccountBusinesses(refreshed.id)
            : [];

        const response = {
            account: sanitizeAccount(refreshed),
            token: generateAccountSessionToken(refreshed),
            expiresIn: SESSION_TOKEN_EXPIRY_SECONDS,
            businesses
        };

        // D-05: auto-bind when the account belongs to exactly one business;
        // otherwise leave the session unbound (0 -> nothing to bind, 2+ ->
        // client must choose).
        if (businesses.length === 1) {
            response.active_business_id = businesses[0].id;
        }

        return ApplicationResult.success(response);
    };
}

/**
 * Profile update use case (API-01, D-03). Updates email/password/name/phone;
 * enforces email + phone uniqueness against other accounts. Changing email
 * and/or password (the account's credentials) requires confirming the
 * caller's current password via `updates.current_password` (WR-03) — this
 * limits the blast radius of a stolen/leaked session token, since an
 * attacker who only has the token (not the password) cannot silently take
 * over the account.
 * @param {{repository, accountEntity?, hashPassword, bcrypt}} deps
 */
export function buildUpdateAccountProfileUseCase({ repository, accountEntity = AccountEntity, hashPassword, bcrypt }) {
    return async ({ accountId, updates = {} } = {}) => {
        if (!accountId) {
            return ApplicationResult.failure(validationError('accountId is required.'));
        }

        const existing = await repository.findById(accountId);
        if (!existing) {
            return ApplicationResult.failure(notFoundError());
        }

        const patch = {};
        const has = (key) => Object.prototype.hasOwnProperty.call(updates, key);

        if (has('first_name')) patch.first_name = normalizeName(updates.first_name);
        if (has('last_name')) patch.last_name = normalizeName(updates.last_name);

        if (has('email')) {
            const email = normalizeEmail(updates.email);
            if (!accountEntity.validateEmailFormat(email)) {
                return ApplicationResult.failure(
                    validationError('Enter a valid email address.', { field: 'email' })
                );
            }
            if (email !== normalizeEmail(existing.email)) {
                const conflict = await repository.findByEmail(email);
                if (conflict && conflict.id !== accountId) {
                    return ApplicationResult.failure(conflictError('email'));
                }
            }
            patch.email = email;
        }

        if (has('phone')) {
            const phone = normalizePhone(updates.phone);
            if (phone && phone !== normalizePhone(existing.phone)) {
                const conflict = await repository.findByPhone(phone);
                if (conflict && conflict.id !== accountId) {
                    return ApplicationResult.failure(conflictError('phone'));
                }
            }
            patch.phone = phone;
        }

        if (has('password')) {
            const password = String(updates.password || '');
            if (!accountEntity.validatePasswordStrength(password)) {
                return ApplicationResult.failure(
                    validationError('Password must be at least 8 characters.', { field: 'password' })
                );
            }
            if (typeof hashPassword !== 'function') {
                return ApplicationResult.failure(
                    serviceUnavailableError('Profile update is temporarily unavailable.')
                );
            }
            patch.password_hash = await hashPassword(password);
        }

        if (has('email') || has('password')) {
            const currentPassword = String(updates.current_password || '');
            if (!currentPassword) {
                return ApplicationResult.failure(currentPasswordRequiredError());
            }
            if (typeof bcrypt?.compare !== 'function') {
                return ApplicationResult.failure(
                    serviceUnavailableError('Profile update is temporarily unavailable.')
                );
            }
            const currentPasswordValid = await bcrypt.compare(currentPassword, existing.password_hash);
            if (!currentPasswordValid) {
                return ApplicationResult.failure(currentPasswordInvalidError());
            }
        }

        let updated;
        try {
            updated = await repository.update(accountId, patch);
        } catch (error) {
            const conflict = mapUniqueConstraintError(error);
            if (conflict) return ApplicationResult.failure(conflict);
            throw error;
        }
        return ApplicationResult.success({ account: sanitizeAccount(updated) });
    };
}

/**
 * Plain account lookup by id (no access control — see
 * buildGetAccountForAuthorizationUseCase for the access-controlled variant
 * used by the API-04-gated /accounts/:id endpoint).
 * @param {{repository}} deps
 */
export function buildGetAccountUseCase({ repository }) {
    return async ({ accountId } = {}) => {
        if (!accountId) {
            return ApplicationResult.failure(validationError('accountId is required.'));
        }

        const account = await repository.findById(accountId);
        if (!account) {
            return ApplicationResult.failure(notFoundError());
        }

        return ApplicationResult.success({ account: sanitizeAccount(account) });
    };
}

/**
 * Account lookup with access control (D-04): self-access always allowed;
 * otherwise the requester must have the 'admin' role.
 * @param {{repository}} deps
 */
export function buildGetAccountForAuthorizationUseCase({ repository }) {
    return async ({ accountId, requestingAccountId, role } = {}) => {
        if (!accountId) {
            return ApplicationResult.failure(validationError('accountId is required.'));
        }

        const isSelf = Boolean(requestingAccountId) && String(requestingAccountId) === String(accountId);
        const isAdmin = role === 'admin';

        if (!isSelf && !isAdmin) {
            return ApplicationResult.failure(new DomainError(
                DomainErrorCode.AUTHORIZATION_FAILED,
                'You are not authorized to view this account.',
                { statusCode: 403 }
            ));
        }

        const account = await repository.findById(accountId);
        if (!account) {
            return ApplicationResult.failure(notFoundError());
        }

        return ApplicationResult.success({ account: sanitizeAccount(account) });
    };
}
