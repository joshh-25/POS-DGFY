import { DataTypes, Model } from 'sequelize';

// Canonical record of every outbound send (issue #279) -- written by
// emailService.sendEmail() for OTPs, invoices, invitations, cashier
// credentials, and billing reminders alike. See the create migration
// (20260807000002-create-email-delivery-logs.cjs) for the full rationale,
// especially why tenant_id has no FK and why email bodies are never stored.
export default (sequelize) => {
  class EmailDeliveryLog extends Model { }

  EmailDeliveryLog.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    message_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true
    },
    provider: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: 'smtp'
    },
    provider_queue_id: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    purpose: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    tenant_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    recipient_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    recipient_email_hash: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    recipient_domain: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    recipient_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    subject: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    from_email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('sent', 'partial', 'failed', 'bounced', 'deferred', 'complained'),
      allowNull: false,
      defaultValue: 'sent'
    },
    smtp_response: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    accepted_recipients: {
      type: DataTypes.JSON,
      allowNull: true
    },
    rejected_recipients: {
      type: DataTypes.JSON,
      allowNull: true
    },
    error_code: {
      type: DataTypes.STRING(80),
      allowNull: true
    },
    error_message: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    sent_at: {
      type: DataTypes.DATE,
      allowNull: false
    },
    bounce_type: {
      type: DataTypes.ENUM('hard', 'soft', 'complaint', 'unknown'),
      allowNull: true
    },
    bounce_status_code: {
      type: DataTypes.STRING(24),
      allowNull: true
    },
    bounce_diagnostic: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    bounce_reported_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    bounce_source_ref: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    pii_redacted_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'EmailDeliveryLog',
    tableName: 'email_delivery_logs',
    underscored: true,
    timestamps: true
  });

  return EmailDeliveryLog;
};
