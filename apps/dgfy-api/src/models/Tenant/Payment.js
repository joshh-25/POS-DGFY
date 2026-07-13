import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.payments, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual `payments` table
// definition (Phase 09, D-08/D-09/D-10). Append-only: once persisted, a
// payment cannot be edited or deleted — financial records are immutable
// (application-layer half of the DB-level BEFORE UPDATE/DELETE SIGNAL '45000'
// triggers from the migration).
export default (sequelize) => {
    class Payment extends Model {
        static associate(models = {}) {
            if (models.Availment && !Payment.associations?.availment) {
                Payment.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
        }
    }

    Payment.init({
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
        // Parent Availment reference (same-DB FK, CASCADE at deletion).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'availments', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // D-08: single method per Availment (split-tender deferred to Phase
        // 11+).
        payment_method: {
            type: DataTypes.ENUM('cash', 'gcash', 'credit_card'),
            allowNull: false
        },
        // D-10: amount received (for GCash/Credit Card, this equals total;
        // for Cash, change is computed server-side CHK-02).
        amount_received: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: false
        },
        // D-09: change_due for Cash only (null for GCash/Credit Card).
        change_due: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // D-10: records method + amount, never a live gateway charge (Phase
        // 11+ gateway integration separate).
        payment_handoff_mode: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Phase 10 (10-07, T-10-07-04): opaque external gateway reference
        // (e.g. PayMongo's `pay_...` id) stored SEPARATELY from
        // payment_method so mapping the QR Ph rail onto the existing
        // cash/gcash/credit_card ENUM (A4) never requires an ENUM migration.
        // NULL for cash and for every pre-Phase-10 (POS) payment row.
        payment_reference: {
            type: DataTypes.STRING(191),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Payment',
        tableName: 'payments',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only: no updated_at column, matching the migration.
        updatedAt: false,
        indexes: [
            { fields: ['business_id', 'availment_id'], name: 'idx_payments_business_availment' }
        ],
        hooks: {
            beforeUpdate() {
                throw new Error('payments is insert-only');
            },
            beforeBulkUpdate() {
                throw new Error('payments is insert-only');
            }
        }
    });

    return Payment;
};
