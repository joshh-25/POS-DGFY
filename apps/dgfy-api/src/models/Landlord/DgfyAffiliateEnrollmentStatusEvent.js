import { DataTypes, Model } from 'sequelize';

// #1202 (Phase 214): append-only status-transition history for
// dgfy_affiliate_enrollments.status - see
// apps/dgfy-migration-runner/migrations/20260901000004-add-affiliate-enrollment-status-events.cjs
// for the full design rationale (by-value enrollment_id/tenant_id, no unique index, backfill rule).
//
// The three Phase 199 columns on DgfyAffiliateEnrollment (revoked_at, revoked_by,
// revocation_reason) are UNCHANGED and remain a denormalized cache of the most recent DEMOTION
// event recorded here - not the authority. They can disagree about WHICH KIND of demotion happened
// (revoked_at conflates suspended/revoked); on any such disagreement, THIS TABLE WINS.
//
// Deliberately NO Tenant.hasMany association in models/index.js - tenant_id is held by value (see
// the migration header), and adding one would emit a foreign key Sequelize cannot satisfy against
// an isolated tenant schema (the exact class of latent risk flagged in
// apps/dgfy-api/src/utils/tenantModelFactory.js's own comment, and in F10 of PHASE_214_PLAN.md).
export default (sequelize) => {
    class DgfyAffiliateEnrollmentStatusEvent extends Model { }

    DgfyAffiliateEnrollmentStatusEvent.init({
        status_event_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true
        },
        enrollment_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        from_status: {
            type: DataTypes.ENUM('pending', 'active', 'suspended', 'revoked'),
            allowNull: true
        },
        to_status: {
            type: DataTypes.ENUM('pending', 'active', 'suspended', 'revoked'),
            allowNull: false
        },
        event_type: {
            type: DataTypes.ENUM('enrolled', 'suspended', 'revoked', 'reactivated'),
            allowNull: false
        },
        actor_type: {
            type: DataTypes.ENUM('tenant_user', 'dgfy_account', 'system'),
            allowNull: false
        },
        actor_user_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        actor_username: {
            type: DataTypes.STRING(120),
            allowNull: true
        },
        actor_dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        reason: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        source: {
            type: DataTypes.ENUM('admin_api', 'invite_accept', 'auto_enroll', 'backfill'),
            allowNull: false
        },
        metadata: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAffiliateEnrollmentStatusEvent',
        tableName: 'dgfy_affiliate_enrollment_status_events',
        underscored: true,
        timestamps: true,
        updatedAt: false,
        indexes: [
            { fields: ['enrollment_id', 'created_at'], name: 'idx_affiliate_status_events_enrollment_time' },
            { fields: ['tenant_id', 'created_at'], name: 'idx_affiliate_status_events_tenant_time' },
            { fields: ['event_type'], name: 'idx_affiliate_status_events_event_type' }
        ]
    });

    return DgfyAffiliateEnrollmentStatusEvent;
};
