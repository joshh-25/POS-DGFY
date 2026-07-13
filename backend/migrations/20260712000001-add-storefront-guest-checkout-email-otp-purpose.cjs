'use strict';

const EMAIL_OTP_PURPOSES = [
  'company_registration',
  'tenant_user_registration',
  'invitation_acceptance',
  'email_change',
  'dgfy_account_verification',
  'dgfy_password_reset',
  'dgfy_business_step_up',
  'dgfy_legacy_link',
  'storefront_guest_checkout'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table?.purpose) return;

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(...EMAIL_OTP_PURPOSES),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('email_otps').catch(() => null);
    if (!table?.purpose) return;

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(...EMAIL_OTP_PURPOSES.filter((purpose) => purpose !== 'storefront_guest_checkout')),
      allowNull: false
    });
  }
};
