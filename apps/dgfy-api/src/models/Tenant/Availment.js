import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.availments, matching
// apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual `availments` table
// definition (Phase 09, CHK-01..CHK-06, D-01/D-15). The draft-to-finalized
// workflow state lives here; line items, discounts, and payments are separate
// entities that reference this availment.
export default (sequelize) => {
    class Availment extends Model {
        static associate(models = {}) {
            if (models.Location && !Availment.associations?.branch) {
                Availment.belongsTo(models.Location, {
                    foreignKey: 'branch_id',
                    as: 'branch'
                });
            }
            if (models.Shift && !Availment.associations?.shift) {
                Availment.belongsTo(models.Shift, {
                    foreignKey: 'shift_id',
                    as: 'shift'
                });
            }
            if (models.TerminalIdentity && !Availment.associations?.terminal) {
                Availment.belongsTo(models.TerminalIdentity, {
                    foreignKey: 'terminal_id',
                    as: 'terminal'
                });
            }
            if (models.StaffAccount && !Availment.associations?.cashier) {
                Availment.belongsTo(models.StaffAccount, {
                    foreignKey: 'cashier_account_id',
                    as: 'cashier'
                });
            }
            if (models.AvailmentItem && !Availment.associations?.items) {
                Availment.hasMany(models.AvailmentItem, {
                    foreignKey: 'availment_id',
                    as: 'items'
                });
            }
            if (models.AvailmentDiscount && !Availment.associations?.discounts) {
                Availment.hasMany(models.AvailmentDiscount, {
                    foreignKey: 'availment_id',
                    as: 'discounts'
                });
            }
            if (models.Payment && !Availment.associations?.payments) {
                Availment.hasMany(models.Payment, {
                    foreignKey: 'availment_id',
                    as: 'payments'
                });
            }
            if (models.Receipt && !Availment.associations?.receipt) {
                Availment.hasOne(models.Receipt, {
                    foreignKey: 'availment_id',
                    as: 'receipt'
                });
            }
        }

        isFinalized() {
            return this.status === 'finalized';
        }

        isDraft() {
            return this.status === 'draft';
        }

        isVoided() {
            return this.status === 'voided';
        }
    }

    Availment.init({
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
        // D-16: branch binding for context/audit (shift precondition uses
        // terminal, not branch).
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'locations', key: 'id' },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — never a real FK
        // (cross-database).
        customer_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        // D-16: Availment finalize requires an open shift (CHK-06); shift_id
        // is optional during draft, bound at finalize.
        shift_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'shifts', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // D-16: terminal binding for shift lookup (CHK-06).
        terminal_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'terminal_identities', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // Cashier who opened/finalized this availment (tenant-local
        // staff_accounts.id, not landlord dgfy_account_id — D-13 pattern).
        cashier_account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'staff_accounts', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // Opaque UUID pointing at dgfy_core.accounts.id — kept alongside
        // cashier_account_id for audit only (D-13 pattern).
        cashier_dgfy_account_id: {
            type: DataTypes.CHAR(36),
            allowNull: true
        },
        // D-01: draft → finalized → voided lifecycle (voided is for refunds,
        // Phase 11+).
        status: {
            type: DataTypes.ENUM('draft', 'finalized', 'voided'),
            allowNull: false,
            defaultValue: 'draft'
        },
        // D-15: fiscal | non_fiscal context passed at finalize time
        // (controller input, gate port requirement).
        document_context: {
            type: DataTypes.ENUM('fiscal', 'non_fiscal'),
            allowNull: true
        },
        // D-09: computed server-side (never accepted from client CHK-02).
        subtotal_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // Sum of all applied discounts (promo + manual + SC/PWD, D-05
        // independent calculation).
        discount_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // VAT amount (VAT-inclusive per D-19).
        vat_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // VAT-exempt amount (SC/PWD sales, D-20).
        vat_exempt_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // Final sale total (subtotal + vat - discounts).
        total_amount: {
            type: DataTypes.DECIMAL(14, 4),
            allowNull: true
        },
        // D-06: SC/PWD ID number (optimistic scan or manual fallback).
        sc_pwd_id_number: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // D-06: optional metadata from SC/PWD scan (e.g., customer name,
        // OCR confidence).
        sc_pwd_metadata: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // Finalization timestamp (nullable until finalized).
        finalized_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // Phase 10 (10-07, RESEARCH Pitfall 2, T-10-07-01): cross-DB
        // idempotency guard for the storefront-order -> tenant-Availment
        // finalize seam. Set ONLY by finalizeStorefrontOrder (the landlord
        // order's public_reference); NULL for every POS/Phase-9 availment.
        // UNIQUE per business (unique_availments_source_reference) — MySQL
        // permits multiple NULLs under a unique index, so this is additive
        // and non-breaking for the existing POS finalize path.
        source_reference: {
            type: DataTypes.STRING(64),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'Availment',
        tableName: 'availments',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { fields: ['business_id', 'status'], name: 'idx_availments_business_status' },
            { fields: ['source_reference'], name: 'unique_availments_source_reference', unique: true }
        ]
    });

    return Availment;
};
