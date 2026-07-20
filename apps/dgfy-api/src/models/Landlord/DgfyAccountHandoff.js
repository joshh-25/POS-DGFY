import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class DgfyAccountHandoff extends Model { }

    DgfyAccountHandoff.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        jti: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        dgfy_account_id: {
            type: DataTypes.UUID,
            allowNull: false
        },
        expires_at: {
            type: DataTypes.DATE,
            allowNull: false
        },
        consumed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'DgfyAccountHandoff',
        tableName: 'dgfy_account_handoffs',
        underscored: true,
        timestamps: true,
        indexes: [
            { unique: true, fields: ['jti'], name: 'unique_dgfy_account_handoffs_jti' },
            { fields: ['dgfy_account_id'], name: 'idx_dgfy_handoffs_account' },
            { fields: ['expires_at'], name: 'idx_dgfy_handoffs_expires_at' }
        ]
    });

    return DgfyAccountHandoff;
};
