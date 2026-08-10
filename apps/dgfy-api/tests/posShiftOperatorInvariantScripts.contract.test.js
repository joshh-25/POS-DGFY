import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('POS shift operator invariant rollout scripts', () => {
    it('keeps tenant rollout targeted, guarded, and duplicate-safe', () => {
        const script = readFileSync(
            path.resolve('scripts/apply-pos-shift-operator-invariant.js'),
            'utf8'
        );

        expect(script).toContain('TENANT_SCHEMA_MUTATION_APPROVED');
        expect(script).toContain("process.argv.includes('--apply')");
        expect(script).toContain("WHERE status = 'open'");
        expect(script).toContain('HAVING COUNT(*) > 1');
        expect(script).toContain('active_operator_user_id');
        expect(script).toContain('uq_pos_terminal_shifts_active_operator');
        expect(script).toContain(": (missingColumn || missingIndex ? 'review' : 'compliant')");
        expect(script).not.toContain('pos_discount_rules');
        expect(script).not.toContain('sync({ alter: true })');
    });

    it('relaxes the cashier_id FK before adding the generated column, so ADD COLUMN never hits errno 1215', () => {
        const script = readFileSync(
            path.resolve('scripts/apply-pos-shift-operator-invariant.js'),
            'utf8'
        );

        expect(script).toContain("import { relaxPosShiftCashierForeignKey } from './sync-tenant-schemas.js'");

        const relaxIndex = script.indexOf('relaxPosShiftCashierForeignKey(connection, tenant.db_name)');
        const addColumnIndex = script.indexOf('GENERATED ALWAYS AS');
        expect(relaxIndex).toBeGreaterThan(-1);
        expect(addColumnIndex).toBeGreaterThan(-1);
        expect(relaxIndex).toBeLessThan(addColumnIndex);
    });

    it('exports the shared FK-relax helper used by the migration and both tenant scripts', () => {
        const script = readFileSync(
            path.resolve('scripts/sync-tenant-schemas.js'),
            'utf8'
        );

        expect(script).toContain('export async function relaxPosShiftCashierForeignKey(connection, tenantDb)');
        expect(script).toContain("TABLE_NAME = 'pos_terminal_shifts'");

        // Must run before the generic column-repair loop that adds active_operator_user_id,
        // or the repair loop's own ADD COLUMN fails with the same errno 1215.
        const relaxCallIndex = script.indexOf('await relaxPosShiftCashierForeignKey(connection, tenant.db_name);');
        const columnRepairLoopIndex = script.indexOf('for (const repair of columnRepairSql)');
        expect(relaxCallIndex).toBeGreaterThan(-1);
        expect(columnRepairLoopIndex).toBeGreaterThan(-1);
        expect(relaxCallIndex).toBeLessThan(columnRepairLoopIndex);
    });
});
