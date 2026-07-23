import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.booking_capacity,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual `booking_capacity`
// table definition exactly (Phase 8, BOK-02). This is the atomic guarded
// UPDATE counter table (research Pattern D) — `slots_remaining` must only
// ever be mutated via a single guarded UPDATE statement in
// modules/booking/repositories/bookingRepository.js, never a
// findOne-then-update round trip. Per Phase 4/8 Clean Architecture: this
// model carries NO business logic.
export default (sequelize) => {
    class BookingCapacity extends Model {
        static associate(models = {}) {
            if (models.Product && !BookingCapacity.associations?.product) {
                BookingCapacity.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
            if (models.Location && !BookingCapacity.associations?.branch) {
                BookingCapacity.belongsTo(models.Location, {
                    foreignKey: 'branch_id',
                    as: 'branch'
                });
            }
        }
    }

    BookingCapacity.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database).
        business_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'products', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'locations', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        slot_start: {
            type: DataTypes.DATE,
            allowNull: false
        },
        // Atomic guarded UPDATE target (research Pattern D) — never
        // read-then-write.
        slots_remaining: {
            type: DataTypes.INTEGER,
            allowNull: false
        }
    }, {
        sequelize,
        modelName: 'BookingCapacity',
        tableName: 'booking_capacity',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['product_id', 'branch_id', 'slot_start'], name: 'unique_booking_capacity_product_branch_slot' }
        ]
    });

    return BookingCapacity;
};
