import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import defaultDb from '../src/models/index.js';
import { TENANT_LOCATION_REFERENCE_SOURCES } from '../src/modules/tenantLocations/repositories/tenantLocationReferenceSources.js';

const migrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260812000006-create-pos-split-payment-sessions.cjs'),
    'utf8'
);
const phase62MigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260812000007-add-pos-payment-confirmation-and-breakdown.cjs'),
    'utf8'
);
const phase63MigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260812000008-add-pos-provider-refund-reconciliation.cjs'),
    'utf8'
);
const phase129MigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260819000002-add-pos-split-allocation-reversal-state.cjs'),
    'utf8'
);
const employeeCreditSplitMigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260921000002-add-employee-credit-split-tender.cjs'),
    'utf8'
);
// #2067 landed independently on origin/develop as its own dated migration, three days after this
// branch's own #444 migration above -- both are additive/idempotent (guarded by columnExists/
// tableExists checks) and safe to run in sequence: this one only re-widens the same ENUM the #444
// migration already widened, and never touches employee_credit_account_code. Kept as a second,
// separate migration+test pair rather than folded into the one above -- see the merge commit for
// the full reconciliation note.
const employeeCreditSplitTenderMigrationSource = fs.readFileSync(
    path.resolve(process.cwd(), '../dgfy-migration-runner/migrations/20260924000001-add-employee-credit-split-tender.cjs'),
    'utf8'
);
const tenantSchemaSource = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/sync-tenant-schemas.js'),
    'utf8'
);

