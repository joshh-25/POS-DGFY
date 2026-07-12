import { DataTypes, Model } from 'sequelize';

export default (sequelize) => {
  class EmailOtp extends Model { }

  EmailOtp.init({
    otp_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    purpose: {
      type: DataTypes.ENUM('company_registration', 'tenant_user_registration', 'invitation_acceptance', 'email_change', 'dgfy_account_verification', 'dgfy_password_reset', 'dgfy_business_step_up', 'dgfy_legacy_link', 'storefront_guest_checkout'),
      allowNull: false
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      set(value) {
        this.setDataValue('email', String(value || '').trim().toLowerCase());
      },
      get() {
        const rawValue = this.getDataValue('email');
        return rawValue ? rawValue.toLowerCase() : null;
      }
    },
    code_hash: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    max_attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5
    },
    delivery_status: {
      type: DataTypes.ENUM('sent', 'failed'),
      allowNull: false,
      defaultValue: 'sent'
    },
    delivery_error: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
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
    modelName: 'EmailOtp',
    tableName: 'email_otps',
    underscored: true,
    timestamps: true
  });

  return EmailOtp;
};
