'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const items = await queryInterface.describeTable('items');
    if (!items.senior_pwd_discount_eligible) {
      await queryInterface.addColumn('items', 'senior_pwd_discount_eligible', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Admin-controlled eligibility for statutory Senior Citizen/PWD discounts'
      });
    }

    const users = await queryInterface.describeTable('users');
    if (!users.pos_approval_pin_hash) {
      await queryInterface.addColumn('users', 'pos_approval_pin_hash', {
        type: Sequelize.STRING(255), allowNull: true,
        comment: 'Individual Admin POS approval PIN bcrypt hash'
      });
    }

    const tables = new Set((await queryInterface.showAllTables()).map((entry) => String(entry.tableName || entry).toLowerCase()));
    if (!tables.has('pos_discount_rules')) {
      await queryInterface.createTable('pos_discount_rules', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(100), allowNull: false },
        type: { type: Sequelize.ENUM('senior', 'pwd', 'employee', 'promo', 'manual'), allowNull: false },
        method: { type: Sequelize.ENUM('percentage', 'fixed'), allowNull: false, defaultValue: 'percentage' },
        rate: { type: Sequelize.DECIMAL(7, 4), allowNull: true },
        fixed_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        is_vat_exempt: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requires_customer_id: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requires_employee_id: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requires_manager_approval: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        max_discount_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('pos_discount_rules', ['type', 'is_active'], { name: 'idx_pos_discount_rules_type_active' });
      await queryInterface.bulkInsert('pos_discount_rules', [
        { name: 'Senior Citizen', type: 'senior', method: 'percentage', rate: 20, is_vat_exempt: true, requires_customer_id: true, requires_employee_id: false, requires_manager_approval: false, is_active: true, created_at: new Date(), updated_at: new Date() },
        { name: 'PWD', type: 'pwd', method: 'percentage', rate: 20, is_vat_exempt: true, requires_customer_id: true, requires_employee_id: false, requires_manager_approval: false, is_active: true, created_at: new Date(), updated_at: new Date() },
        { name: 'Employee Discount', type: 'employee', method: 'percentage', rate: null, is_vat_exempt: false, requires_customer_id: false, requires_employee_id: true, requires_manager_approval: true, is_active: true, created_at: new Date(), updated_at: new Date() },
        { name: 'Manual Discount', type: 'manual', method: 'percentage', rate: null, is_vat_exempt: false, requires_customer_id: false, requires_employee_id: false, requires_manager_approval: true, is_active: true, created_at: new Date(), updated_at: new Date() }
      ]);
    }

    if (!tables.has('pos_transaction_discounts')) {
      await queryInterface.createTable('pos_transaction_discounts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        transaction_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pos_transactions', key: 'pos_transaction_id' }, onDelete: 'CASCADE' },
        discount_rule_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'pos_discount_rules', key: 'id' }, onDelete: 'SET NULL' },
        discount_type: { type: Sequelize.STRING(40), allowNull: false },
        discount_method: { type: Sequelize.STRING(20), allowNull: false },
        discount_rate: { type: Sequelize.DECIMAL(7, 4), allowNull: true },
        discount_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        vat_removed: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        vat_exempt_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        customer_name: { type: Sequelize.STRING(255), allowNull: true },
        senior_pwd_id_number: { type: Sequelize.STRING(100), allowNull: true },
        employee_name: { type: Sequelize.STRING(255), allowNull: true },
        employee_id: { type: Sequelize.STRING(100), allowNull: true },
        manager_approval_id: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'user_id' }, onDelete: 'SET NULL' },
        manager_approved_at: { type: Sequelize.DATE, allowNull: true },
        self_approved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        reason: { type: Sequelize.STRING(500), allowNull: true },
        calculation_version: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'pos-discount.v1' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('pos_transaction_discounts', ['transaction_id'], { unique: true, name: 'uq_pos_transaction_discount_transaction' });
    }

    if (!tables.has('pos_transaction_discount_lines')) {
      await queryInterface.createTable('pos_transaction_discount_lines', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        transaction_discount_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pos_transaction_discounts', key: 'id' }, onDelete: 'CASCADE' },
        transaction_line_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'pos_transaction_lines', key: 'line_id' }, onDelete: 'CASCADE' },
        item_id: { type: Sequelize.INTEGER, allowNull: false },
        eligible_quantity: { type: Sequelize.DECIMAL(24, 12), allowNull: false, defaultValue: 0 },
        gross_eligible_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        vat_removed: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        vat_exempt_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        discount_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        final_line_amount: { type: Sequelize.DECIMAL(14, 4), allowNull: false, defaultValue: 0 },
        eligibility_override_reason: { type: Sequelize.STRING(500), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('pos_transaction_discount_lines', ['transaction_discount_id'], { name: 'idx_pos_discount_lines_discount' });
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pos_transaction_discount_lines');
    await queryInterface.dropTable('pos_transaction_discounts');
    await queryInterface.dropTable('pos_discount_rules');
    await queryInterface.removeColumn('users', 'pos_approval_pin_hash');
    await queryInterface.removeColumn('items', 'senior_pwd_discount_eligible');
  }
};
