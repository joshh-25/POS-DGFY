// DGFY-owned projections and durable inbox for the DGLaundry storefront
// contract. These tables intentionally contain only provider-supplied,
// customer-safe snapshots and immutable event metadata; DGFY never reads a
// DGLaundry database or stores DGLaundry credentials.
const tableExists = async (queryInterface, tableName) => {
  const tables = await queryInterface.showAllTables();
  return (tables || []).some((entry) => String(entry?.tableName || entry?.table_name || entry).toLowerCase() === tableName.toLowerCase());
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!await tableExists(queryInterface, 'dgfy_dglaundry_integration_events')) {
      await queryInterface.createTable('dgfy_dglaundry_integration_events', {
        id: { type: Sequelize.UUID, primaryKey: true },
        event_id: { type: Sequelize.STRING(200), allowNull: false, unique: true },
        direction: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'inbound' },
        event_type: { type: Sequelize.STRING(200), allowNull: false },
        company_id: { type: Sequelize.STRING(160), allowNull: true },
        location_id: { type: Sequelize.STRING(160), allowNull: true },
        aggregate_version: { type: Sequelize.INTEGER, allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: false },
        key_id: { type: Sequelize.STRING(160), allowNull: true },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'received' },
        failure_code: { type: Sequelize.STRING(120), allowNull: true },
        failure_reason: { type: Sequelize.STRING(500), allowNull: true },
        attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        next_attempt_at: { type: Sequelize.DATE, allowNull: true },
        received_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('dgfy_dglaundry_integration_events', ['event_type', 'status', 'received_at'], { name: 'idx_dglaundry_events_status' });
      await queryInterface.addIndex('dgfy_dglaundry_integration_events', ['company_id', 'location_id', 'event_type'], { name: 'idx_dglaundry_events_scope' });
    }

    if (!await tableExists(queryInterface, 'dgfy_dglaundry_catalog_projections')) {
      await queryInterface.createTable('dgfy_dglaundry_catalog_projections', {
        id: { type: Sequelize.UUID, primaryKey: true },
        company_id: { type: Sequelize.STRING(160), allowNull: false },
        location_id: { type: Sequelize.STRING(160), allowNull: false, defaultValue: '' },
        catalog_version: { type: Sequelize.STRING(120), allowNull: false },
        version_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        payload: { type: Sequelize.JSON, allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'published' },
        published_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('dgfy_dglaundry_catalog_projections', ['company_id', 'location_id'], { unique: true, name: 'uq_dglaundry_catalog_scope' });
    }

    if (!await tableExists(queryInterface, 'dgfy_dglaundry_availability_projections')) {
      await queryInterface.createTable('dgfy_dglaundry_availability_projections', {
        id: { type: Sequelize.UUID, primaryKey: true },
        company_id: { type: Sequelize.STRING(160), allowNull: false },
        location_id: { type: Sequelize.STRING(160), allowNull: false },
        availability_version: { type: Sequelize.STRING(120), allowNull: false },
        version_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        payload: { type: Sequelize.JSON, allowNull: false },
        status: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'published' },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('dgfy_dglaundry_availability_projections', ['company_id', 'location_id'], { unique: true, name: 'uq_dglaundry_availability_scope' });
    }

    if (!await tableExists(queryInterface, 'dgfy_dglaundry_order_projections')) {
      await queryInterface.createTable('dgfy_dglaundry_order_projections', {
        id: { type: Sequelize.UUID, primaryKey: true },
        company_id: { type: Sequelize.STRING(160), allowNull: false },
        location_id: { type: Sequelize.STRING(160), allowNull: false },
        external_order_reference: { type: Sequelize.STRING(200), allowNull: false },
        external_tracking_reference: { type: Sequelize.STRING(200), allowNull: true },
        aggregate_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        status: { type: Sequelize.STRING(60), allowNull: true },
        payload: { type: Sequelize.JSON, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('dgfy_dglaundry_order_projections', ['company_id', 'location_id', 'external_order_reference'], { unique: true, name: 'uq_dglaundry_order_reference' });
      await queryInterface.addIndex('dgfy_dglaundry_order_projections', ['external_tracking_reference'], { name: 'idx_dglaundry_order_tracking' });
    }

    if (!await tableExists(queryInterface, 'dgfy_dglaundry_order_idempotency')) {
      await queryInterface.createTable('dgfy_dglaundry_order_idempotency', {
        id: { type: Sequelize.UUID, primaryKey: true },
        idempotency_key: { type: Sequelize.STRING(160), allowNull: false, unique: true },
        request_hash: { type: Sequelize.STRING(64), allowNull: false },
        operation: { type: Sequelize.STRING(80), allowNull: false },
        response: { type: Sequelize.JSON, allowNull: false },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      await queryInterface.addIndex('dgfy_dglaundry_order_idempotency', ['operation', 'created_at'], { name: 'idx_dglaundry_idempotency_operation' });
    }
  },

  async down(queryInterface) {
    for (const table of [
      'dgfy_dglaundry_order_idempotency',
      'dgfy_dglaundry_order_projections',
      'dgfy_dglaundry_availability_projections',
      'dgfy_dglaundry_catalog_projections',
      'dgfy_dglaundry_integration_events'
    ]) {
      if (await tableExists(queryInterface, table)) await queryInterface.dropTable(table);
    }
  }
};
