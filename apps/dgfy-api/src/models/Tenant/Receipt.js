import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.receipts, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual `receipts` table
// definition (Phase 09, D-11/D-12/D-14). Append-only immutable receipt
// records: once persisted, a receipt cannot be edited or deleted — audit
// records are immutable (application-layer half of the DB-level BEFORE
// UPDATE/DELETE SIGNAL '45000' triggers from the migration).
export default (sequelize) => {
    class Receipt extends Model {
        static associate(models = {}) {
            if (models.Availment && !Receipt.associations?.availment) {
                Receipt.belongsTo(models.Availment, {
                    foreignKey: 'availment_id',
                    as: 'availment'
                });
            }
        }
    }

    Receipt.init({
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
        // Parent Availment reference (same-DB FK, RESTRICT at deletion to
        // ensure receipt binds to finalized availment only).
        availment_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'availments', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE'
        },
        // D-14: receipt ID / transaction number (unique per business).
        receipt_number: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        // D-14: Fiscal/Non-Fiscal document type (set by
        // assertComplianceGate).
        document_type: {
            type: DataTypes.ENUM('fiscal_invoice', 'non_fiscal_slip'),
            allowNull: false
        },
        // D-23 interim attestation: compliance mode context (stored for
        // audit).
        compliance_mode: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // D-12/D-14: stores all line items, discounts, tax breakdown, payment,
        // change, staff id, receipt id (payload for reprint/audit).
        payload: {
            type: DataTypes.JSON,
            allowNull: false
        },
        // D-11: receipt printing status (for reprint/retry logic).
        printed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // D-22: print error message (if device-bridge failed after DB
        // commit).
        print_error: {
            type: DataTypes.STRING(255),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Receipt',
        tableName: 'receipts',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        // Append-only immutable receipt record — no updated_at (D-12).
        updatedAt: false,
        indexes: [
            { unique: true, fields: ['business_id', 'receipt_number'], name: 'unique_receipts_business_number' }
        ],
        hooks: {
            beforeUpdate() {
                throw new Error('receipts is insert-only');
            },
            beforeBulkUpdate() {
                throw new Error('receipts is insert-only');
            }
        }
    });

    return Receipt;
};
