import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260807000002-create-email-delivery-logs.cjs');

const Sequelize = {
  ENUM: (...values) => ({ type: 'ENUM', values }),
  UUID: 'UUID',
  UUIDV4: 'UUIDV4',
  STRING: (n) => ({ type: 'STRING', length: n }),
  INTEGER: 'INTEGER',
  JSON: 'JSON',
  DATE: 'DATE',
  literal: (sql) => ({ literal: sql })
};

const buildQueryInterface = ({ existingTables = [], indexes = [] } = {}) => ({
  showAllTables: jest.fn().mockResolvedValue(existingTables),
  createTable: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined),
  showIndex: jest.fn().mockResolvedValue(indexes),
  addIndex: jest.fn().mockResolvedValue(undefined),
  sequelize: {
    getDialect: jest.fn().mockReturnValue('mysql'),
    query: jest.fn().mockResolvedValue(undefined)
  }
});

describe('create email_delivery_logs migration', () => {
  it('creates the table with all four indexes when the table does not exist', async () => {
    const queryInterface = buildQueryInterface();

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).toHaveBeenCalledWith(
      'email_delivery_logs',
      expect.objectContaining({
        id: expect.any(Object),
        message_id: expect.any(Object),
        recipient_email_hash: expect.objectContaining({ allowNull: false }),
        recipient_domain: expect.objectContaining({ allowNull: false }),
        // PII must never be required, and bodies must never be a column at all.
        recipient_email: expect.objectContaining({ allowNull: true }),
        subject: expect.objectContaining({ allowNull: true })
      })
    );
    expect(queryInterface.createTable.mock.calls[0][1]).not.toHaveProperty('html');
    expect(queryInterface.createTable.mock.calls[0][1]).not.toHaveProperty('text');
    expect(queryInterface.createTable.mock.calls[0][1]).not.toHaveProperty('body');

    const indexNames = queryInterface.addIndex.mock.calls.map(([, , options]) => options.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_email_delivery_logs_sent_at',
        'idx_email_delivery_logs_status_sent_at',
        'idx_email_delivery_logs_recipient_hash',
        'idx_email_delivery_logs_domain_status'
      ])
    );
  });

  it('is idempotent when the table already exists', async () => {
    const queryInterface = buildQueryInterface({ existingTables: ['email_delivery_logs'] });

    await migration.up(queryInterface, Sequelize);

    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addIndex).not.toHaveBeenCalled();
  });

  it('skips indexes that already exist', async () => {
    const queryInterface = buildQueryInterface({
      indexes: [{ name: 'idx_email_delivery_logs_sent_at' }]
    });

    await migration.up(queryInterface, Sequelize);

    const indexNames = queryInterface.addIndex.mock.calls.map(([, , options]) => options.name);
    expect(indexNames).not.toContain('idx_email_delivery_logs_sent_at');
    expect(indexNames).toContain('idx_email_delivery_logs_status_sent_at');
  });

  it('down drops the table and its enum types when the table exists', async () => {
    const queryInterface = buildQueryInterface({ existingTables: ['email_delivery_logs'] });

    await migration.down(queryInterface);

    expect(queryInterface.dropTable).toHaveBeenCalledWith('email_delivery_logs');
    const queries = queryInterface.sequelize.query.mock.calls.map(([sql]) => sql);
    expect(queries).toEqual(
      expect.arrayContaining([
        'DROP TYPE IF EXISTS enum_email_delivery_logs_status',
        'DROP TYPE IF EXISTS enum_email_delivery_logs_bounce_type'
      ])
    );
  });

  it('down is a no-op when the table does not exist', async () => {
    const queryInterface = buildQueryInterface();

    await migration.down(queryInterface);

    expect(queryInterface.dropTable).not.toHaveBeenCalled();
  });
});
