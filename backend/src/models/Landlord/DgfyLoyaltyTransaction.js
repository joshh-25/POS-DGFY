import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyLoyaltyTransaction extends Model { }

    DgfyLoyaltyTransaction.init({
        loyalty_transaction_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: true
        },
        activity_id: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        points_delta: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        reason: {
            type: DataTypes.STRING(120),
            allowNull: false,
            defaultValue: 'activity'
        },
        reference: {
            type: DataTypes.STRING(80),
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyLoyaltyTransaction',
        tableName: 'dgfy_loyalty_transactions',
        underscored: true,
        timestamps: true,
        indexes: [
            { fields: ['dgfy_account_id', 'created_at'], name: 'idx_dgfy_loyalty_account_time' }
        ]
    });

    return DgfyLoyaltyTransaction;
};
