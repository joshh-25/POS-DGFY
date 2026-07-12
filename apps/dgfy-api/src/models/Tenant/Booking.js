import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.bookings, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual `bookings` table
// definition exactly (Phase 8, BOK-01/BOK-02/BOK-03). `customer_account_id`
// is an opaque UUID pointing at dgfy_core.accounts.id (D-09: consumer-owns-
// booking cancel authorization is enforced at the usecase layer, not via a
// same-DB FK). `availment_id` is reserved, no FK — the Availment table is
// Phase 9 (BOK-03). Per Phase 4/8 Clean Architecture: this model carries NO
// business logic.
export default (sequelize) => {
    class Booking extends Model {
        static associate(models = {}) {
            if (models.Product && !Booking.associations?.product) {
                Booking.belongsTo(models.Product, {
                    foreignKey: 'product_id',
                    as: 'product'
                });
            }
            if (models.Location && !Booking.associations?.branch) {
                Booking.belongsTo(models.Location, {
                    foreignKey: 'branch_id',
                    as: 'branch'
                });
            }
        }
    }

    Booking.init({
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
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database). D-09: consumer-owns-booking cancel check.
        customer_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        slot_start: {
            type: DataTypes.DATE,
            allowNull: false
        },
        slot_end: {
            type: DataTypes.DATE,
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('booked', 'cancelled', 'fulfilled'),
            allowNull: false,
            defaultValue: 'booked'
        },
        // Reserved, no FK — the Availment table is Phase 9 (BOK-03).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        cancelled_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Booking',
        tableName: 'bookings',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['business_id', 'product_id', 'branch_id', 'slot_start'], name: 'idx_bookings_business_product_branch_slot' },
            { fields: ['customer_account_id'], name: 'idx_bookings_customer_account' }
        ]
    });

    return Booking;
};
