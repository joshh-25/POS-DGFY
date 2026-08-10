import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyCustomerBackfillRun extends Model { }

    DgfyCustomerBackfillRun.init({
        run_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        status: {
            type: DataTypes.ENUM('running', 'completed', 'failed'),
            allowNull: false,
            defaultValue: 'running'
        },
        dry_run: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
        },
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        tenant_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        transaction_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        order_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        service_booking_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        hospitality_booking_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        fnb_order_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        matched_account_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        activity_upsert_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        loyalty_upsert_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        failure_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        summary: {
            type: DataTypes.JSON,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyCustomerBackfillRun',
        tableName: 'dgfy_customer_backfill_runs',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['status', 'started_at'], name: 'idx_dgfy_customer_backfill_runs_status_time' }
        ]
    });

    return DgfyCustomerBackfillRun;
};
