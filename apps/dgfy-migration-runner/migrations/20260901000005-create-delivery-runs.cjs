'use strict';

const tableExists = async (queryInterface, tableName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table);
};

const columnExists = async (queryInterface, tableName, columnName) => {
  const table = await queryInterface.describeTable(tableName).catch(() => null);
  return Boolean(table && table[columnName]);
};

const indexExists = async (queryInterface, tableName, indexName) => {
  const indexes = await queryInterface.showIndex(tableName).catch(() => []);
  return indexes.some((index) => index.name === indexName);
};

const addColumnIfMissing = async (queryInterface, tableName, columnName, definition) => {
  if (await columnExists(queryInterface, tableName, columnName)) return;
  await queryInterface.addColumn(tableName, columnName, definition);
};

const addIndexIfMissing = async (queryInterface, tableName, fields, options) => {
  if (await indexExists(queryInterface, tableName, options.name)) return;
  await queryInterface.addIndex(tableName, fields, options);
};

module.exports = {
  async up(queryInterface, Sequelize) {
    if (!(await tableExists(queryInterface, 'delivery_runs'))) {
      await queryInterface.createTable('delivery_runs', {
        delivery_run_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        label: {
          type: Sequelize.STRING(120),
          allowNull: false
        },
        scheduled_date: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        status: {
          type: Sequelize.ENUM('draft', 'scheduled', 'dispatched', 'completed', 'cancelled'),
          allowNull: false,
          defaultValue: 'draft'
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'tenant_locations', key: 'location_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });
    }

    await addIndexIfMissing(queryInterface, 'delivery_runs', ['status', 'scheduled_date'], {
      name: 'idx_delivery_runs_status_scheduled'
    });
    await addIndexIfMissing(queryInterface, 'delivery_runs', ['location_id', 'status'], {
      name: 'idx_delivery_runs_location_status'
    });

    if (!(await tableExists(queryInterface, 'delivery_run_personnel'))) {
      await queryInterface.createTable('delivery_run_personnel', {
        delivery_run_personnel_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        // ON DELETE RESTRICT, not CASCADE: delivery_run_id is also the base column of the
        // accountable_run_id STORED generated column below. #1166's own investigation established
        // (live against MySQL 8.0.46) that InnoDB unconditionally rejects a CASCADE or SET NULL FK
        // action on a column that is also a generated column's base column elsewhere in the same
        // table, regardless of whether the FK is added inline at CREATE TABLE time or via a later
        // ALTER. RESTRICT is the only action MySQL accepts here. A run with member rows must have
        // its personnel deleted (or reparented) before the run itself can be deleted.
        delivery_run_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'delivery_runs', key: 'delivery_run_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'RESTRICT'
        },
        delivery_personnel_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'delivery_personnel', key: 'delivery_personnel_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'RESTRICT'
        },
        delivery_personnel_name: {
          type: Sequelize.STRING(255),
          allowNull: true
        },
        is_accountable: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'user_id' },
          onUpdate: 'RESTRICT',
          onDelete: 'SET NULL'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
        }
      });

      // Enforces "at most one accountable personnel row per run": a STORED generated column that
      // collapses to the run id only when is_accountable=1, then a unique index on that column.
      // Same pattern as 20260703000002-enforce-one-open-shift-per-terminal.cjs's
      // active_terminal_id. "At least one" cannot be expressed this way (a run with zero
      // accountable rows is DB-legal) and is enforced by the Phase 225 use case instead.
      await queryInterface.sequelize.query(`
        ALTER TABLE delivery_run_personnel
        ADD COLUMN accountable_run_id INT
        GENERATED ALWAYS AS (
          CASE WHEN is_accountable = 1 THEN delivery_run_id ELSE NULL END
        ) STORED
      `);
    }

    await addIndexIfMissing(
      queryInterface,
      'delivery_run_personnel',
      ['accountable_run_id'],
      { name: 'uq_delivery_run_personnel_accountable', unique: true }
    );
    await addIndexIfMissing(
      queryInterface,
      'delivery_run_personnel',
      ['delivery_run_id', 'delivery_personnel_id'],
      { name: 'uq_delivery_run_personnel_member', unique: true }
    );
    await addIndexIfMissing(queryInterface, 'delivery_run_personnel', ['delivery_run_id'], {
      name: 'idx_delivery_run_personnel_run'
    });
    await addIndexIfMissing(queryInterface, 'delivery_run_personnel', ['delivery_personnel_id'], {
      name: 'idx_delivery_run_personnel_personnel'
    });

    if (!(await tableExists(queryInterface, 'delivery_jobs'))) return;

    // Nullable, grouping link only -- delivery_jobs.pos_transaction_id stays UNIQUE and untouched.
    await addColumnIfMissing(queryInterface, 'delivery_jobs', 'delivery_run_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'delivery_runs', key: 'delivery_run_id' },
      onUpdate: 'RESTRICT',
      onDelete: 'SET NULL'
    });

    await addIndexIfMissing(queryInterface, 'delivery_jobs', ['delivery_run_id', 'status'], {
      name: 'idx_delivery_jobs_run_status'
    });
  },

  async down(queryInterface) {
    if (await tableExists(queryInterface, 'delivery_jobs')) {
      if (await indexExists(queryInterface, 'delivery_jobs', 'idx_delivery_jobs_run_status')) {
        await queryInterface.removeIndex('delivery_jobs', 'idx_delivery_jobs_run_status');
      }
      if (await columnExists(queryInterface, 'delivery_jobs', 'delivery_run_id')) {
        await queryInterface.removeColumn('delivery_jobs', 'delivery_run_id');
      }
    }

    if (await tableExists(queryInterface, 'delivery_run_personnel')) {
      await queryInterface.dropTable('delivery_run_personnel');
    }

    if (await tableExists(queryInterface, 'delivery_runs')) {
      if (await indexExists(queryInterface, 'delivery_runs', 'idx_delivery_runs_location_status')) {
        await queryInterface.removeIndex('delivery_runs', 'idx_delivery_runs_location_status');
      }
      if (await indexExists(queryInterface, 'delivery_runs', 'idx_delivery_runs_status_scheduled')) {
        await queryInterface.removeIndex('delivery_runs', 'idx_delivery_runs_status_scheduled');
      }
      await queryInterface.dropTable('delivery_runs');
    }
  }
};
