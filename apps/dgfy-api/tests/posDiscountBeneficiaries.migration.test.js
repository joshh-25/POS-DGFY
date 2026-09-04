import { describe, expect, it, jest } from '@jest/globals';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const migration = require('../../dgfy-migration-runner/migrations/20260904000001-create-pos-discount-beneficiaries.cjs');
const Sequelize = { INTEGER: 'INTEGER', STRING: (length) => ({ type: 'STRING', length }), DATE: 'DATE', literal: (sql) => ({ literal: sql }) };

describe('POS discount beneficiaries migration', () => {
  it('creates normalized beneficiaries and links discount allocations', async () => {
    const queryInterface = {
      showAllTables: jest.fn().mockResolvedValue(['pos_transaction_discount_lines']),
      describeTable: jest.fn().mockResolvedValue({ id: {} }),
      createTable: jest.fn(), addColumn: jest.fn(), addIndex: jest.fn()
    };
    await migration.up(queryInterface, Sequelize);
    expect(queryInterface.createTable).toHaveBeenCalledWith('pos_transaction_discount_beneficiaries', expect.objectContaining({ transaction_discount_id: expect.any(Object), id_number: expect.any(Object) }));
    expect(queryInterface.addColumn).toHaveBeenCalledWith('pos_transaction_discount_lines', 'beneficiary_id', expect.objectContaining({ allowNull: true }));
  });

  it('is idempotent when both structures exist', async () => {
    const queryInterface = {
      showAllTables: jest.fn().mockResolvedValue(['pos_transaction_discount_beneficiaries', 'pos_transaction_discount_lines']),
      describeTable: jest.fn().mockResolvedValue({ beneficiary_id: {} }),
      createTable: jest.fn(), addColumn: jest.fn(), addIndex: jest.fn()
    };
    await migration.up(queryInterface, Sequelize);
    expect(queryInterface.createTable).not.toHaveBeenCalled();
    expect(queryInterface.addColumn).not.toHaveBeenCalled();
  });
});
