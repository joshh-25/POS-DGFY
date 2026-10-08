'use strict';

const columns = (Sequelize) => ({
  materialization_status: {
    type: Sequelize.ENUM('not_started', 'in_progress', 'succeeded', 'failed'),
    allowNull: false,
    defaultValue: 'not_started'
  },
  materialization_error: {
    type: Sequelize.STRING(1000),
    allowNull: true
  },
  materialization_snapshot: {
    type: Sequelize.JSON,
    allowNull: true
  },
  materialized_tenant_id: {
    type: Sequelize.UUID,
    allowNull: true
  },
  materialized_application_id: {
    type: Sequelize.UUID,
    allowNull: true
  },
  materialized_at: {
    type: Sequelize.DATE,
    allowNull: true
  }
});

const indexDefinitions = [
  { fields: ['materialized_tenant_id'], name: 'idx_registration_draft_materialized_tenant' },
  { fields: ['materialized_application_id'], name: 'idx_registration_draft_materialized_application' }
];
const materializationColumnNames = Object.keys({
  materialization_status: true,
  materialization_error: true,
  materialization_snapshot: true,
  materialized_tenant_id: true,
  materialized_application_id: true,
  materialized_at: true
});

module.exports = {
  async up(queryInterface, Sequelize) {
    const table = 'company_registration_drafts';
    const existingTable = await queryInterface.describeTable(table).catch(() => null);
    if (!existingTable) return;

    for (const [name, definition] of Object.entries(columns(Sequelize))) {
      if (!existingTable[name]) {
        await queryInterface.addColumn(table, name, definition);
      }
    }

    const existingIndexes = await queryInterface.showIndex(table).catch(() => []);
    const existingIndexNames = new Set(existingIndexes.map((index) => index.name));
    for (const definition of indexDefinitions) {
      if (!existingIndexNames.has(definition.name)) {
        await queryInterface.addIndex(table, definition.fields, { name: definition.name });
      }
    }
  },

  async down(queryInterface) {
    const table = 'company_registration_drafts';
    const existingTable = await queryInterface.describeTable(table).catch(() => null);
    if (!existingTable) return;

    for (const definition of indexDefinitions) {
      await queryInterface.removeIndex(table, definition.name).catch(() => {});
    }

    for (const name of materializationColumnNames) {
      if (existingTable[name]) {
        await queryInterface.removeColumn(table, name).catch(() => {});
      }
    }
  }
};
