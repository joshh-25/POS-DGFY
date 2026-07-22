import { DataTypes, Model } from 'sequelize';

// Persistence-only Sequelize model for dgfy_business_*.compliance_evidence,
// matching apps/dgfy-migration-runner/src/migrations/schema/
// 20260713120000-create-availment-checkout.cjs's actual
// `compliance_evidence` table definition (Phase 09, D-23). The interim
// attestation store for operator-attested compliance evidence bundle
// (7-signal set: profile, settings, artifacts, peripherals, evidence) —
// finalize reads this table and forwards the bundle to assertComplianceGate
// for compliant_active checkouts (D-21/D-23).
// CR-01 (D-23): the one-row-per-(business_id, branch_id) invariant is backed
// by a unique index on (business_id, branch_scope_key), where branch_scope_key
// is a DB-generated column (GENERATED ALWAYS AS COALESCE(branch_id, 0)
// STORED) — the original plain (business_id, branch_id) unique index could
// NOT enforce this invariant when branch_id IS NULL, because MySQL treats
// every NULL as distinct for uniqueness purposes. branch_scope_key collapses
// every NULL branch_id to the same deterministic sentinel (0) per
// business_id, so MySQL can now reject a second NULL-branch row for the same
// business. branch_scope_key is intentionally NOT declared as a model
// attribute here — it is DB-generated and must never be written by the
// repository layer.
export default (sequelize) => {
    class ComplianceEvidence extends Model {
        static associate(models = {}) {
            if (models.Location && !ComplianceEvidence.associations?.branch) {
                ComplianceEvidence.belongsTo(models.Location, {
                    foreignKey: 'branch_id',
                    as: 'branch'
                });
            }
        }
    }

    ComplianceEvidence.init({
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
        // D-23: branch-scoped attestation (one row per business_id,
        // branch_id pair). RESTRICT (not CASCADE): base column of the
        // branch_scope_key STORED generated column added by the migration —
        // MySQL 8.0 forbids CASCADE/SET NULL/SET DEFAULT on a foreign key
        // whose column feeds a STORED generated column.
        branch_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'locations', key: 'id' },
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT'
        },
        // D-23: operator-attested evidence bundle (7-signal set:
        // { profile, settings, artifacts, peripherals, evidence }).
        evidence_bundle: {
            type: DataTypes.JSON,
            allowNull: false
        },
        // D-23: who attested (e.g., 'operator', 'system', 'importer').
        attested_by_actor_type: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        // D-23: when attested.
        attested_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'ComplianceEvidence',
        tableName: 'compliance_evidence',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        indexes: [
            { unique: true, fields: ['business_id', 'branch_scope_key'], name: 'unique_compliance_evidence_business_branch_scope' }
        ]
    });

    return ComplianceEvidence;
};
