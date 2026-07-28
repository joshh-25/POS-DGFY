'use strict';

module.exports = {
  async up(queryInterface) {
    // Migration 00008 may run on MySQL installations where the original unique
    // index survives the attempted removal. Replacements need the source link
    // to be non-unique; application logic enforces one original and one
    // replacement per credited original instead.
    await queryInterface.removeIndex('platform_invoices', 'unique_platform_invoice_original_application').catch(() => {});
  },
  async down(queryInterface) {
    await queryInterface.addIndex('platform_invoices', ['registration_application_id'], { unique: true, name: 'unique_platform_invoice_original_application' }).catch(() => {});
  }
};
