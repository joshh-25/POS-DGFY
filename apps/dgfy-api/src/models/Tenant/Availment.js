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
            // Phase 11 (11-01): fulfillment event ledger + courier-assignment
            // history. Availment.fulfillment_mode/fulfillment_status/
            // fulfillment_stage below are a denormalized read cache of the
            // LATEST stageEvents row — these two tables are the source of
            // truth (D-05/D-06/D-15).
            if (models.AvailmentStageEvent && !Availment.associations?.stageEvents) {
                Availment.hasMany(models.AvailmentStageEvent, {
                    foreignKey: 'availment_id',
                    as: 'stageEvents'
                });
            }
            if (models.CourierAssignment && !Availment.associations?.courierAssignments) {
                Availment.hasMany(models.CourierAssignment, {
                    foreignKey: 'availment_id',
                    as: 'courierAssignments'
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
        },
        // Phase 11 (11-01, FUL-01..FUL-03): denormalized read-cache columns
        // mirroring the LATEST availment_stage_events row — source of truth
        // is the event ledger, not this cache (D-05/D-06/D-15). Additive/
        // nullable, no backfill of pre-migration availments (A4). Distinct
        // from `status` above (Landmine 1) — `status` is the draft/
        // finalized/voided checkout lifecycle, `fulfillment_status` is the
        // separate coarse fulfillment pipeline.
        fulfillment_mode: {
            type: DataTypes.ENUM('pickup', 'delivery', 'dine_in'),
            allowNull: true
        },
        fulfillment_status: {
            type: DataTypes.ENUM('placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'),
            allowNull: true
        },
        fulfillment_stage: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Phase 14 (14-01, LDM-05): sales-history migration provenance.
        // NULL for every existing/live row; the migration mapper explicitly
        // writes 'legacy_migration'. Persistence-only — no live checkout
        // input schema, controller, repository payload, or serializer
        // accepts or assembles this field (ADR 0029, D-14-09).
        source_system: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // Phase 14 (14-01, D-14-01/D-14-05/D-14-08): allowlisted unmapped
        // header evidence (unresolvable FK-shaped fields, legacy void
        // metadata, generic payment-processing detail with no live target
        // column). Persistence-only, populated only by the migration mapper.
        legacy_snapshot: {
            type: DataTypes.JSON,
            allowNull: true
        },
        // Phase 14 (14-01, D-14-09): flat { service_fee_amount, delivery_fee }
        // shape, populated only by the migration mapper. Explicitly NOT
        // wired to any live checkout write path in this plan — the new
        // system today has no live fee computation (see
        // availmentUseCases.js's hardcoded service_fee_amount placeholder).
        additional_fees: {
            type: DataTypes.JSON,
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
