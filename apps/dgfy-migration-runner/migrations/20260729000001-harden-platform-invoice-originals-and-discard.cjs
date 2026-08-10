'use strict';

const hasIndex = async (queryInterface, table, name) => (
  (await queryInterface.showIndex(table).catch(() => [])).some((index) => index.name === name)
);

// MySQL's default FK-backing-index name (`<table>_<column>_foreign_idx`) blows
// past the 64-char identifier limit for this table/column pair, so the FK is
// added as its own constraint with an explicit short name instead of via
// `addColumn`'s inline `references` option.
const FK_NAME = 'fk_platform_invoices_original_registration_application_id';

const hasConstraint = async (queryInterface, table, name) => {
  const [rows] = await queryInterface.sequelize.query(
    `
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME = ?
      LIMIT 1
    `,
    { replacements: [table, name] }
  );
  return Array.isArray(rows) && rows.length > 0;
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('platform_invoices');
    if (!table.original_registration_application_id) {
      await queryInterface.addColumn('platform_invoices', 'original_registration_application_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    }

    if (!await hasConstraint(queryInterface, 'platform_invoices', FK_NAME)) {
      await queryInterface.addConstraint('platform_invoices', {
        fields: ['original_registration_application_id'],
        type: 'foreign key',
        name: FK_NAME,
        references: { table: 'company_registration_applications', field: 'id' },
        onDelete: 'RESTRICT'
      });
    }

    await queryInterface.sequelize.query(`
      UPDATE platform_invoices
      SET original_registration_application_id = registration_application_id
      WHERE invoice_kind = 'original'
        AND original_registration_application_id IS NULL
    `);

    if (!await hasIndex(queryInterface, 'platform_invoices', 'unique_platform_invoice_original_guard')) {
      // MySQL permits multiple NULL values in a unique index. Originals carry
      // the application UUID; replacement invoices deliberately carry NULL.
      await queryInterface.addIndex('platform_invoices', ['original_registration_application_id'], {
        unique: true,
        name: 'unique_platform_invoice_original_guard'
      });
    }

    await queryInterface.changeColumn('platform_invoices', 'invoice_status', {
      type: Sequelize.ENUM('draft', 'issued', 'partially_credited', 'fully_credited', 'discarded'),
      allowNull: false,
      defaultValue: 'draft'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("DELETE FROM platform_invoices WHERE invoice_status = 'discarded'");
    await queryInterface.changeColumn('platform_invoices', 'invoice_status', {
      type: Sequelize.ENUM('draft', 'issued', 'partially_credited', 'fully_credited'),
      allowNull: false,
      defaultValue: 'draft'
    });
    if (await hasIndex(queryInterface, 'platform_invoices', 'unique_platform_invoice_original_guard')) {
      await queryInterface.removeIndex('platform_invoices', 'unique_platform_invoice_original_guard');
    }
    if (await hasConstraint(queryInterface, 'platform_invoices', FK_NAME)) {
      await queryInterface.removeConstraint('platform_invoices', FK_NAME);
    }
    const table = await queryInterface.describeTable('platform_invoices');
    if (table.original_registration_application_id) {
      await queryInterface.removeColumn('platform_invoices', 'original_registration_application_id');
    }
  }
};
