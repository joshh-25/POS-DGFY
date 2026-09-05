'use strict';

// #1614: emailOtpService.js's requestEmailOtp previously relied on the
// column default ('sent') for a freshly-created row, then only ever wrote
// 'failed'/'recorded' on a later, already-attempted send. That meant a row
// created just before the SMTP-not-configured throw path
// (EMAIL_OTP_DELIVERY_UNAVAILABLE, thrown *before* any update at all) was
// left reading delivery_status: 'sent' for an email that was never even
// attempted -- actively misleading during the #1614 investigation itself.
//
// Widens the enum to add 'pending' and flips the default to it.
// emailOtpService.js now sets delivery_status explicitly at every stage
// (create -> 'pending', confirmed send -> 'sent', any failure ->
// 'failed'), so this migration only needs to change what already-created
// rows fall back to and what the column itself allows -- no data backfill,
// since every pre-existing row already has a real, already-correct status
// written by the code as it existed before this fix.
//
// Idempotent guard mirrors 20260807000001-fix-email-otp-delivery-status.cjs.

const DELIVERY_STATUS_VALUES = ['pending', 'sent', 'failed', 'recorded', 'bounced'];
const PREVIOUS_DELIVERY_STATUS_VALUES = ['sent', 'failed', 'recorded', 'bounced'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table) return;

    const currentType = String(table.delivery_status?.type || '');
    if (!/'pending'/.test(currentType)) {
      await queryInterface.changeColumn('email_otps', 'delivery_status', {
        type: Sequelize.ENUM(...DELIVERY_STATUS_VALUES),
        allowNull: false,
        defaultValue: 'pending'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table) return;

    // Narrowing the enum back must not truncate rows the wider enum
    // allowed. A 'pending' row -- delivery genuinely never attempted or
    // still in flight -- has no equivalent in the pre-#1614 enum; collapse
    // it to 'failed' with an explanatory delivery_error, the same
    // "narrowing must be lossy but honest" approach the prior migration's
    // down() already established for 'recorded'/'bounced'.
    await queryInterface.sequelize.query(
      "UPDATE email_otps SET delivery_status = 'failed', " +
      "delivery_error = COALESCE(delivery_error, 'Rolled back from pending: delivery status unknown') " +
      "WHERE delivery_status = 'pending'"
    );

    const currentType = String((await queryInterface.describeTable('email_otps')).delivery_status?.type || '');
    if (/'pending'/.test(currentType)) {
      await queryInterface.changeColumn('email_otps', 'delivery_status', {
        type: Sequelize.ENUM(...PREVIOUS_DELIVERY_STATUS_VALUES),
        allowNull: false,
        defaultValue: 'sent'
      });
    }
  }
};
