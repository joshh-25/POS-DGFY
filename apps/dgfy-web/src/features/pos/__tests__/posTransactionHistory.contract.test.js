import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const panelContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSTransactionHistoryPanel.jsx'),
    'utf8'
);
const receiptDialogsContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx'),
    'utf8'
);
const terminalContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminal.jsx'),
    'utf8'
);
const historyWorkflowContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/hooks/usePosHistoryVoidWorkflow.js'),
    'utf8'
);
const queryContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/utils/posHistoryQuery.js'),
    'utf8'
);
const searchUtilityContent = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/utils/posHistorySearch.js'),
    'utf8'
);

describe('POS transaction history search and filter contract', () => {
    it('keeps tablet history action controls readable without shrinking or wrapping', () => {
        expect(panelContent).toContain("isTabletViewport ? 'min-w-[980px]' : 'min-w-[1220px]'");
        expect(panelContent).toContain("isTabletViewport ? 'w-[15rem] min-w-[15rem]' : 'w-[10rem] min-w-[10rem]'");
        expect(panelContent).toContain('flex flex-nowrap justify-center gap-2');
        expect(panelContent).toContain('w-[4.75rem] shrink-0');
        expect(panelContent).toContain('shrink-0 whitespace-nowrap');
    });

    it('renders a visible void status and audit details for voided transactions', () => {
        expect(panelContent).toContain('<th scope="col" className="px-4 py-4 text-left text-[13px] font-black">Status</th>');
        expect(panelContent).toContain('data-testid={`pos-void-status-${row.pos_transaction_id}`}');
        expect(panelContent).toContain('resolvePosVoidReason(row)');
        expect(panelContent).toContain('resolvePosVoidActorLabel(row)');
        expect(panelContent).toContain('formatPosVoidTimestamp(row.voided_at)');
        expect(panelContent).toContain('Voided transaction');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-audit-panel"');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-status-badge"');
        expect(receiptDialogsContent).toContain('data-testid="pos-void-financial-outcome"');
        expect(receiptDialogsContent).toContain('Financial follow-up');
        expect(receiptDialogsContent).toContain('data-testid="pos-refund-adjustment-audit"');
        expect(panelContent).toContain('Resolve refund for');
        expect(panelContent).toContain('<POSRefundWorkflowDialog');
        expect(receiptDialogsContent).toContain('This transaction is no longer an active sale.');
    });

    it('exposes Employee Credit and cashier-name filters in the POS history panel', () => {
        expect(panelContent).toContain('<option value="employee_credit">Employee Credit</option>');
        expect(panelContent).toContain('Search all transaction fields...');
        expect(panelContent).toContain('Cashier Name');
        expect(panelContent).toContain('type="search"');
        expect(panelContent).toContain('Search cashier name...');
        expect(panelContent).not.toContain('Cashier ID');
        expect(panelContent).not.toContain('Search cashier ID...');
    });

    it('passes cashier names through the POS history query and searches displayed transaction data', () => {
        expect(queryContent).toContain('cashier_name: cashierName');
        expect(queryContent).not.toContain('cashier_id: cashierId');
        expect(terminalContent).toContain('historyCashierName');
        expect(historyWorkflowContent).toContain('rowMatchesHistoryFilters');
        expect(searchUtilityContent).toContain("'employee_credit_employee_name_snapshot'");
        expect(searchUtilityContent).toContain("'discount.employee_name'");
        expect(searchUtilityContent).toContain("'total_amount'");
    });
});
