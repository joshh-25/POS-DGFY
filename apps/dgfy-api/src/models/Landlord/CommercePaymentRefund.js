import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('CommercePaymentRefund', {
  refund_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  public_reference: {
    type: DataTypes.STRING(40),
    allowNull: false,
    unique: true
  },
  payment_session_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'commerce_payment_sessions',
      key: 'session_id'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'tenants',
      key: 'id'
    },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  },
  provider: {
    type: DataTypes.ENUM('paymongo'),
    allowNull: false,
    defaultValue: 'paymongo'
  },
  provider_refund_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  provider_payment_id: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  amount_centavos: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'PHP'
  },
  reason: {
    type: DataTypes.ENUM('requested_by_customer', 'duplicate', 'fraudulent', 'others'),
    allowNull: false,
    defaultValue: 'requested_by_customer'
  },
  notes: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  refund_strategy: {
    type: DataTypes.ENUM('proportional', 'tenant', 'dgfy', 'custom'),
    allowNull: false,
    defaultValue: 'proportional'
  },
  split_refund_payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('created', 'pending', 'succeeded', 'failed', 'manual_review_required'),
    allowNull: false,
    defaultValue: 'created'
  },
  provider_payload: {
    type: DataTypes.JSON,
    allowNull: true
  },
  failure_code: {
    type: DataTypes.STRING(80),
    allowNull: true
  },
  failure_reason: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  requested_by: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'commerce_payment_refunds',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['payment_session_id'] },
    { fields: ['tenant_id'] },
    { fields: ['provider_refund_id'] },
    { fields: ['status'] }
  ]
});
