import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(
  __dirname,
  '../migrations/20260730000002-create-tenant-revenue-settlement.cjs'
);
const content = fs.readFileSync(migrationPath, 'utf8');
const fulfillmentGateMigration = fs.readFileSync(path.resolve(
  __dirname,
  '../migrations/20260731000001-gate-tenant-revenue-by-fulfillment.cjs'
), 'utf8');

describe('Tenant revenue settlement migration contract', () => {
  it('creates normalized policy, transaction, ledger, batch, payout, adjustment, and reconciliation tables', () => {
    [
      'tenant_revenue_fee_policies',
      'tenant_revenue_transactions',
      'tenant_revenue_ledger_entries',
      'tenant_settlement_batches',
      'tenant_settlement_batch_items',
      'tenant_settlement_batch_ledger_items',
      'tenant_payouts',
      'tenant_revenue_adjustments',
      'tenant_revenue_reconciliation_records'
    ].forEach((table) => expect(content).toContain(`'${table}'`));
  });

  it('uses integer centavos and idempotency constraints for posted financial records', () => {
    expect(content).toContain('gross_amount_centavos');
    expect(content).toContain('tenant_net_payable_centavos');
    expect(content).toContain('uq_tenant_revenue_ledger_idempotency');
    expect(content).toContain('uq_tenant_payout_idempotency');
    expect(content).toContain('uq_tenant_revenue_transaction_provider_payment');
    expect(content).toContain('uq_tenant_settlement_batch_ledger_entry');
  });

  it('protects financial history from destructive rollback', () => {
    expect(content).toContain('Financial settlement migration is intentionally irreversible');
  });

  it('holds paid revenue until the related order completes fulfillment', () => {
    expect(fulfillmentGateMigration).toContain('fulfillment_status');
    expect(fulfillmentGateMigration).toContain("defaultValue: 'pending'");
    expect(fulfillmentGateMigration).toContain("settlement_status = 'on_hold'");
    expect(fulfillmentGateMigration).toContain('idx_tenant_revenue_fulfillment_settlement');
  });
});
