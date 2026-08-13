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
        expect(defaultDb.PosPaymentAllocation.rawAttributes.payment_method.values).toEqual([
            'cash',
            'gcash',
            'maya',
            'card',
            'bank_transfer'
        ]);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.cash_tendered.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.change_amount.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_event_id.allowNull).toBe(true);
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_refund_ids.type.toString()).toContain('JSON');
        expect(defaultDb.PosPaymentAllocation.rawAttributes.provider_refund_event_id.allowNull).toBe(true);
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
