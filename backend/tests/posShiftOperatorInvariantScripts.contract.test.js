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
});
