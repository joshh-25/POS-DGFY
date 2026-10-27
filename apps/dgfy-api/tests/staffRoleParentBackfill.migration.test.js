import { createRequire } from 'node:module';
import { describe, expect, it, jest } from '@jest/globals';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20261022000003-backfill-staff-role-pos-parents.cjs');

describe('staff-role POS parent capability migration', () => {
  it('adds only the required shift parents and records the previous JSON per role', async () => {
    const queries = [];
    const transaction = {
      finished: false,
      commit: jest.fn(async function commit() { this.finished = 'commit'; }),
      rollback: jest.fn(async function rollback() { this.finished = 'rollback'; })
    };
    const query = jest.fn(async (sql, options = {}) => {
      queries.push({ sql, options });
      if (sql === 'SELECT DATABASE() AS dbName') return [[{ dbName: 'sku_landlord' }], {}];
      if (sql.startsWith('SELECT db_name FROM tenants')) return [[{ db_name: 'sku_tenant_one' }], {}];
      if (sql.includes('information_schema.tables')) {
        const table = options.replacements?.[1];
        return [[{ count: ['tenants', 'staff_roles', 'audit_logs'].includes(table) ? 1 : 0 }], {}];
      }
      if (sql.includes('FROM `sku_landlord`.`staff_roles`')) {
        return [[{ staff_role_id: 4, capabilities: '["pos:shift_close"]' }], {}];
      }
      if (sql.includes('FROM `sku_tenant_one`.`staff_roles`')) {
        return [[
          { staff_role_id: 8, capabilities: ['pos:shift_access', 'pos:view'] },
          { staff_role_id: 9, capabilities: ['items:view'] }
        ], {}];
      }
      if (sql.startsWith('UPDATE ') || sql.startsWith('INSERT ')) return [[], {}];
      throw new Error(`Unexpected migration query: ${sql}`);
    });
    const queryInterface = {
      sequelize: {
        query,
        transaction: jest.fn(async () => transaction)
      }
    };

    await migration.up(queryInterface);

    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    const updates = queries.filter(({ sql }) => sql.startsWith('UPDATE '));
    expect(updates).toHaveLength(1);
    expect(updates[0].options.replacements).toEqual([
      '["pos:shift_close","pos:shift_access","pos:view"]',
      4
    ]);
    const auditInsert = queries.find(({ sql }) => sql.startsWith('INSERT '));
    expect(auditInsert.options.replacements).toEqual([
      4,
      JSON.stringify({
        migration: '20261022000003-backfill-staff-role-pos-parents',
        previous_capabilities: ['pos:shift_close'],
        capabilities: ['pos:shift_close', 'pos:shift_access', 'pos:view'],
        added_capabilities: ['pos:shift_access', 'pos:view']
      })
    ]);
  });

  it('is idempotent for roles that already include both parents', () => {
    const capabilities = ['pos:shift_access', 'pos:view', 'pos:shift_close'];
    expect(migration.repairCapabilities(capabilities)).toEqual(capabilities);
  });
});
