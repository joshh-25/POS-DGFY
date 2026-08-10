
import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
    class Payment extends Model { }

    Payment.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true
        },
        tenant_id: {
            type: DataTypes.UUID,
            allowNull: false,
            references: {
                model: 'tenants',
                key: 'id'
            }
        },
        transaction_id: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false
        },
        currency: {
            type: DataTypes.STRING(3),
            defaultValue: 'USD'
        },
        status: {
            type: DataTypes.ENUM('completed', 'pending', 'failed', 'refunded'),
            defaultValue: 'pending'
        },
        payment_method: {
            type: DataTypes.STRING, // e.g., 'paypal', 'credit_card'
            defaultValue: 'paypal'
        },
        payment_date: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
        },
        metadata: {
            type: DataTypes.JSON,
            defaultValue: {}
        }
    }, {
        sequelize,
        modelName: 'Payment',
        tableName: 'payments',
        underscored: true,
        timestamps: true
    });

    return Payment;
};
