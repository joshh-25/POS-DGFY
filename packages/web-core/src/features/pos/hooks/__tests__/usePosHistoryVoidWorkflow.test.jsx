/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    fetchPosTransactionById,
    fetchPosTransactions,
    fetchPosVoidApprovals,
    decidePosVoidApproval,
    recordExternalPosTransactionRefund,
    refundCashPosTransaction,
    refundProviderPosTransaction,
    reversePosSplitAllocation,
    voidPosTransaction
} from '../../services/posService';
import { usePosHistoryVoidWorkflow } from '../usePosHistoryVoidWorkflow.js';

vi.mock('../../services/posService', () => ({
    fetchPosTransactionById: vi.fn(),
    fetchPosTransactions: vi.fn(),
    fetchPosVoidApprovals: vi.fn(),
    decidePosVoidApproval: vi.fn(),
    recordExternalPosTransactionRefund: vi.fn(),
    refundCashPosTransaction: vi.fn(),
    refundProviderPosTransaction: vi.fn(),
    reversePosSplitAllocation: vi.fn(),
    voidPosTransaction: vi.fn()
}));

const completedRow = {
    pos_transaction_id: 7,
    invoice_number: 'NFS-000007',
    status: 'completed',
    payment_status: 'paid',
    payment_type: 'cash',
    created_at: '2026-08-18T10:00:00.000Z'
};

const renderHistory = (overrides = {}) => renderHook(() => usePosHistoryVoidWorkflow({
    canViewHistory: true,
    currentViewMode: 'checkout',
    selectedLocationId: 3,
    normalizedTerminalId: 'COUNTER-01',
    ...overrides
}));

