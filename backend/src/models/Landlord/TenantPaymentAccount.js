import { DataTypes } from 'sequelize';

export default (sequelize) => sequelize.define('TenantPaymentAccount', {
  account_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tenant_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  provider: {
    type: DataTypes.ENUM('paymongo'),
    allowNull: false,
    defaultValue: 'paymongo'
  },
  provider_merchant_id: {
    type: DataTypes.STRING(120),
    allowNull: false
  },
  provider_wallet_id: {
    type: DataTypes.STRING(120),
    allowNull: true
  },
  wallet_status: {
    type: DataTypes.ENUM('unknown', 'closed_loop', 'enabled', 'restricted'),
    allowNull: false,
    defaultValue: 'unknown'
  },
  wallet_verified_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  onboarding_status: {
    type: DataTypes.ENUM('not_started', 'pending', 'active', 'restricted'),
    allowNull: false,
    defaultValue: 'pending'
  },
  qrph_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  split_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  charges_enabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  requirements_due: {
    type: DataTypes.JSON,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  last_synced_at: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'tenant_payment_accounts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['tenant_id', 'provider'] },
    { fields: ['provider_merchant_id'] },
    { fields: ['onboarding_status'] }
  ]
});
