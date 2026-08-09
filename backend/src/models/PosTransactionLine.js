import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

const PosTransactionLine = sequelize.define('PosTransactionLine', {
    line_id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    item_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    // Snapshotted at sale time so a later item rename/delete can never
    // retro-change a historical receipt or report. Nullable: older rows
    // (written before this column existed) fall back to the live item join.
    item_name_snapshot: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    sku_snapshot: {
        type: DataTypes.STRING(100),
        allowNull: true
    },
    quantity: {
        type: DataTypes.DECIMAL(24, 12),
        allowNull: false
    },
    unit_of_measure: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    cost_snapshot: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: true
    },
    stock_effect_type: {
        type: DataTypes.ENUM('inventory_issue', 'stock_exempt'),
        allowNull: false,
        defaultValue: 'inventory_issue'
    },
    stock_exempt_reason: {
        type: DataTypes.STRING(80),
        allowNull: true
    },
    sale_price: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false
    },
    sale_price_overridden: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    price_override_reason: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    line_subtotal: {
        type: DataTypes.DECIMAL(14, 4),
        allowNull: false
    },
    vat_type_snapshot: {
        type: DataTypes.ENUM('vatable', 'vat_exempt', 'zero_rated'),
        allowNull: false,
        defaultValue: 'vatable'
    },
    vat_rate_snapshot: {
        type: DataTypes.DECIMAL(5, 4),
        allowNull: false,
        defaultValue: 0.1200
    },
    fnb_course_snapshot: {
        type: DataTypes.ENUM('appetizer', 'main', 'dessert', 'drink', 'other'),
        allowNull: true
    },
    fnb_modifiers_snapshot: {
        type: DataTypes.JSON,
        allowNull: true
    },
    fnb_special_instructions: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    fnb_kitchen_station_snapshot: {
        type: DataTypes.JSON,
        allowNull: true
    }
}, {
    tableName: 'pos_transaction_lines',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['pos_transaction_id'] },
        { fields: ['item_id'] }
    ]
});

export default PosTransactionLine;