describe('usePosHistoryVoidWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        fetchPosTransactions.mockResolvedValue({
            transactions: [completedRow],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
        });
        fetchPosTransactionById.mockResolvedValue(completedRow);
        fetchPosVoidApprovals.mockResolvedValue({ approvals: [] });
        decidePosVoidApproval.mockResolvedValue({ approval_request: { status: 'executed' } });
        voidPosTransaction.mockResolvedValue({ transaction: { ...completedRow, status: 'voided' } });
        refundCashPosTransaction.mockResolvedValue({ transaction: { ...completedRow, payment_status: 'refunded' } });
        recordExternalPosTransactionRefund.mockResolvedValue({ transaction: { ...completedRow, payment_status: 'refund_pending' } });
        refundProviderPosTransaction.mockResolvedValue({ transaction: { ...completedRow, payment_status: 'refund_pending' } });
        reversePosSplitAllocation.mockResolvedValue({ transaction: { ...completedRow, payment_status: 'partial_refunded' } });
    });

    it('loads server history with the existing completed-sales query contract', async () => {
        const { result } = renderHistory({
            historySearch: undefined
        });

        await act(async () => {
            await result.current.loadHistory(2);
        });

        expect(fetchPosTransactions).toHaveBeenCalledWith(expect.objectContaining({
            page: 2,
            limit: 20,
            status: 'completed',
            payment_status: 'paid',
            location_id: 3
        }));
        expect(result.current.historyRows).toEqual([completedRow]);
        expect(result.current.historyPagination).toMatchObject({
            page: 2,
            total: 1,
            totalPages: 1
        });
    });

    it('merges pending offline checkout history into the first page', async () => {
        const { result } = renderHistory({
            queuedCheckouts: [{
                operation: 'checkout',
                queued_at: '2026-08-18T11:00:00.000Z',
                payload: {
                    offline_history_snapshot: {
                        pos_transaction_id: 'offline-checkout-1',
                        invoice_number: 'PENDING-000001',
                        status: 'pending_sync',
                        payment_status: 'pending_sync',
                        created_at: '2026-08-18T11:00:00.000Z'
                    }
                }
            }]
        });

        await act(async () => {
            await result.current.loadHistory(1);
        });

        expect(result.current.historyRows.map((row) => row.invoice_number)).toEqual([
            'PENDING-000001',
            'NFS-000007'
        ]);
        expect(result.current.historyPagination.total).toBe(2);
    });

    it('allows an administrator to void without creating an administrator shift', async () => {
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: null
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Administrator correction'
            );
        });

        expect(voidPosTransaction).toHaveBeenCalledWith(7, {
            reason: 'Administrator correction',
            terminal_id: 'COUNTER-01'
        });
        expect(voidPosTransaction.mock.calls[0][1]).not.toHaveProperty('shift_id');
        expect(fetchPosTransactions).toHaveBeenCalled();
        expect(result.current.voidingTransactionId).toBe(null);
    });

    it('sends the refund passcode with a selected item void', async () => {
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: false,
            activeShiftId: 42
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Customer refund approved',
                [{ line_id: 12, quantity: 1 }],
                '2468'
            );
        });

        expect(voidPosTransaction).toHaveBeenCalledWith(7, expect.objectContaining({
            reason: 'Customer refund approved',
            refund_passcode: '2468',
            voided_lines: [{ line_id: 12, quantity: 1 }],
            shift_id: 42
        }));
    });

    it('refreshes the parent financial context after a successful void', async () => {
        const onFinancialMutationCompleted = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: 42,
            onFinancialMutationCompleted
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Correct duplicate sale'
            );
        });

        expect(onFinancialMutationCompleted).toHaveBeenCalledWith(expect.objectContaining({
            pos_transaction_id: 7,
            status: 'voided'
        }));
    });

    it('does not treat a pending manager request as an executed void', async () => {
        const onFinancialMutationCompleted = vi.fn().mockResolvedValue(undefined);
        voidPosTransaction.mockResolvedValue({ pending: true, approval_request: { status: 'pending' } });
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: 42,
            onFinancialMutationCompleted
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Correct duplicate sale'
            );
        });

        expect(onFinancialMutationCompleted).not.toHaveBeenCalled();
        expect(fetchPosTransactions).toHaveBeenCalled();
        expect(result.current.voidingTransactionId).toBe(null);
    });

    it('opens the inline POS approval popup when the canonical void request is pending', async () => {
        const approvalRequest = {
            business_admin_approval_request_id: 501,
            action_type: 'pos_void',
            entity_id: 7,
            requested_by: 10,
            status: 'pending',
            reason: 'Correct duplicate sale',
            payload: { transaction_id: 7, amount: 75, invoice_number: 'NFS-000007' }
        };
        voidPosTransaction.mockResolvedValue({ pending: true, approval_request: approvalRequest });
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: 42,
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Correct duplicate sale'
            );
        });

        expect(result.current.voidApprovalDialogOpen).toBe(true);
        expect(result.current.voidApprovalSelectedRequest).toEqual(approvalRequest);
        expect(fetchPosVoidApprovals).toHaveBeenCalledWith({ status: 'pending', limit: 100 });
    });

    it('uses the canonical approval decision endpoint and refreshes totals after approval', async () => {
        const approvalRequest = {
            business_admin_approval_request_id: 501,
            action_type: 'pos_void',
            entity_id: 7,
            requested_by: 10,
            status: 'pending',
            reason: 'Correct duplicate sale',
            payload: { transaction_id: 7, amount: 75 }
        };
        const onFinancialMutationCompleted = vi.fn().mockResolvedValue(undefined);
        decidePosVoidApproval.mockResolvedValue({
            approval_request: { ...approvalRequest, status: 'executed' },
            transaction: { ...completedRow, status: 'voided' }
        });
        const { result } = renderHistory({
            currentViewMode: 'history',
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: 42,
            inlineVoidApprovalEnabled: true,
            canReviewVoidApprovals: true,
            onFinancialMutationCompleted
        });

        await act(async () => {
            await result.current.decideVoidApproval(approvalRequest, 'approve', 'Manager reviewed');
        });

        expect(decidePosVoidApproval).toHaveBeenCalledWith(501, 'approve', { note: 'Manager reviewed' });
        expect(onFinancialMutationCompleted).toHaveBeenCalledWith(expect.objectContaining({
            pos_transaction_id: 7
        }));
        expect(fetchPosVoidApprovals).toHaveBeenCalledWith({ status: 'pending', limit: 100 });
    });

    it('approves a parked-sale cancellation without trying to refresh it as a transaction', async () => {
        const approvalRequest = {
            business_admin_approval_request_id: 503,
            action_type: 'pos_parked_sale_cancel',
            entity_type: 'pos_parked_sale',
            entity_id: 33,
            requested_by: 10,
            status: 'pending',
            payload: { parked_sale_id: 33, park_reference: 'PARK-00033' }
        };
        const onFinancialMutationCompleted = vi.fn().mockResolvedValue(undefined);
        const { result } = renderHistory({
            currentViewMode: 'history',
            canReviewVoidApprovals: true,
            inlineVoidApprovalEnabled: true,
            onFinancialMutationCompleted
        });

        await act(async () => {
            await result.current.decideVoidApproval(approvalRequest, 'approve', 'Manager reviewed');
        });

        expect(decidePosVoidApproval).toHaveBeenCalledWith(503, 'approve', { note: 'Manager reviewed' });
        expect(fetchPosTransactionById).not.toHaveBeenCalled();
        expect(onFinancialMutationCompleted).not.toHaveBeenCalled();
    });

    it('blocks a cashier void when the cashier has no open shift', async () => {
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: false,
            activeShiftId: null
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Cashier correction'
            );
        });

        expect(voidPosTransaction).not.toHaveBeenCalled();
        expect(result.current.voidingTransactionId).toBe(null);
    });

    it('includes the active cashier shift when a cashier void is allowed', async () => {
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: false,
            activeShiftId: 42
        });

        await act(async () => {
            await result.current.handleVoidHistoryTransaction(
                { pos_transaction_id: 7 },
                'Cashier correction'
            );
        });

        expect(voidPosTransaction).toHaveBeenCalledWith(7, {
            reason: 'Cashier correction',
            terminal_id: 'COUNTER-01',
            shift_id: 42
        });
    });

    it('records a cash refund only against the currently open refunding shift', async () => {
        fetchPosTransactionById.mockResolvedValue({
            ...completedRow,
            status: 'voided',
            financial_outcome: { next_action: 'record_cash_refund_with_cash_drawer_event' }
        });
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: 42
        });

        await act(async () => {
            await result.current.openHistoryRefundWorkflow(completedRow);
        });
        await act(async () => {
            await result.current.submitHistoryRefundWorkflow({ workflow: 'cash', reason: 'Customer return' });
        });

        expect(refundCashPosTransaction).toHaveBeenCalledWith(7, expect.objectContaining({
            reason: 'Customer return',
            shift_id: 42,
            terminal_id: 'COUNTER-01',
            idempotency_key: expect.stringMatching(/^pos-refund-7-/)
        }));
        expect(result.current.refundWorkflowTransaction).toBe(null);
    });

    it('records external reversal evidence without inventing an admin shift', async () => {
        fetchPosTransactionById.mockResolvedValue({
            ...completedRow,
            status: 'voided',
            payment_type: 'gcash',
            financial_outcome: { next_action: 'record_external_reversal_reference' }
        });
        const { result } = renderHistory({
            canVoidTransactions: true,
            isAdminOperator: true,
            activeShiftId: null
        });

        await act(async () => {
            await result.current.openHistoryRefundWorkflow(completedRow);
        });
        await act(async () => {
            await result.current.submitHistoryRefundWorkflow({
                workflow: 'external',
                reason: 'Customer return',
                externalReference: 'GCASH-REV-100',
                completionConfirmed: false
            });
        });

        expect(recordExternalPosTransactionRefund).toHaveBeenCalledWith(7, expect.objectContaining({
            external_reference: 'GCASH-REV-100',
            completion_confirmed: false,
            terminal_id: 'COUNTER-01'
        }));
        expect(recordExternalPosTransactionRefund.mock.calls[0][1].shift_id).toBeUndefined();
    });
});
