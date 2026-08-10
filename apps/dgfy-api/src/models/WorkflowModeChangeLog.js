import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Mode-switch hardening (issue #178 phase 5): ops_workflow_mode is allowed to
// change (ADR 0008 - non-destructive switch) but today carries no audit
// trail at all. This is a tenant-scoped, append-only log of every actual
// change to ops_workflow_mode / ops_enabled_capabilities - written by
// applyWorkflowModeAuditLog whenever a settings write changes any of them.
// Phase 16 adds the disabled_capabilities pair alongside the pre-existing
// enabled_capabilities pair.
const WorkflowModeChangeLog = sequelize.define('WorkflowModeChangeLog', {
    workflow_mode_change_log_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    actor_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    actor_username_snapshot: {
        type: DataTypes.STRING(150),
        allowNull: true
    },
    from_workflow_mode: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    to_workflow_mode: {
        type: DataTypes.STRING(64),
        allowNull: true
    },
    from_enabled_capabilities: {
        type: DataTypes.JSON,
        allowNull: true
    },
    to_enabled_capabilities: {
        type: DataTypes.JSON,
        allowNull: true
    },
    from_disabled_capabilities: {
        type: DataTypes.JSON,
        allowNull: true
    },
    to_disabled_capabilities: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    tableName: 'workflow_mode_change_log',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
        { fields: ['created_at'] }
    ]
});

export default WorkflowModeChangeLog;
