import { DataTypes } from 'sequelize';
import sequelize from '../config/database.js';

// Phase 210 (#1179). Append-only audit trail for a staff-initiated delivery address/pin edit on an
// online order, after placement. Deliberately a dedicated table rather than a column pair on
// pos_transactions (like accepted_by/accepted_at) -- the issue's own requirement is "attributed and
// timestamped (who changed it, when, from what)", and "from what" is a before-value a single column
// pair cannot hold across a second edit. Modelled structurally on PosOrderPayment.js (one row per
// event, FK back to the transaction).
const PosOrderAddressChange = sequelize.define('PosOrderAddressChange', {
    address_change_id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    pos_transaction_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    previous_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    previous_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    previous_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    new_address: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    new_latitude: {
        type: DataTypes.DECIMAL(10, 8),
        allowNull: true
    },
    new_longitude: {
        type: DataTypes.DECIMAL(11, 8),
        allowNull: true
    },
    change_reason: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    changed_by: {
        // Staff attribution. FK -> users(user_id) ON DELETE SET NULL -- a deactivated staff account
        // must not block the order row, matching PosOrderPayment's proof_attached_by (Phase 204).
        type: DataTypes.INTEGER,
        allowNull: true
    },
    changed_by_shift_id: {
        // Mirrors buildOnlineOrderShiftAttributionPayload's shift attribution used elsewhere on the
        // order lifecycle.
        type: DataTypes.INTEGER,
        allowNull: true
    },
    changed_at: {
        type: DataTypes.DATE,
        allowNull: false
    }
}, {
    tableName: 'pos_order_address_changes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { fields: ['pos_transaction_id', 'changed_at'] }
    ]
});

export default PosOrderAddressChange;
