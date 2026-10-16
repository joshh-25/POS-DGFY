import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261010000002-create-sms-delivery-logs.cjs');
const Sequelize = {
  ENUM: (...values) => ({ type: 'ENUM', values }), UUID: 'UUID', UUIDV4: 'UUIDV4',
  STRING: (length) => ({ type: 'STRING', length }), BOOLEAN: 'BOOLEAN', JSON: 'JSON', DATE: 'DATE',
  literal: (sql) => ({ literal: sql })
};
const buildQueryInterface = ({ tables = [], indexes = [] } = {}) => ({
  showAllTables: jest.fn().mockResolvedValue(tables), createTable: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined), showIndex: jest.fn().mockResolvedValue(indexes),
  addIndex: jest.fn().mockResolvedValue(undefined), sequelize: { getDialect: () => 'mysql', query: jest.fn().mockResolvedValue(undefined) }
});

describe('create sms_delivery_logs migration', () => {
  it('creates a body-free table and the required indexes', async () => {
    const qi = buildQueryInterface();
    await migration.up(qi, Sequelize);
    expect(qi.createTable).toHaveBeenCalledWith('sms_delivery_logs', expect.objectContaining({
      dedupe_key: expect.objectContaining({ unique: true }), recipient_phone_hash: expect.objectContaining({ allowNull: false })
    }));
    expect(qi.createTable.mock.calls[0][1]).not.toHaveProperty('content');
    expect(qi.addIndex.mock.calls.map((call) => call[2].name)).toEqual(expect.arrayContaining([
      'idx_sms_delivery_logs_sent_at', 'idx_sms_delivery_logs_status_sent_at', 'idx_sms_delivery_logs_recipient_hash'
    ]));
  });

  it('skips existing tables and drops an existing table on down', async () => {
    const existing = buildQueryInterface({ tables: ['sms_delivery_logs'] });
    await migration.up(existing, Sequelize);
    expect(existing.createTable).not.toHaveBeenCalled();
    await migration.down(existing);
    expect(existing.dropTable).toHaveBeenCalledWith('sms_delivery_logs');
  });
});