describe('split payment schema contract', () => {
    it('registers the tenant session and allocation models with governed enums', () => {
        expect(defaultDb.PosPaymentSession).toBeDefined();
        expect(defaultDb.PosPaymentSession.tableName).toBe('pos_payment_sessions');
        expect(defaultDb.PosPaymentSession.rawAttributes.status.values).toEqual([
            'open',
            'partially_paid',
            'ready_to_complete',
            'completed',
            'cancelled'
        ]);
        expect(defaultDb.PosPaymentSession.rawAttributes.snapshot.type.toString()).toContain('JSON');
        expect(defaultDb.PosPaymentSession.rawAttributes.idempotency_key.unique).toBe(true);

        expect(defaultDb.PosPaymentAllocation).toBeDefined();
        expect(defaultDb.PosPaymentAllocation.tableName).toBe('pos_payment_allocations');
        expect(defaultDb.PosPaymentAllocation.rawAttributes.status.values).toEqual([
            'pending',
            'successful',
            'failed',
            'cancelled',
            'reversed'
        ]);
        // 'cheque' added by ADR 0077; Employee Credit mixed tender added by ADR 0085 -- Phase 444.
        expect(defaultDb.PosPaymentAllocation.rawAttributes.payment_method.values).toEqual([
            'cash',
            'gcash',
            'maya',
            'card',
            'bank_transfer',
            'cheque',
            'employee_credit'
        ]);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.employee_credit_account_code.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.cash_tendered.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.change_amount.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_event_id.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_refund_ids.type.toString()).toContain('JSON');
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_refund_event_id.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.reversed_amount.allowNull).toBe(false);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.reversal_status.values).toEqual([
            'none',
            'pending',
            'partial',
            'completed',
            'manual_review_required'
        ]);
        expect(defaultDb.PosTransactionAdjustment).toBeDefined();
        expect(defaultDb.PosTransactionAdjustment.rawAttributes.pos_payment_allocation_id.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.associations.transactionAdjustments).toBeDefined();
        expect(defaultDb.PosTransactionAdjustment.associations.paymentAllocation).toBeDefined();
        expect(defaultDb.PosTransaction.rawAttributes.payment_breakdown.type.toString()).toContain('JSON');
        expect(defaultDb.PosPaymentSession.associations.allocations).toBeDefined();
        expect(defaultDb.PosPaymentAllocation.associations.session).toBeDefined();
    });

    it('adds provider refund reconciliation evidence and replay protection in Phase 63', () => {
        expect(phase63MigrationSource).toContain("'provider_refund_ids'");
        expect(phase63MigrationSource).toContain("'provider_refund_event_id'");
        expect(phase63MigrationSource).toContain("'provider_refund_status'");
        expect(phase63MigrationSource).toContain('uq_pos_payment_allocations_provider_refund_event_id');
        expect(phase63MigrationSource).not.toContain('createRefund');
    });

    it('adds allocation-level reversal state and attribution without provider writes in Phase 129', () => {
        expect(phase129MigrationSource).toContain("'reversed_amount'");
        expect(phase129MigrationSource).toContain("'reversal_status'");
        expect(phase129MigrationSource).toContain("'pos_payment_allocation_id'");
        expect(phase129MigrationSource).toContain("name: ALLOCATION_ADJUSTMENT_FK");
        expect(phase129MigrationSource).toContain("const ALLOCATION_ADJUSTMENT_FK = 'fk_pos_adjustment_payment_allocation'");
        expect(phase129MigrationSource).toContain('idx_pos_payment_allocations_session_reversal_status');
        expect(phase129MigrationSource).toContain('idx_pos_transaction_adjustments_allocation_created');
        expect(phase129MigrationSource).toContain("references: { table: 'pos_payment_allocations', field: 'pos_payment_allocation_id' }");
        expect(phase129MigrationSource).not.toContain('createRefund');
        expect(phase129MigrationSource).not.toContain('Payment.create');
    });

    it('adds Employee Credit as an append-only split tender with rollback protection', () => {
        expect(employeeCreditSplitMigrationSource).toContain("'employee_credit'");
        expect(employeeCreditSplitMigrationSource).toContain('employee_credit_account_code');
        expect(employeeCreditSplitMigrationSource).toContain('Cannot roll back Employee Credit split tender');
        expect(employeeCreditSplitMigrationSource).toContain('getActiveTenantDatabaseNames');
        expect(employeeCreditSplitMigrationSource).not.toContain('Payment.create');
    });

    it('widens the allocation tender enum for Employee Credit across active tenant databases (#2067)', () => {
        expect(employeeCreditSplitTenderMigrationSource).toContain("'cash','gcash','maya','card','bank_transfer','cheque','employee_credit'");
        expect(employeeCreditSplitTenderMigrationSource).toContain('information_schema.tables');
        expect(employeeCreditSplitTenderMigrationSource).toContain('tenants WHERE status = \'active\'');
        expect(employeeCreditSplitTenderMigrationSource).toContain('contains employee_credit rows');
    });

    it('uses an additive migration with dependency-ordered tables and no payment writes', () => {
        expect(migrationSource).toContain("if (!(await tableExists(queryInterface, 'pos_payment_sessions')))");
        expect(migrationSource).toContain("if (!(await tableExists(queryInterface, 'pos_payment_allocations')))");
        expect(migrationSource).toContain("references: { model: 'pos_parked_sales', key: 'pos_parked_sale_id' }");
        expect(migrationSource).toContain("references: { model: 'pos_payment_sessions', key: 'pos_payment_session_id' }");
        expect(migrationSource).toContain("name: 'uq_pos_payment_allocations_session_idempotency'");
        expect(migrationSource).not.toContain('PosTransaction.create');
        expect(migrationSource).not.toContain('Payment.create');
    });

    it('adds only the provider-event and immutable receipt/report snapshot columns in Phase 62', () => {
        expect(phase62MigrationSource).toContain("'payment_breakdown'");
        expect(phase62MigrationSource).toContain("'provider_event_id'");
        expect(phase62MigrationSource).toContain("uq_pos_payment_allocations_provider_event_id");
        expect(phase62MigrationSource).not.toContain('PosTransaction.create');
        expect(phase62MigrationSource).not.toContain('Payment.create');
    });

    it('registers both tenant tables for repair and pre-existing tenant coverage', () => {
        expect(tenantSchemaSource).toContain('pos_payment_sessions: Object.freeze({');
        expect(tenantSchemaSource).toContain('pos_payment_allocations: Object.freeze({');
        expect(tenantSchemaSource).toContain('pos_payment_sessions_ibfk_4');
        expect(tenantSchemaSource).toContain('pos_payment_allocations_ibfk_1');
        expect(tenantSchemaSource).toContain('provider_refund_event_id');
        expect(tenantSchemaSource).toContain('reversed_amount');
        expect(tenantSchemaSource).toContain('reversal_status');
        expect(tenantSchemaSource).toContain('employee_credit_account_code');
        expect(tenantSchemaSource).toContain("'employee_credit'");
        expect(tenantSchemaSource).toContain('pos_payment_allocation_id');
        expect(tenantSchemaSource).toContain('ADD COLUMN `pos_payment_allocation_id`');
        expect(tenantSchemaSource).toContain('idx_pos_payment_allocations_session_reversal_status');
        expect(tenantSchemaSource).toContain('idx_pos_transaction_adjustments_allocation_created');
        expect(tenantSchemaSource).toContain("payment_method` enum('cash','gcash','maya','card','bank_transfer','cheque','employee_credit')");
        expect(TENANT_LOCATION_REFERENCE_SOURCES).toEqual(expect.arrayContaining([
            expect.objectContaining({
                modelName: 'PosPaymentSession',
                association: 'PosPaymentSession.location',
                foreignKeys: ['location_id']
            }),
            expect.objectContaining({
                modelName: 'PosPaymentAllocation',
                association: 'PosPaymentAllocation.location',
                foreignKeys: ['location_id']
            })
        ]));
    });
});
