// BusinessEntity / BusinessMembershipEntity — Clean Architecture Entity
// layer (Enterprise Business Rules), mirroring
// ../../accounts/entities/accountEntity.js's role. Holds business/membership
// shape and minimal domain helpers, completely separate from persistence
// (Business/BusinessMembership Sequelize models) and HTTP concerns.
// BusinessRepository translates Sequelize model rows <-> these entity
// instances via toPlainBusiness()/toPlainMembership(); entity.toPlain()
// returns exactly the same public field set the Businesses API has always
// returned, so introducing this layer (API-05) never changes an existing
// response shape.

export class BusinessEntity {
    constructor({
        id = null,
        business_handle = null,
        legal_name = null,
        display_name = null,
        status = 'active',
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.business_handle = business_handle;
        this.legal_name = legal_name;
        this.display_name = display_name;
        this.status = status;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /** @returns {boolean} */
    isActive() {
        return this.status === 'active';
    }

    /**
     * Public response shape — the exact field set the Businesses API has
     * always returned for a business (preserves existing response shape,
     * API-05).
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            business_handle: this.business_handle,
            legal_name: this.legal_name,
            display_name: this.display_name,
            status: this.status,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

export class BusinessMembershipEntity {
    constructor({
        id = null,
        account_id = null,
        business_id = null,
        role = 'member',
        status = 'active',
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.account_id = account_id;
        this.business_id = business_id;
        this.role = role;
        this.status = status;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /** @returns {boolean} */
    isOwner() {
        return this.role === 'owner';
    }

    /** @returns {boolean} */
    isActive() {
        return this.status === 'active';
    }

    /**
     * Public response shape — the exact field set the Businesses API has
     * always returned for a membership (preserves existing response shape,
     * API-05).
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            account_id: this.account_id,
            business_id: this.business_id,
            role: this.role,
            status: this.status,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * Factory function (per Dependency Inversion) so repositories/use cases can
 * construct entities without a hard `new BusinessEntity()` coupling.
 * @param {Object} attrs
 * @returns {BusinessEntity}
 */
export const createBusinessEntity = (attrs) => new BusinessEntity(attrs);

/**
 * @param {Object} attrs
 * @returns {BusinessMembershipEntity}
 */
export const createBusinessMembershipEntity = (attrs) => new BusinessMembershipEntity(attrs);

export default BusinessEntity;
