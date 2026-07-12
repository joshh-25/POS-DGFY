import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.compliance_mode_state,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260712100000-create-commerce-foundation.cjs's actual
// `compliance_mode_state` table definition exactly (Phase 8, FSC-01/FSC-02).
// D-01: tenant-scoped (lives in dgfy_business_*, not dgfy_core) — gates
// tenant-local operations directly in the same database as what it gates.
// Enum values ported verbatim from the read-only legacy compliance
// constants module (COMPLIANCE_MODE_STATE, COMPLIANCE_VERIFICATION_STATUS,
// COMPLIANCE_VERIFIER_ACTOR_TYPE). `compliance_profile` is a JSON blob
// (D-03: versioned BIR/NPC/BSP policy-pack profile fields/artifacts) — its
// shape/defaults (COMPLIANCE_PROFILE_DEFAULT) and validation logic live in
// modules/compliance, NOT here; this model carries NO policy-engine logic,
// only the `allowsFiscalChoice()` domain helper for D-05's Fiscal/Omni
// eligibility check (compliant_active means "Fiscal is now available to
// choose", not "Fiscal is now mandatory" — see 08-CONTEXT.md D-05).
export default (sequelize) => {
    class ComplianceModeState extends Model {
        static associate(models = {}) {
            if (models.Location && !ComplianceModeState.associations?.branch) {
                ComplianceModeState.belongsTo(models.Location, {
                    foreignKey: 'branch_id',
                    as: 'branch'
                });
            }
        }

        // D-05: compliant_active means Fiscal is now *available to choose*
        // alongside Omni — the policy engine (modules/compliance) is the
        // authority on gating; this is just the state-row-level predicate.
        allowsFiscalChoice() {
            return this.state === 'compliant_active';
        }
    }

    ComplianceModeState.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        // Opaque UUID pointing at dgfy_core.businesses.id — never a real FK
        // (cross-database). D-01: tenant-scoped, not dgfy_core.
        business_id: {
            type: DataTypes.CHAR(36),
            allowNull: false
        },
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'locations', key: 'id' },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE'
        },
        // D-02: full port of legacy's 3-state COMPLIANCE_MODE_STATE model.
        state: {
            type: DataTypes.ENUM('non_compliant_active', 'compliant_pending', 'compliant_active'),
            allowNull: false,
            defaultValue: 'non_compliant_active'
        },
        // D-03: versioned BIR/NPC/BSP policy-pack profile fields/artifacts.
        compliance_profile: {
            type: DataTypes.JSON,
            allowNull: true
        },
        active_policy_pack_version: {
            type: DataTypes.STRING(32),
            allowNull: true
        },
        // D-04: manual review — mirrors legacy's
        // COMPLIANCE_VERIFICATION_STATUS enum.
        verification_status: {
            type: DataTypes.ENUM('pending_review', 'verified', 'rejected', 'revoked'),
            allowNull: true
        },
        // D-04: mirrors legacy's COMPLIANCE_VERIFIER_ACTOR_TYPE enum.
        verified_by_actor_type: {
            type: DataTypes.ENUM('tenant_master_admin', 'platform_admin'),
            allowNull: true
        },
        verified_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'ComplianceModeState',
        tableName: 'compliance_mode_state',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['business_id', 'branch_id'], name: 'unique_compliance_mode_state_business_branch' }
        ]
    });

    return ComplianceModeState;
};
