/** @type {import('sequelize-cli').Migration} */
const INDEX_NAME = 'idx_user_invitations_tenant_staff_role_status';
const COLUMNS = {
  staff_role_id: (Sequelize) => ({ type: Sequelize.INTEGER, allowNull: true }),
  staff_role_name: (Sequelize) => ({ type: Sequelize.STRING(120), allowNull: true }),
  cancellation_reason: (Sequelize) => ({ type: Sequelize.STRING(80), allowNull: true })
};

const tableExists = async (queryInterface) => {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => (typeof table === 'object' ? table.tableName || table.name : table) === 'user_invitations');
};

const indexExists = async (queryInterface) => {
  const indexes = await queryInterface.showIndex('user_invitations').catch(() => []);
  return indexes.some((index) => index.name === INDEX_NAME);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface))) {
      throw new Error('user_invitations must exist before adding custom staff role metadata');
    }

    const existingColumns = await queryInterface.describeTable('user_invitations');
    for (const [column, definition] of Object.entries(COLUMNS)) {
      if (!existingColumns[column]) await queryInterface.addColumn('user_invitations', column, definition(Sequelize));
    }

    if (!(await indexExists(queryInterface))) {
      await queryInterface.addIndex('user_invitations', ['tenant_id', 'staff_role_id', 'status'], { name: INDEX_NAME });
    }
  },

  async down(queryInterface) {
    if (!(await tableExists(queryInterface))) return;

    if (await indexExists(queryInterface)) await queryInterface.removeIndex('user_invitations', INDEX_NAME);
    const existingColumns = await queryInterface.describeTable('user_invitations');
    for (const column of Object.keys(COLUMNS).reverse()) {
      if (existingColumns[column]) await queryInterface.removeColumn('user_invitations', column);
    }
  }
};
