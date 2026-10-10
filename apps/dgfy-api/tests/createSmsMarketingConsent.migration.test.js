import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261010000004-create-sms-marketing-consent.cjs');
const Sequelize = {
  ENUM: (...values) => ({ type: 'ENUM', values }), UUID: 'UUID', UUIDV4: 'UUIDV4',
  STRING: (length) => ({ type: 'STRING', length }), DATE: 'DATE',
  literal: (sql) => ({ literal: sql })
};
const buildQueryInterface = ({ tables = [] } = {}) => ({
  showAllTables: jest.fn().mockResolvedValue(tables), createTable: jest.fn().mockResolvedValue(undefined),
  dropTable: jest.fn().mockResolvedValue(undefined), addIndex: jest.fn().mockResolvedValue(undefined),
  sequelize: { getDialect: () => 'mysql', query: jest.fn().mockResolvedValue(undefined) }
});

describe('create sms marketing consent migration', () => {
  it('creates landlord consent, append-only event, and global suppression tables with unique identity keys', async () => {
    const qi = buildQueryInterface();
    await migration.up(qi, Sequelize);
    expect(qi.createTable.mock.calls.map(([name]) => name)).toEqual([
      'sms_marketing_consents', 'sms_consent_events', 'sms_global_suppressions'
    ]);
    expect(qi.createTable.mock.calls[0][1]).not.toHaveProperty('recipient_phone');
    expect(qi.addIndex).toHaveBeenCalledWith('sms_marketing_consents', ['tenant_id', 'recipient_phone_hash'], expect.objectContaining({ unique: true }));
  });

  it('skips pre-existing tables on up and drops all tables on down', async () => {
    const existing = buildQueryInterface({ tables: ['sms_marketing_consents', 'sms_consent_events', 'sms_global_suppressions'] });
    await migration.up(existing, Sequelize);
    expect(existing.createTable).not.toHaveBeenCalled();
    await migration.down(existing);
    expect(existing.dropTable.mock.calls.map(([name]) => name)).toEqual([
      'sms_global_suppressions', 'sms_consent_events', 'sms_marketing_consents'
    ]);
  });
});
