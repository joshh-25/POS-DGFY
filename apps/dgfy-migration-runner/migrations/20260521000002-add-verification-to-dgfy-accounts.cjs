/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('dgfy_accounts');

    if (!table.email_verified_at) {
      await queryInterface.addColumn('dgfy_accounts', 'email_verified_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!table.phone_verified_at) {
      await queryInterface.addColumn('dgfy_accounts', 'phone_verified_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(
        'company_registration',
        'tenant_user_registration',
        'invitation_acceptance',
        'email_change',
        'dgfy_account_verification'
      ),
      allowNull: false
    }).catch(() => {});
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('dgfy_accounts');

    if (table.phone_verified_at) {
      await queryInterface.removeColumn('dgfy_accounts', 'phone_verified_at');
    }

    if (table.email_verified_at) {
      await queryInterface.removeColumn('dgfy_accounts', 'email_verified_at');
    }

    await queryInterface.changeColumn('email_otps', 'purpose', {
      type: Sequelize.ENUM(
        'company_registration',
        'tenant_user_registration',
        'invitation_acceptance',
        'email_change'
      ),
      allowNull: false
    }).catch(() => {});
  }
};
