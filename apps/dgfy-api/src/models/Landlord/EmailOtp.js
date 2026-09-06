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
      // #1614: 'pending' added and made the default -- a row must reflect
      // that nothing has been attempted yet until emailOtpService actually
      // confirms a send (or a failure). Previously this defaulted to
      // 'sent', so a row could read 'sent' even when SMTP delivery had
      // never even been attempted (e.g. the SMTP-not-configured throw path
      // in emailOtpService.js, which used to throw before any update at
      // all). Migration: 20260905000001-add-pending-email-otp-delivery-status.cjs.
      type: DataTypes.ENUM('pending', 'sent', 'failed', 'recorded', 'bounced'),
      allowNull: false,
      defaultValue: 'pending'
    },
    delivery_error: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    // Points at the canonical send record in email_delivery_logs (issue
    // #279). Not a duplicated provider_message_id -- the log row already
    // carries message_id, provider_queue_id, and full bounce detail; this
    // column just links back to it.
    email_delivery_id: {
      type: DataTypes.UUID,
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
