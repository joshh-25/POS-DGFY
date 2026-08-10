'use strict';

// Issue #279: emailService.sendEmail() has always treated SMTP acceptance as
// success -- nodemailer's accepted/rejected/response/messageId were captured
// on the return value but never persisted, so a downstream rejection (the
// Yahoo/iCloud DMARC failures in #135) was invisible from our side. This
// table is the canonical record of every outbound send, written by
// sendEmail() itself (see emailService.js), covering ALL mail -- OTPs,
// invoices, invitations, cashier credentials, billing reminders -- not just
// the email_otps rows that already existed.
//
// `id` doubles as the bounce-correlation token: sendEmail() generates it
// before sending and embeds it in the outgoing Message-ID header
// (<id@domain>) plus a redundant X-DGFY-Delivery-Id header, so the async
// IMAP bounce poller (a later phase of #279) can match a DSN back to this
// row without needing the envelope sender to be predictable.
//
// tenant_id has NO foreign key, deliberately unlike email_otps' CASCADE FK
// to tenants: deliverability history (which domains bounce, whether Yahoo
// rejects us) must survive tenant deletion, and most sends (platform
// invitations, admin mail) have no tenant context at all.
//
// recipient_email is nulled by the retention prune job (a later phase of
// #279); recipient_email_hash and recipient_domain are retained indefinitely
// so per-address and per-domain deliverability analysis still works after
// redaction -- recipient_domain is what makes "yahoo.com: 0 sent / 41
// failed" a one-query answer instead of a manual log grep.
//
// This table intentionally never stores email bodies. sendCashierCredentialEmail
// puts a temporary password in its body and sendEmailOtpCode puts the OTP
// code in its body -- storing either would turn a deliverability log into a
// credential store. subject is kept (truncated) for operator triage only.
//
// Idempotent + reversible guards mirror 20260517000001-create-email-otps.cjs
// (table creation) and 20260803000001-add-ai-usage-feature-and-units.cjs
// (addIndexIfMissing).

const STATUS_VALUES = ['sent', 'partial', 'failed', 'bounced', 'deferred', 'complained'];
const BOUNCE_TYPE_VALUES = ['hard', 'soft', 'complaint', 'unknown'];

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (tableNames.includes('email_delivery_logs')) return;

    await queryInterface.createTable('email_delivery_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      message_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true
      },
      provider: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'smtp'
      },
      provider_queue_id: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      purpose: {
        type: Sequelize.STRING(80),
        allowNull: true
      },
      tenant_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      recipient_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      recipient_email_hash: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      recipient_domain: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      recipient_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      from_email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM(...STATUS_VALUES),
        allowNull: false,
        defaultValue: 'sent'
      },
      smtp_response: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      accepted_recipients: {
        type: Sequelize.JSON,
        allowNull: true
      },
      rejected_recipients: {
        type: Sequelize.JSON,
        allowNull: true
      },
      error_code: {
        type: Sequelize.STRING(80),
        allowNull: true
      },
      error_message: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      bounce_type: {
        type: Sequelize.ENUM(...BOUNCE_TYPE_VALUES),
        allowNull: true
      },
      bounce_status_code: {
        type: Sequelize.STRING(24),
        allowNull: true
      },
      bounce_diagnostic: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      bounce_reported_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      bounce_source_ref: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      pii_redacted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await addIndexIfMissing(queryInterface, 'email_delivery_logs', ['sent_at'], {
      name: 'idx_email_delivery_logs_sent_at'
    });
    await addIndexIfMissing(queryInterface, 'email_delivery_logs', ['status', 'sent_at'], {
      name: 'idx_email_delivery_logs_status_sent_at'
    });
    await addIndexIfMissing(queryInterface, 'email_delivery_logs', ['recipient_email_hash', 'sent_at'], {
      name: 'idx_email_delivery_logs_recipient_hash'
    });
    await addIndexIfMissing(queryInterface, 'email_delivery_logs', ['recipient_domain', 'status', 'sent_at'], {
      name: 'idx_email_delivery_logs_domain_status'
    });
  },

  async down(queryInterface) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) => (typeof table === 'object' ? table.tableName || table.name : table));
    if (!tableNames.includes('email_delivery_logs')) return;

    await queryInterface.dropTable('email_delivery_logs');
    if (queryInterface.sequelize.getDialect() === 'mysql') {
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_email_delivery_logs_status').catch(() => {});
      await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_email_delivery_logs_bounce_type').catch(() => {});
    }
  }
};
