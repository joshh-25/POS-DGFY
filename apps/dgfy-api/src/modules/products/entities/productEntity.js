// ProductEntity — Clean Architecture Entity layer (Enterprise Business
// Rules), mirroring ../../businesses/entities/businessEntity.js's role.
// Holds product shape and minimal domain helpers, completely separate from
// persistence (the Product Sequelize model, apps/dgfy-api/src/models/Tenant/
// Product.js) and HTTP concerns. ProductRepository translates Sequelize
// model rows <-> plain objects that match this entity's toPlain() shape;
// this entity is available for any usecase/controller that wants a richer
// domain object (e.g. isBookableEligible()) than the repository's plain
// return value.

export class ProductEntity {
    constructor({
        id = null,
        folder_id = null,
        name = null,
        category = null,
        inventory_mode = 'non_stock',
        is_bookable = false,
        slot_duration_minutes = null,
        concurrent_capacity = null,
        base_price = null,
        is_active = true,
        created_at = null,
        updated_at = null
    } = {}) {
        this.id = id;
        this.folder_id = folder_id;
        this.name = name;
        this.category = category;
        this.inventory_mode = inventory_mode;
        this.is_bookable = is_bookable;
        this.slot_duration_minutes = slot_duration_minutes;
        this.concurrent_capacity = concurrent_capacity;
        this.base_price = base_price;
        this.is_active = is_active;
        this.created_at = created_at;
        this.updated_at = updated_at;
    }

    /** @returns {boolean} */
    isActive() {
        return this.is_active === true;
    }

    /**
     * Only Service-category products may be marked bookable (BOK-01) — the
     * setProductBookable use case's core eligibility rule.
     * @returns {boolean}
     */
    isBookableEligible() {
        return this.category === 'service';
    }

    /**
     * Public response shape — the exact field set the Products API returns.
     * @returns {Object}
     */
    toPlain() {
        return {
            id: this.id,
            folder_id: this.folder_id,
            name: this.name,
            category: this.category,
            inventory_mode: this.inventory_mode,
            is_bookable: this.is_bookable,
            slot_duration_minutes: this.slot_duration_minutes,
            concurrent_capacity: this.concurrent_capacity,
            base_price: this.base_price,
            is_active: this.is_active,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

/**
 * @param {Object} attrs
 * @returns {ProductEntity}
 */
export const createProductEntity = (attrs) => new ProductEntity(attrs);

export default ProductEntity;
