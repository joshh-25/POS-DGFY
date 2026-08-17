import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import defaultDb from '../src/models/index.js';

const migrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260812000001-create-pos-parked-sales.cjs'),
    'utf8'
);
const revisionMigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260813000002-add-pos-parked-sale-revision.cjs'),
    'utf8'
);
const ownershipMigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260815000002-add-pos-parked-sale-origin-ownership.cjs'),
    'utf8'
);

describe('parked sale schema contract', () => {
    it('registers the tenant model and lifecycle fields', () => {
        expect(defaultDb.PosParkedSale).toBeDefined();
        expect(defaultDb.PosParkedSale.tableName).toBe('pos_parked_sales');
        expect(defaultDb.PosParkedSale.rawAttributes.status.values).toEqual([
            'parked',
            'claimed',
            'completed',
            'cancelled'
        ]);
        expect(defaultDb.PosParkedSale.rawAttributes.snapshot.type.toString()).toContain('JSON');
        expect(defaultDb.PosParkedSale.rawAttributes.idempotency_key.unique).toBe(true);
        expect(defaultDb.PosParkedSale.rawAttributes.revision.defaultValue).toBe(1);
        expect(defaultDb.PosParkedSale.rawAttributes.origin_cashier_id.allowNull).toBe(true);
        expect(defaultDb.PosParkedSale.rawAttributes.origin_shift_id.allowNull).toBe(true);
    });

    it('uses an additive migration with tenant-safe foreign keys and no transaction writes', () => {
        expect(migrationSource).toContain("if (await tableExists(queryInterface, 'pos_parked_sales')) return;");
        expect(migrationSource).toContain('type: Sequelize.ENUM(...STATUS_VALUES)');
        expect(migrationSource).toContain("references: { model: 'pos_transactions', key: 'pos_transaction_id' }");
        expect(migrationSource).not.toContain('PosTransaction.create');
    });

    it('adds a non-destructive revision counter for optimistic re-park protection', () => {
        expect(revisionMigrationSource).toContain("const COLUMN = 'revision'");
        expect(revisionMigrationSource).toContain('defaultValue: 1');
        expect(revisionMigrationSource).toContain('allowNull: false');
    });

    it('adds and backfills origin ownership without deleting existing parked-sale rows', () => {
        expect(ownershipMigrationSource).toContain("const TABLE = 'pos_parked_sales'");
        expect(ownershipMigrationSource).toContain("origin_cashier_id");
        expect(ownershipMigrationSource).toContain("origin_shift_id");
        expect(ownershipMigrationSource).toContain('COALESCE(origin_cashier_id, cashier_id)');
        expect(ownershipMigrationSource).toContain('COALESCE(origin_shift_id, shift_id)');
        expect(ownershipMigrationSource).not.toContain('dropTable');
    });
});
