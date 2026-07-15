// AccountEntity — Clean Architecture Entity layer (Enterprise Business
// Rules). Holds account business rules and validation, completely separate
// from persistence (Account Sequelize model) and HTTP concerns. The
// AccountRepository translates Account model rows <-> AccountEntity
// instances; use cases operate exclusively on entities and call the static
// validators below to enforce business rules.

const EMAIL_FORMAT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export class AccountEntity {
    constructor({
        id = null,
        email = null,
        first_name = null,
        last_name = null,
        phone = null,
        password_hash = null,
        status = 'active',
        email_verified_at = null,
        phone_verified_at = null,
        last_login_at = null,
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.email = email;
        this.first_name = first_name;
        this.last_name = last_name;
        this.phone = phone;
        this.password_hash = password_hash;
        this.status = status;
        this.email_verified_at = email_verified_at;
        this.phone_verified_at = phone_verified_at;
        this.last_login_at = last_login_at;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /**
     * Domain-level email format validator (used by use cases before any
     * repository call). Pure — no I/O, no persistence.
     * @param {string} email
     * @returns {boolean}
     */
    static validateEmailFormat(email) {
        return typeof email === 'string' && EMAIL_FORMAT_PATTERN.test(email.trim());
    }

    /**
     * Domain-level password strength validator (per D-03: minimum length
     * enforced here; use cases call this before hashing).
     * @param {string} password
     * @returns {boolean}
     */
    static validatePasswordStrength(password) {
        return typeof password === 'string' && password.length >= MIN_PASSWORD_LENGTH;
    }

    /** @returns {boolean} */
    isVerified() {
        return this.email_verified_at !== null && this.email_verified_at !== undefined;
    }

    /** @returns {boolean} */
    isActive() {
        return this.status === 'active';
    }
}

/**
 * Factory function (per Dependency Inversion) so repositories/use cases can
 * construct entities without a hard `new AccountEntity()` coupling.
 * @param {Object} attrs
 * @returns {AccountEntity}
 */
export const buildAccountEntity = (attrs) => new AccountEntity(attrs);

export default AccountEntity;
