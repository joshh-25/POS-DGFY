import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const panelPath = path.resolve(__dirname, '../TenantRevenueSettlementPanel.jsx');
const panel = fs.readFileSync(panelPath, 'utf8');

describe('Tenant revenue settlement admin contract', () => {
    it('shows the approved non-split collection model and guarded automatic payout state', () => {
        expect(panel).toContain('PayMongo split payments are not used');
        expect(panel).toContain('Automatic payout is locked pending external approval');
        expect(panel).toContain('automatic_payout_enabled: false');
    });

    it('provides immutable fee history, transactions, settlement, and reconciliation views', () => {
        expect(panel).toContain("id: 'transactions'");
        expect(panel).toContain("id: 'settlements'");
        expect(panel).toContain("id: 'reconciliation'");
        expect(panel).toContain("id: 'configuration'");
        expect(panel).toContain('Fee configuration history');
    });

    it('keeps financial values in centavos until display formatting', () => {
        expect(panel).toContain('dgfy_rate_bps');
        expect(panel).toContain('minimum_payout_centavos');
        expect(panel).toContain('tenant_net_payable_centavos');
    });

    it('hydrates the editor from the latest saved tenant policy', () => {
        expect(panel).toContain('policyToEditableForm(latestPolicy, today())');
        expect(panel).toContain('Latest saved');
    });

    it('supports all required transaction filters and method-specific provider fallbacks', () => {
        [
            'company_id',
            'branch_id',
            'payment_method',
            'payment_status',
            'settlement_status',
            'provider_payment_id',
            'settlement_reference'
        ].forEach((filter) => expect(panel).toContain(filter));
        expect(panel).toContain('fallback_method');
        expect(panel).toContain('fallback_rate_percentage');
        expect(panel).toContain('fallback_fixed_pesos');
    });

    it('provides an internal reconciliation action in addition to statement import', () => {
        expect(panel).toContain('runTenantRevenueInternalReconciliation');
        expect(panel).toContain('Internal ledger and payout audit');
        expect(panel).toContain('PayMongo statement reconciliation');
    });
});
