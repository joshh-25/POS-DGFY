'use strict';

// Fixes a live bug (issue #279): emailOtpService.js's dev-fallback path
// writes delivery_status: 'recorded' (see requestEmailOtp, both the
// "SMTP not configured" branch and the "send failed, fall back" catch), but
// the column has only ever supported ENUM('sent', 'failed')
// (20260517000001-create-email-otps.cjs). Under MySQL strict mode that
// UPDATE throws "Data truncated for column 'delivery_status'" instead of
// recording the dev OTP -- so a developer with no SMTP configured gets a 500
// from requestEmailOtp instead of a working local OTP flow. Widening the
// enum to include 'recorded' (matching what the code already writes) fixes
// this without touching emailOtpService.js's control flow.
//
// Also adds 'bounced' up front, ahead of #279's async bounce-capture work
// (email_delivery_logs / IMAP DSN polling), so that work can flip an OTP's
// mirrored status without a second migration.
//
// email_delivery_id links an OTP row to its canonical send record in the
// new email_delivery_logs table (20260807000002-create-email-delivery-logs)
// -- deliberately not a duplicated provider_message_id column, since the
// canonical row already carries message_id, provider_queue_id, and full
// bounce detail; a copy here would only drift out of sync with it.
//
// Idempotent guards mirror 20260801000002-add-service-addons-toggle.cjs
// (columns) and 20260803000001-add-ai-usage-feature-and-units.cjs (index).

const DELIVERY_STATUS_VALUES = ['sent', 'failed', 'recorded', 'bounced'];
const ORIGINAL_DELIVERY_STATUS_VALUES = ['sent', 'failed'];
const INDEX_NAME = 'idx_email_otps_email_delivery_id';

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  if (indexes.some((index) => index.name === options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table) return;

    const currentType = String(table.delivery_status?.type || '');
    if (!/'recorded'/.test(currentType)) {
      await queryInterface.changeColumn('email_otps', 'delivery_status', {
        type: Sequelize.ENUM(...DELIVERY_STATUS_VALUES),
        allowNull: false,
        defaultValue: 'sent'
      });
    }

    if (!table.email_delivery_id) {
      await queryInterface.addColumn('email_otps', 'email_delivery_id', {
        type: Sequelize.UUID,
        allowNull: true,
        after: 'delivery_error'
      });
    }

    await addIndexIfMissing(queryInterface, 'email_otps', ['email_delivery_id'], {
      name: INDEX_NAME
    });
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table) return;

    const indexes = await queryInterface.showIndex('email_otps').catch(() => []);
    if (indexes.some((index) => index.name === INDEX_NAME)) {
      await queryInterface.removeIndex('email_otps', INDEX_NAME);
    }

    if (table.email_delivery_id) {
      await queryInterface.removeColumn('email_otps', 'email_delivery_id');
    }

    // Narrowing the enum back must not truncate rows the wider enum allowed.
    // 'bounced' rows collapse to 'failed'; 'recorded' rows collapse to
    // 'failed' too, since the original enum has no local/dev-record state.
    await queryInterface.sequelize.query(
      "UPDATE email_otps SET delivery_status = 'failed' WHERE delivery_status IN ('recorded', 'bounced')"
    );

    const currentType = String((await queryInterface.describeTable('email_otps')).delivery_status?.type || '');
    if (!/^enum\('sent','failed'\)$/i.test(currentType) && /'recorded'|'bounced'/.test(currentType)) {
      await queryInterface.changeColumn('email_otps', 'delivery_status', {
        type: Sequelize.ENUM(...ORIGINAL_DELIVERY_STATUS_VALUES),
        allowNull: false,
        defaultValue: 'sent'
      });
    }
  }
};
